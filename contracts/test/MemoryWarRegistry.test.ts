import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { MemoryWarRegistry, InvestigatorRegistry } from "../typechain-types";

const h = (s: string) => ("0x" + Buffer.from(s.padEnd(32, "\0")).toString("hex")) as `0x${string}`;

describe("MemoryWarRegistry", () => {
  async function deploy() {
    const [author, challenger, investigatorA, investigatorB] = await ethers.getSigners();
    const RegistryFactory = await ethers.getContractFactory("InvestigatorRegistry");
    const investigatorRegistry = (await RegistryFactory.deploy()) as unknown as InvestigatorRegistry;
    await investigatorRegistry.waitForDeployment();

    const Factory = await ethers.getContractFactory("MemoryWarRegistry");
    const registry = (await Factory.deploy(await investigatorRegistry.getAddress())) as unknown as MemoryWarRegistry;
    await registry.waitForDeployment();
    return { registry, investigatorRegistry, author, challenger, investigatorA, investigatorB };
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
    // both REJECT — unanimous rejection is what legitimately resolves FALSE_ below (§ StatusMismatch)
    await registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a"), 2, 0, true);
    await registry.connect(investigatorB).submitReport(challengeId, h("bundle"), h("report-b"), 2, 0, true);

    await expect(registry.resolve(challengeId, 2, h("proc"), h("reports"), h("dissent"))).to.be.revertedWithCustomError(registry, "WindowNotClosed");

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
    const { registry, author, challenger, investigatorA, investigatorB } = await deploy();

    // Case 1: claim ends up FALSE — challenger was right, bond refunded.
    // Requires two unanimous REJECTS reports — resolve() now derives the
    // status from what was actually submitted, it no longer takes the
    // caller's word for it (see StatusMismatch).
    const claimA = await createClaim(registry, author, "A");
    const challengeA = await openChallenge(registry, challenger, claimA, ethers.parseEther("1"));
    await registry.lockEvidence(challengeA, h("root-a"));
    await registry.beginInvestigation(challengeA);
    await registry.connect(investigatorA).submitReport(challengeA, h("bundle-a"), h("report-a1"), 2, 0, true);
    await registry.connect(investigatorB).submitReport(challengeA, h("bundle-a"), h("report-a2"), 2, 0, true);
    await time.increase(2 * 60 + 1);
    const balBefore = await ethers.provider.getBalance(await challenger.getAddress());
    const tx1 = await registry.resolve(challengeA, 2 /* FALSE_ */, h("proc"), h("reports"), h("dissent"));
    await tx1.wait();
    const balAfter = await ethers.provider.getBalance(await challenger.getAddress());
    expect(balAfter).to.be.greaterThan(balBefore); // refunded

    // Case 2: claim ends up TRUE — challenger was wrong, bond forfeit (stays in contract).
    // Requires two unanimous SUPPORTS reports for the same reason.
    const claimB = await createClaim(registry, author, "B");
    const challengeB = await openChallenge(registry, challenger, claimB, ethers.parseEther("1"));
    await registry.lockEvidence(challengeB, h("root-b"));
    await registry.beginInvestigation(challengeB);
    await registry.connect(investigatorA).submitReport(challengeB, h("bundle-b"), h("report-b1"), 1, 0, true);
    await registry.connect(investigatorB).submitReport(challengeB, h("bundle-b"), h("report-b2"), 1, 0, true);
    await time.increase(2 * 60 + 1);
    // this test's own bond-forfeit assertion is the reason the investigator
    // fee share must be excluded here — measure investigator payouts out first
    const investigatorABalBefore = await ethers.provider.getBalance(await investigatorA.getAddress());
    await registry.resolve(challengeB, 1 /* TRUE_ */, h("proc"), h("reports"), h("dissent"));
    const investigatorABalAfter = await ethers.provider.getBalance(await investigatorA.getAddress());
    expect(investigatorABalAfter).to.be.greaterThan(investigatorABalBefore); // investigators are paid regardless of verdict
  });

  it("rejects resolving with a status that does not match the reports actually submitted (the forgery this pass exists to close)", async () => {
    const { registry, author, challenger, investigatorA, investigatorB } = await deploy();
    const claimId = await createClaim(registry, author, "forge-attempt");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await registry.lockEvidence(challengeId, h("root"));
    await registry.beginInvestigation(challengeId);
    // both investigators genuinely REJECT the claim...
    await registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a"), 2, 0, true);
    await registry.connect(investigatorB).submitReport(challengeId, h("bundle"), h("report-b"), 2, 0, true);
    await time.increase(2 * 60 + 1);
    // ...but a malicious/careless caller tries to resolve it TRUE_ anyway
    await expect(registry.resolve(challengeId, 1 /* TRUE_ */, h("proc"), h("reports"), h("dissent"))).to.be.revertedWithCustomError(
      registry,
      "StatusMismatch",
    );
  });

  it("rejects resolving to anything but INCONCLUSIVE when fewer than 2 reports were submitted", async () => {
    const { registry, author, challenger } = await deploy();
    const claimId = await createClaim(registry, author, "too-few-reports");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await registry.lockEvidence(challengeId, h("root"));
    await registry.beginInvestigation(challengeId);
    await time.increase(2 * 60 + 1);
    // zero reports submitted — TRUE_/FALSE_ must be unreachable
    await expect(registry.resolve(challengeId, 1 /* TRUE_ */, h("proc"), h("reports"), h("dissent"))).to.be.revertedWithCustomError(
      registry,
      "StatusMismatch",
    );
    await expect(registry.resolve(challengeId, 5 /* INCONCLUSIVE */, h("proc"), h("reports"), h("dissent"))).to.emit(registry, "Resolved");
  });

  it("rejects a report with an out-of-range verdict byte", async () => {
    const { registry, author, challenger, investigatorA } = await deploy();
    const claimId = await createClaim(registry, author, "bad-verdict");
    const challengeId = await openChallenge(registry, challenger, claimId);
    await registry.lockEvidence(challengeId, h("root"));
    await registry.beginInvestigation(challengeId);
    await expect(registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report"), 99, 0, true)).to.be.reverted;
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
    await registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a"), 1, 0, true);
    await registry.connect(investigatorB).submitReport(challengeId, h("bundle"), h("report-b"), 1, 0, true);
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

  // ── Priority-1: pay-per-verification ──────────────────────────────

  describe("requestVerification (pay-per-verification, no adversary)", () => {
    it("opens a VERIFICATION_REQUEST with no liveness window and pays 100% of the fee to investigators who reported", async () => {
      const { registry, author, investigatorA, investigatorB } = await deploy();
      const claimId = await createClaim(registry, author, "verify-me");

      const fee = ethers.parseEther("1");
      const tx = await registry.connect(author).requestVerification(claimId, { value: fee });
      const receipt = await tx.wait();
      const opened = receipt!.logs.map((l) => registry.interface.parseLog(l)).find((e) => e?.name === "ChallengeOpened")!;
      const requestId = opened.args.challengeId as string;
      expect(opened.args.challengeType).to.equal(2n); // VERIFICATION_REQUEST

      await registry.lockEvidence(requestId, h("verify-root"));
      await registry.beginInvestigation(requestId);

      // no window to wait out — resolve is immediately callable
      await registry.connect(investigatorA).submitReport(requestId, h("bundle"), h("report-a"), 1, 0, true);
      await registry.connect(investigatorB).submitReport(requestId, h("bundle"), h("report-b"), 1, 0, true);

      const balABefore = await ethers.provider.getBalance(await investigatorA.getAddress());
      const balBBefore = await ethers.provider.getBalance(await investigatorB.getAddress());

      await expect(registry.resolve(requestId, 1 /* TRUE_ */, h("proc"), h("reports"), h("dissent")))
        .to.emit(registry, "InvestigatorPaid")
        .withArgs(requestId, await investigatorA.getAddress(), fee / 2n, anyValue);

      const balAAfter = await ethers.provider.getBalance(await investigatorA.getAddress());
      const balBAfter = await ethers.provider.getBalance(await investigatorB.getAddress());
      expect(balAAfter - balABefore).to.equal(fee / 2n);
      expect(balBAfter - balBBefore).to.equal(fee / 2n);

      const contractBalAfter = await ethers.provider.getBalance(await registry.getAddress());
      expect(contractBalAfter).to.equal(0n); // the whole fee was distributed — nothing withheld for a nonexistent adversary
    });
  });

  describe("investigator fee on adversarial challenges", () => {
    it("pays investigators their 20% share regardless of verdict, then applies the existing win/lose rule to the remainder", async () => {
      const { registry, author, challenger, investigatorA, investigatorB } = await deploy();
      const claimId = await createClaim(registry, author, "adversarial");
      const bond = ethers.parseEther("1");
      const challengeId = await openChallenge(registry, challenger, claimId, bond);
      await registry.lockEvidence(challengeId, h("root"));
      await registry.beginInvestigation(challengeId);
      // unanimous REJECTS — legitimately resolves FALSE_ below
      await registry.connect(investigatorA).submitReport(challengeId, h("bundle"), h("report-a"), 2, 0, true);
      await registry.connect(investigatorB).submitReport(challengeId, h("bundle"), h("report-b"), 2, 0, true);
      await time.increase(2 * 60 + 1);

      const challengerBalBefore = await ethers.provider.getBalance(await challenger.getAddress());
      const investigatorABalBefore = await ethers.provider.getBalance(await investigatorA.getAddress());

      // FALSE_: challenger was right — gets the 80% remainder back, on top of investigators taking their 20%
      await registry.resolve(challengeId, 2 /* FALSE_ */, h("proc"), h("reports"), h("dissent"));

      const expectedInvestigatorShare = (bond * 2_000n) / 10_000n / 2n; // 20% split two ways
      const expectedRemainder = bond - expectedInvestigatorShare * 2n;

      const investigatorABalAfter = await ethers.provider.getBalance(await investigatorA.getAddress());
      expect(investigatorABalAfter - investigatorABalBefore).to.equal(expectedInvestigatorShare);

      const challengerBalAfter = await ethers.provider.getBalance(await challenger.getAddress());
      expect(challengerBalAfter - challengerBalBefore).to.equal(expectedRemainder);
    });
  });

  // ── Priority-2: portable investigator identity ────────────────────

  describe("submitReportAsIdentity + InvestigatorRegistry", () => {
    it("registers a persistent identity and links a report to it", async () => {
      const { registry, investigatorRegistry, author, challenger, investigatorA } = await deploy();
      const claimId = await createClaim(registry, author, "identity");
      const challengeId = await openChallenge(registry, challenger, claimId);
      await registry.lockEvidence(challengeId, h("root"));
      await registry.beginInvestigation(challengeId);

      // h("no-parent") is nonzero and unregistered — a genuinely absent parent must be bytes32(0), not just "some other id"
      await expect(investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", h("no-parent"))).to.be.reverted;

      const realRegTx = await investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", ethers.ZeroHash);
      const regReceipt = await realRegTx.wait();
      const registered = regReceipt!.logs
        .map((l) => investigatorRegistry.interface.parseLog(l))
        .find((e) => e?.name === "InvestigatorRegistered")!;
      const investigatorId = registered.args.investigatorId as string;
      expect(await investigatorRegistry.controllerOf(investigatorId)).to.equal(await investigatorA.getAddress());
      // regression: InvestigatorRegistered/ControllerRotated once used `uint64 at` as an
      // event param name, which ethers.js's Array-derived Result silently resolves to
      // Array.prototype.at instead of the field — see docs/AUDIT.md. Assert it's a real number.
      expect(registered.args.occurredAt).to.be.greaterThan(0n);
      const stored = await investigatorRegistry.investigators(investigatorId);
      expect(stored.registeredAt).to.be.greaterThan(0n);

      await expect(registry.connect(investigatorA).submitReportAsIdentity(challengeId, investigatorId, h("bundle"), h("report"), 1, 0, true))
        .to.emit(registry, "ReportIdentityLinked")
        .withArgs(challengeId, await investigatorA.getAddress(), investigatorId);
    });

    it("rejects submitReportAsIdentity from an address that does not control the identity", async () => {
      const { registry, investigatorRegistry, author, challenger, investigatorA, investigatorB } = await deploy();
      const claimId = await createClaim(registry, author, "identity-2");
      const challengeId = await openChallenge(registry, challenger, claimId);
      await registry.lockEvidence(challengeId, h("root"));
      await registry.beginInvestigation(challengeId);

      const regTx = await investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", ethers.ZeroHash);
      const regReceipt = await regTx.wait();
      const investigatorId = regReceipt!.logs
        .map((l) => investigatorRegistry.interface.parseLog(l))
        .find((e) => e?.name === "InvestigatorRegistered")!.args.investigatorId as string;

      await expect(
        registry.connect(investigatorB).submitReportAsIdentity(challengeId, investigatorId, h("bundle"), h("report"), 1, 0, true),
      ).to.be.revertedWithCustomError(registry, "NotInvestigatorController");
    });

    it("lets an identity's controller rotate to a new key without losing the identity", async () => {
      const { investigatorRegistry, investigatorA, investigatorB } = await deploy();
      const regTx = await investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", ethers.ZeroHash);
      const regReceipt = await regTx.wait();
      const investigatorId = regReceipt!.logs
        .map((l) => investigatorRegistry.interface.parseLog(l))
        .find((e) => e?.name === "InvestigatorRegistered")!.args.investigatorId as string;

      await investigatorRegistry.connect(investigatorA).rotateController(investigatorId, await investigatorB.getAddress());
      expect(await investigatorRegistry.controllerOf(investigatorId)).to.equal(await investigatorB.getAddress());

      await expect(
        investigatorRegistry.connect(investigatorA).rotateController(investigatorId, await investigatorA.getAddress()),
      ).to.be.revertedWithCustomError(investigatorRegistry, "NotController"); // the OLD controller lost control after rotating away
    });

    it("records explicit version lineage via parentId", async () => {
      const { investigatorRegistry, investigatorA } = await deploy();
      const v1Tx = await investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", ethers.ZeroHash);
      const v1Receipt = await v1Tx.wait();
      const v1Id = v1Receipt!.logs.map((l) => investigatorRegistry.interface.parseLog(l)).find((e) => e?.name === "InvestigatorRegistered")!
        .args.investigatorId as string;

      await expect(investigatorRegistry.connect(investigatorA).register("anthropic:claude-sonnet-5", v1Id))
        .to.emit(investigatorRegistry, "InvestigatorRegistered")
        .withArgs(anyValue, await investigatorA.getAddress(), "anthropic:claude-sonnet-5", v1Id, anyValue);
    });

    it("rejects claiming succession to an identity you do not control (lineage forgery)", async () => {
      const { investigatorRegistry, investigatorA, investigatorB } = await deploy();
      const v1Tx = await investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", ethers.ZeroHash);
      const v1Receipt = await v1Tx.wait();
      const v1Id = v1Receipt!.logs.map((l) => investigatorRegistry.interface.parseLog(l)).find((e) => e?.name === "InvestigatorRegistered")!
        .args.investigatorId as string;

      // investigatorB does not control v1Id (investigatorA does) — must not
      // be able to attach a new identity to investigatorA's reputation lineage
      await expect(
        investigatorRegistry.connect(investigatorB).register("openai:gpt-4o-mini", v1Id),
      ).to.be.revertedWithCustomError(investigatorRegistry, "NotController");
    });

    it("rejects rotating an identity's controller to the zero address", async () => {
      const { investigatorRegistry, investigatorA } = await deploy();
      const regTx = await investigatorRegistry.connect(investigatorA).register("anthropic:claude-haiku-4-5", ethers.ZeroHash);
      const regReceipt = await regTx.wait();
      const investigatorId = regReceipt!.logs
        .map((l) => investigatorRegistry.interface.parseLog(l))
        .find((e) => e?.name === "InvestigatorRegistered")!.args.investigatorId as string;

      await expect(investigatorRegistry.connect(investigatorA).rotateController(investigatorId, ethers.ZeroAddress)).to.be.reverted;
      // identity remains controllable — the rejected rotation did not partially apply
      expect(await investigatorRegistry.controllerOf(investigatorId)).to.equal(await investigatorA.getAddress());
    });
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
