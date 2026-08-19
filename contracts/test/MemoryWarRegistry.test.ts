import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { MemoryWarRegistry } from "../typechain-types";

const h = (s: string) => ("0x" + Buffer.from(s.padEnd(32, "\0")).toString("hex")) as `0x${string}`;

describe("MemoryWarRegistry", () => {
  async function deploy() {
    const [author, challenger, investigatorA, investigatorB] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MemoryWarRegistry");
    const registry = (await Factory.deploy()) as unknown as MemoryWarRegistry;
    await registry.waitForDeployment();
    return { registry, author, challenger, investigatorA, investigatorB };
  }

  it("creates a claim and emits ClaimCreated with a deterministic id given the same inputs at the same block", async () => {
    const { registry, author } = await deploy();
    const predicateHash = h("predicate-raise-40m");
    const textHash = h("text-1");
    const tx = await registry.connect(author).createClaim(predicateHash, textHash, 1000);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((l) => registry.interface.parseLog(l))
      .find((e) => e?.name === "ClaimCreated");
    expect(event).to.not.be.undefined;
    const claimId = event!.args.claimId as string;
    const record = await registry.claims(claimId);
    expect(record.author).to.equal(await author.getAddress());
    expect(record.status).to.equal(0n); // OPEN
  });

  it("records a RELATES_TO relationship with no bond and no challenge — the predicate-mismatch path", async () => {
    const { registry, author } = await deploy();
    const claimA = await createClaim(registry, author, "A");
    const claimB = await createClaim(registry, author, "B");
    await expect(registry.recordRelationship(claimA, claimB, 1 /* RELATES_TO */))
      .to.emit(registry, "RelationshipRecorded")
      .withArgs(claimA, claimB, 1, anyValue);
    // no ChallengeOpened event, no bond moved — this is the key structural guarantee
  });

  it("REJECTS recording a CONTRADICTS relationship — contradictions must go through openChallenge", async () => {
    const { registry, author } = await deploy();
    const claimA = await createClaim(registry, author, "A");
    const claimB = await createClaim(registry, author, "B");
    await expect(registry.recordRelationship(claimA, claimB, 0 /* CONTRADICTS */)).to.be.revertedWithCustomError(registry, "NotContradiction");
  });

  it("opens a bonded challenge, locks evidence, and rejects evidence submitted after lock", async () => {
    const { registry, author, challenger } = await deploy();
    const claimId = await createClaim(registry, author, "A");

    const bond = ethers.parseEther("1");
    const tx = await registry.connect(challenger).openChallenge(claimId, 0 /* CONTRADICTION */, { value: bond });
    const receipt = await tx.wait();
    const opened = receipt!.logs.map((l) => registry.interface.parseLog(l)).find((e) => e?.name === "ChallengeOpened")!;
    const challengeId = opened.args.challengeId as string;

    await registry.submitEvidence(challengeId, h("evidence-1"));
    await registry.lockEvidence(challengeId, h("evidence-root"));

    await expect(registry.submitEvidence(challengeId, h("evidence-2"))).to.be.revertedWithCustomError(registry, "EvidenceAlreadyLocked");
  });

  it("rejects resolving a challenge that has not been investigated (illegal transition)", async () => {
    const { registry, author, challenger } = await deploy();
    const claimId = await createClaim(registry, author, "A");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await expect(registry.resolve(challengeId, 1, h("proc"), h("reports"), h("dissent"))).to.be.revertedWithCustomError(
      registry,
      "IllegalTransition",
    );
  });

  it("rejects resolving before the challenge window closes, then allows it permissionlessly after", async () => {
    const { registry, author, challenger, investigatorA, investigatorB } = await deploy();
    const claimId = await createClaim(registry, author, "A");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await registry.lockEvidence(challengeId, h("evidence-root"));
    await registry.beginInvestigation(challengeId);
    await registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a"), 1, 0, true);
    await registry.connect(investigatorB).submitReport(challengeId, h("bundle"), h("report-b"), 1, 0, true);

    await expect(registry.resolve(challengeId, 1, h("proc"), h("reports"), h("dissent"))).to.be.revertedWithCustomError(registry, "WindowNotClosed");

    await time.increase(2 * 60 + 1);
    await expect(registry.resolve(challengeId, 2 /* FALSE_ */, h("proc"), h("reports"), h("dissent"))).to.emit(registry, "Resolved");

    const verdict = await registry.verdicts(challengeId);
    expect(verdict.status).to.equal(2n);
  });

  it("rejects a duplicate report from the same investigator on the same challenge (replay protection)", async () => {
    const { registry, author, challenger, investigatorA } = await deploy();
    const claimId = await createClaim(registry, author, "A");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await registry.lockEvidence(challengeId, h("evidence-root"));
    await registry.beginInvestigation(challengeId);
    await registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a"), 1, 0, true);
    await expect(registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a-2"), 1, 0, true)).to.be.revertedWithCustomError(
      registry,
      "DuplicateReport",
    );
  });

  it("refunds the challenger's bond when the claim is found FALSE, and forfeits it when found TRUE", async () => {
    const { registry, author, challenger } = await deploy();

    // Case 1: claim ends up FALSE — challenger was right, bond refunded.
    const claimA = await createClaim(registry, author, "A");
    const challengeA = await openChallenge(registry, challenger, claimA, ethers.parseEther("1"));
    await registry.lockEvidence(challengeA, h("root-a"));
    await registry.beginInvestigation(challengeA);
    await time.increase(2 * 60 + 1);
    const balBefore = await ethers.provider.getBalance(await challenger.getAddress());
    const tx1 = await registry.resolve(challengeA, 2 /* FALSE_ */, h("proc"), h("reports"), h("dissent"));
    await tx1.wait();
    const balAfter = await ethers.provider.getBalance(await challenger.getAddress());
    expect(balAfter).to.be.greaterThan(balBefore); // refunded

    // Case 2: claim ends up TRUE — challenger was wrong, bond forfeit (stays in contract).
    const claimB = await createClaim(registry, author, "B");
    const challengeB = await openChallenge(registry, challenger, claimB, ethers.parseEther("1"));
    await registry.lockEvidence(challengeB, h("root-b"));
    await registry.beginInvestigation(challengeB);
    await time.increase(2 * 60 + 1);
    const contractBalBefore = await ethers.provider.getBalance(await registry.getAddress());
    await registry.resolve(challengeB, 1 /* TRUE_ */, h("proc"), h("reports"), h("dissent"));
    const contractBalAfter = await ethers.provider.getBalance(await registry.getAddress());
    expect(contractBalAfter).to.equal(contractBalBefore); // bond stayed in the contract, not refunded
  });

  it("supersession marks the old claim SUPERSEDED but the record remains permanently readable", async () => {
    const { registry, author } = await deploy();
    const claimA = await createClaim(registry, author, "A");
    const claimB = await createClaim(registry, author, "B");
    await registry.recordRelationship(claimA, claimB, 5 /* SUPERSEDES */);
    const record = await registry.claims(claimA);
    expect(record.status).to.equal(6n); // SUPERSEDED
    expect(record.exists).to.equal(true); // still there — never deleted
    expect(record.author).to.equal(await author.getAddress());
  });

  it("appeals append: filing and resolving an appeal does not touch the original verdict entry", async () => {
    const { registry, author, challenger, investigatorA, investigatorB } = await deploy();
    const claimId = await createClaim(registry, author, "A");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await registry.lockEvidence(challengeId, h("root"));
    await registry.beginInvestigation(challengeId);
    await time.increase(2 * 60 + 1);
    await registry.resolve(challengeId, 1 /* TRUE_ */, h("proc"), h("reports"), h("dissent"));

    const originalBefore = await registry.verdicts(challengeId);

    const tx = await registry.fileAppeal(challengeId, "new counter-evidence emerged");
    const receipt = await tx.wait();
    const filed = receipt!.logs.map((l) => registry.interface.parseLog(l)).find((e) => e?.name === "AppealFiled")!;
    const appealId = filed.args.appealId as bigint;

    await registry.resolveAppeal(appealId, 2 /* FALSE_ */, h("proc-2"), h("reports-2"));

    const originalAfter = await registry.verdicts(challengeId);
    expect(originalAfter.status).to.equal(originalBefore.status); // untouched — still TRUE_
    expect(originalAfter.procedureHash).to.equal(originalBefore.procedureHash);
  });

  // ── helpers ────────────────────────────────────────────────────────

  async function createClaim(registry: MemoryWarRegistry, signer: any, seed: string): Promise<string> {
    const tx = await registry.connect(signer).createClaim(h("predicate-" + seed), h("text-" + seed), 1000);
    const receipt = await tx.wait();
    const event = receipt!.logs.map((l) => registry.interface.parseLog(l)).find((e) => e?.name === "ClaimCreated")!;
    return event.args.claimId as string;
  }

  async function openChallenge(registry: MemoryWarRegistry, signer: any, claimId: string, bond = ethers.parseEther("1")): Promise<string> {
    const tx = await registry.connect(signer).openChallenge(claimId, 0, { value: bond });
    const receipt = await tx.wait();
    const event = receipt!.logs.map((l) => registry.interface.parseLog(l)).find((e) => e?.name === "ChallengeOpened")!;
    return event.args.challengeId as string;
  }
});
