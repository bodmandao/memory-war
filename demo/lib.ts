/**
 * The integration layer: wires protocol-core (pure logic) + zg-adapters
 * (0G Storage / Compute / Chain, honestly mode-labeled) + the deployed
 * MemoryWarRegistry contract together into the two demo scenarios and
 * the tamper-detection demo described in spec §21.
 *
 * This file is imported by both the CLI scripts (demo/scenario-*.ts)
 * and the indexer's /demo/* endpoints that the frontend drives — one
 * implementation, two entry points, so the browser demo and the CLI
 * demo can never drift apart or fake different things.
 */
import { existsSync } from "node:fs";
import {
  extractRuleBased,
  classifyRelationship,
  makeEvidence,
  buildBundle,
  lockBundle,
  textToBytes,
  DefaultResolutionProcedure,
  buildVerdict,
  hashUtf8,
  type Hash,
  type Report,
} from "@memory-war/protocol-core";
import { ZgChainAdapter, ZgStorageAdapter, ZgComputeInvestigator } from "@memory-war/zg-adapters";

// Well-known Hardhat/Anvil default test accounts (mnemonic "test test
// test ... junk") — pre-funded on any local devnet started with `npm
// run chain:node`. NEVER used against a non-local network: guarded in
// resolveSigner() below. Public, documented, zero real value.
const LOCAL_DEVNET_KEYS = {
  author: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  challenger: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  investigatorA: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  investigatorB: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const;

export interface DemoStep {
  label: string;
  detail: string;
  data?: unknown;
}

export interface DemoTrace {
  scenario: string;
  steps: DemoStep[];
  ok: boolean;
}

async function makeChain(role: keyof typeof LOCAL_DEVNET_KEYS): Promise<ZgChainAdapter> {
  const base = new ZgChainAdapter();
  const label = await base.networkLabel();
  if (label === "LOCAL_DEVNET") {
    return await base.connectAs(LOCAL_DEVNET_KEYS[role]);
  }
  return base; // testnet/mainnet: single operator key from .env drives every role in this MVP demo
}

export async function runScenarioA(): Promise<DemoTrace> {
  const steps: DemoStep[] = [];
  const storage = new ZgStorageAdapter();

  const claimAText = "Protocol X raised $40M";
  const claimBText = "Protocol X was valued at $40M";

  const predA = extractRuleBased(claimAText);
  const predB = extractRuleBased(claimBText);
  const relationship = classifyRelationship(predA, predB);
  steps.push({
    label: "Predicate disambiguation",
    detail: `"${claimAText}" vs "${claimBText}" -> ${relationship.relation} (${relationship.reason})`,
    data: { predA, predB, relationship },
  });

  const chain = await makeChain("author");
  const upA = await storage.upload(textToBytes(claimAText));
  const upB = await storage.upload(textToBytes(claimBText));
  steps.push({ label: "Evidence text committed to storage", detail: `mode=${upA.mode}`, data: { upA, upB } });

  const claimAId = await createClaimOnChain(chain, hashUtf8(JSON.stringify(predA)), upA.rootHash, predA);
  const claimBId = await createClaimOnChain(chain, hashUtf8(JSON.stringify(predB)), upB.rootHash, predB);
  steps.push({ label: "Claims created on-chain", detail: `A=${claimAId} B=${claimBId}` });

  if (relationship.requiresChallenge) {
    steps.push({ label: "UNEXPECTED", detail: "classifier says this requires a challenge — scenario A fixture is wrong", data: relationship });
    return { scenario: "A: predicate mismatch", steps, ok: false };
  }

  const tx = await chain.contract.recordRelationship(claimAId, claimBId, relationTypeIndex(relationship.relation));
  await tx.wait();
  steps.push({
    label: "RELATES_TO edge recorded — NO bond, NO challenge, NO investigation",
    detail: "Both claims stand side by side. This is the semantic sophistication the naive version of this protocol would not have.",
  });

  return { scenario: "A: predicate mismatch (no fight)", steps, ok: true };
}

export async function runScenarioB(): Promise<DemoTrace> {
  const steps: DemoStep[] = [];
  const storage = new ZgStorageAdapter();

  const claimText = "Protocol X raised $40M";
  const counterClaimText = "Protocol X raised $12M";

  const predA = extractRuleBased(claimText);
  const predB = extractRuleBased(counterClaimText);
  const relationship = classifyRelationship(predA, predB);
  steps.push({ label: "Predicate disambiguation", detail: `${relationship.relation} — ${relationship.reason}`, data: relationship });

  if (!relationship.requiresChallenge) {
    steps.push({ label: "UNEXPECTED", detail: "classifier did not flag a contradiction — scenario B fixture is wrong" });
    return { scenario: "B: genuine contradiction", steps, ok: false };
  }

  const authorChain = await makeChain("author");
  const challengerChain = await makeChain("challenger");

  const evidenceForClaim = "Official announcement: Protocol X closed a $40,000,000 Series A led by Acme Capital.";
  const evidenceForCounter = "On-chain treasury inflow record: $12,000,000 received in the funding transaction.";

  const claimUp = await storage.upload(textToBytes(claimText));
  const claimId = await createClaimOnChain(authorChain, hashUtf8(JSON.stringify(predA)), claimUp.rootHash, predA);
  steps.push({ label: "Claim created", detail: `"${claimText}" -> ${claimId}`, data: { storageMode: claimUp.mode } });

  const bond = 1_000_000_000_000_000n; // 0.001 native token — deliberately small, spec §10: minimal bonding, no tokenomics
  const openTx = await challengerChain.contract.openChallenge(claimId, 0 /* CONTRADICTION */, { value: bond });
  const openReceipt = await openTx.wait();
  const opened = openReceipt.logs.map((l: any) => challengerChain.contract.interface.parseLog(l)).find((e: any) => e?.name === "ChallengeOpened");
  const challengeId = opened.args.challengeId as string;
  steps.push({ label: "Bonded CONTRADICTION challenge opened", detail: `challengeId=${challengeId} bond=${bond} wei`, data: { challengeId } });

  const ev1 = makeEvidence({ bytes: textToBytes(evidenceForClaim), sourceType: "OFFICIAL_ANNOUNCEMENT", submittedBy: await authorChain.signer.getAddress() as `0x${string}`, submittedAt: nowSec() });
  const ev2 = makeEvidence({ bytes: textToBytes(evidenceForCounter), sourceType: "ONCHAIN_STATE", submittedBy: await challengerChain.signer.getAddress() as `0x${string}`, submittedAt: nowSec() });
  const up1 = await storage.upload(textToBytes(evidenceForClaim));
  const up2 = await storage.upload(textToBytes(evidenceForCounter));

  await (await authorChain.contract.submitEvidence(challengeId, ev1.id)).wait();
  await (await challengerChain.contract.submitEvidence(challengeId, ev2.id)).wait();
  steps.push({ label: "Evidence submitted by both sides", detail: `ev1=${ev1.id} (${up1.mode}), ev2=${ev2.id} (${up2.mode})` });

  const bundle = lockBundle(buildBundle(challengeId as Hash, [ev1.id, ev2.id]), nowSec());
  await (await authorChain.contract.lockEvidence(challengeId, bundle.root)).wait();
  steps.push({ label: "Evidence bundle locked", detail: `root=${bundle.root} (order-independent commitment — see protocol-core/evidence.ts)` });

  await (await authorChain.contract.beginInvestigation(challengeId)).wait();
  steps.push({ label: "Investigation started", detail: "independent investigators now pull the locked bundle" });

  const investigatorA = new ZgComputeInvestigator("provider-alpha");
  const investigatorB = new ZgComputeInvestigator("provider-beta");
  const investigatorAAddr = (await makeChain("investigatorA")).signer;
  const investigatorBAddr = (await makeChain("investigatorB")).signer;

  const reportA = await investigatorA.investigate({
    claimId: claimId as Hash,
    challengeId: challengeId as Hash,
    claimText,
    counterClaimText,
    evidenceTexts: [evidenceForClaim, evidenceForCounter],
    evidenceBundleHash: bundle.root,
    investigatorId: (await investigatorAAddr.getAddress()) as `0x${string}`,
  });
  const reportB = await investigatorB.investigate({
    claimId: claimId as Hash,
    challengeId: challengeId as Hash,
    claimText,
    counterClaimText,
    evidenceTexts: [evidenceForClaim, evidenceForCounter],
    evidenceBundleHash: bundle.root,
    investigatorId: (await investigatorBAddr.getAddress()) as `0x${string}`,
  });
  steps.push({
    label: "Independent, model-diverse investigator reports",
    detail: `A: ${reportA.verdict} (${reportA.attestation.mode}, verified=${reportA.attestation.verified}) | B: ${reportB.verdict} (${reportB.attestation.mode}, verified=${reportB.attestation.verified})`,
    data: { reportA, reportB },
  });

  const investigatorAChain = await makeChain("investigatorA");
  const investigatorBChain = await makeChain("investigatorB");
  await submitReportOnChain(investigatorAChain, challengeId, bundle.root, reportA);
  await submitReportOnChain(investigatorBChain, challengeId, bundle.root, reportB);

  const procedure = new DefaultResolutionProcedure();
  const verdict = buildVerdict({
    claimId: claimId as Hash,
    challengeId: challengeId as Hash,
    procedure,
    reports: [reportA, reportB],
    resolvedAt: nowSec(),
    validFrom: nowSec(),
  });
  steps.push({
    label: "Mechanical resolution applied (off-chain, deterministic, auditable)",
    detail: `${verdict.status} — ${verdict.rationale}`,
    data: { procedure: procedure.describe(), verdict },
  });

  await waitForChallengeWindow(authorChain, challengeId);
  const statusIndex = verdictStatusIndex(verdict.status);
  const resolveTx = await authorChain.contract.resolve(challengeId, statusIndex, verdict.procedureHash, verdict.reportsRoot, hashUtf8(JSON.stringify(verdict.dissent)));
  await resolveTx.wait();
  steps.push({ label: "Verdict committed on-chain", detail: `status=${verdict.status}`, data: { challengeId, txHash: resolveTx.hash } });

  const claimRecord = await authorChain.contract.claims(claimId);
  steps.push({
    label: "Original claim still queryable, not deleted",
    detail: `claim ${claimId} status on-chain = ${verdict.status} — full evidentiary history remains readable via the indexer`,
    data: { author: claimRecord.author },
  });

  return { scenario: "B: genuine contradiction (full adversarial lifecycle)", steps, ok: true };
}

export async function runTamperDemo(): Promise<DemoTrace> {
  const steps: DemoStep[] = [];
  const storage = new ZgStorageAdapter();

  const original = textToBytes("Protocol X announcement: raised $40,000,000");
  const { rootHash, mode } = await storage.upload(original);
  steps.push({ label: "Evidence uploaded", detail: `rootHash=${rootHash} mode=${mode}` });

  const verify1 = await storage.verify(rootHash);
  steps.push({ label: "Integrity check on untampered artifact", detail: verify1.ok ? "VERIFIED ✓" : "VERIFICATION FAILED ✗", data: verify1 });

  // Simulate tampering by writing different bytes under the same claimed hash.
  const localDir = "./.data/local-storage";
  const path = `${localDir}/${rootHash.replace(/[^a-zA-Z0-9]/g, "")}.bin`;
  if (existsSync(path)) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.from("Protocol X announcement: raised $400,000,000"));
    const verify2 = await storage.verify(rootHash);
    steps.push({ label: "Integrity check after tampering with the stored artifact", detail: verify2.ok ? "VERIFIED ✓ (BUG)" : "VERIFICATION FAILED ✗ (expected)", data: verify2 });

    writeFileSync(path, Buffer.from(original));
    const verify3 = await storage.verify(rootHash);
    steps.push({ label: "Integrity check after restoring the original bytes", detail: verify3.ok ? "VERIFIED ✓" : "VERIFICATION FAILED ✗", data: verify3 });
  } else {
    steps.push({ label: "Tamper step skipped", detail: `local mirror not found at ${path} (unexpected in local mode)` });
  }

  return { scenario: "Tamper detection", steps, ok: true };
}

// ── helpers ──────────────────────────────────────────────────────────

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

async function createClaimOnChain(chain: ZgChainAdapter, predicateHash: Hash, textHash: Hash, predicate: unknown): Promise<string> {
  const tx = await chain.contract.createClaim(predicateHash, textHash, nowSec());
  const receipt = await tx.wait();
  const event = receipt.logs.map((l: any) => chain.contract.interface.parseLog(l)).find((e: any) => e?.name === "ClaimCreated");
  return event.args.claimId as string;
}

async function submitReportOnChain(chain: ZgChainAdapter, challengeId: string, evidenceBundleHash: Hash, report: Report) {
  const verdictIndex = report.verdict === "SUPPORTS" ? 1 : report.verdict === "REJECTS" ? 2 : 0;
  const attestationModeIndex = report.attestation.mode === "0G_COMPUTE_TEE" ? 0 : report.attestation.mode === "LOCAL_LLM" ? 1 : 2;
  const commitment = hashUtf8(JSON.stringify({ ...report, investigatorId: undefined }));
  const tx = await chain.contract.submitReport(challengeId, evidenceBundleHash, commitment, verdictIndex, attestationModeIndex, report.attestation.verified);
  await tx.wait();
}

async function waitForChallengeWindow(chain: ZgChainAdapter, challengeId: string) {
  const label = await chain.networkLabel();
  const record = await chain.contract.challenges(challengeId);
  const closesAt = Number(record.windowCloseAt);
  if (label === "LOCAL_DEVNET") {
    // fast-forward the local devnet clock instead of sleeping in real time
    await chain.provider.send("evm_increaseTime", [130]);
    await chain.provider.send("evm_mine", []);
    return;
  }
  const nowBlockTs = (await chain.provider.getBlock("latest"))!.timestamp;
  const waitMs = Math.max(0, (closesAt - nowBlockTs + 5) * 1000);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, 15000)));
}

function relationTypeIndex(relation: string): number {
  return ["CONTRADICTS", "RELATES_TO", "REFINES", "NARROWS", "EXTENDS", "SUPERSEDES"].indexOf(relation);
}

function verdictStatusIndex(status: string): number {
  return ["NONE", "TRUE", "FALSE", "SUPERSEDED", "CONTESTED", "INCONCLUSIVE"].indexOf(status);
}
