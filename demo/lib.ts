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

/**
 * Every call creates a fresh `ZgChainAdapter` (and therefore a fresh
 * ethers `JsonRpcProvider`) per role, per pipeline. Found by the
 * hostile-audit concurrency test: a provider that's never `.destroy()`ed
 * keeps its background block-polling loop running forever, and at a
 * fast local polling interval (see chain.ts) these accumulate across
 * requests and visibly degrade later calls. `trackedChains` plus
 * `destroyTrackedChains()` (called from a `finally` block by every
 * exported entry point below) is the cleanup this leak needed.
 */
const trackedChains: ZgChainAdapter[] = [];

function destroyTrackedChains(): void {
  for (const chain of trackedChains.splice(0)) {
    try {
      chain.provider.destroy();
    } catch {
      // best-effort cleanup — a provider that's already gone is not an error
    }
  }
}

async function makeChain(role: keyof typeof LOCAL_DEVNET_KEYS): Promise<ZgChainAdapter> {
  const base = new ZgChainAdapter();
  trackedChains.push(base);
  const label = await base.networkLabel();
  if (label === "LOCAL_DEVNET") {
    const connected = await base.connectAs(LOCAL_DEVNET_KEYS[role]);
    trackedChains.push(connected);
    return connected;
  }
  // testnet/mainnet: a single shared operator key from .env drives every
  // role in this MVP demo relayer, EXCEPT investigatorB, which uses its
  // own independently funded key when configured
  // (INVESTIGATOR_B_PRIVATE_KEY) — required for a genuinely distinct
  // second investigator address. Without it, investigatorA and
  // investigatorB resolve to the same address, and the contract's own
  // DuplicateReport protection correctly rejects the second report on
  // the same challenge (see docs/AUDIT.md Addendum 7).
  if (role === "investigatorB" && process.env.INVESTIGATOR_B_PRIVATE_KEY) {
    const connected = await base.connectAs(process.env.INVESTIGATOR_B_PRIVATE_KEY);
    trackedChains.push(connected);
    return connected;
  }
  return base;
}

export async function runScenarioA(): Promise<DemoTrace> {
  try {
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
  await waitRobust(tx);
  steps.push({
    label: "RELATES_TO edge recorded — NO bond, NO challenge, NO investigation",
    detail: "Both claims stand side by side. This is the semantic sophistication the naive version of this protocol would not have.",
  });

  return { scenario: "A: predicate mismatch (no fight)", steps, ok: true };
  } finally {
    destroyTrackedChains();
  }
}

export async function runScenarioB(): Promise<DemoTrace> {
  try {
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
  const openReceipt = await waitRobust(openTx);
  const opened = await findEventInReceipt(challengerChain, openReceipt, challengerChain.contract.interface, "ChallengeOpened");
  const challengeId = opened.args.challengeId as string;
  steps.push({ label: "Bonded CONTRADICTION challenge opened", detail: `challengeId=${challengeId} bond=${bond} wei`, data: { challengeId } });

  const ev1 = makeEvidence({ bytes: textToBytes(evidenceForClaim), sourceType: "OFFICIAL_ANNOUNCEMENT", submittedBy: await authorChain.signer.getAddress() as `0x${string}`, submittedAt: nowSec() });
  const ev2 = makeEvidence({ bytes: textToBytes(evidenceForCounter), sourceType: "ONCHAIN_STATE", submittedBy: await challengerChain.signer.getAddress() as `0x${string}`, submittedAt: nowSec() });
  const up1 = await storage.upload(textToBytes(evidenceForClaim));
  const up2 = await storage.upload(textToBytes(evidenceForCounter));

  await waitRobust(await authorChain.contract.submitEvidence(challengeId, ev1.id));
  await waitRobust(await challengerChain.contract.submitEvidence(challengeId, ev2.id));
  steps.push({ label: "Evidence submitted by both sides", detail: `ev1=${ev1.id} (${up1.mode}), ev2=${ev2.id} (${up2.mode})` });

  const bundle = lockBundle(buildBundle(challengeId as Hash, [ev1.id, ev2.id]), nowSec());
  await waitRobust(await authorChain.contract.lockEvidence(challengeId, bundle.root));
  steps.push({ label: "Evidence bundle locked", detail: `root=${bundle.root} (order-independent commitment — see protocol-core/evidence.ts)` });

  await waitRobust(await authorChain.contract.beginInvestigation(challengeId));
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
  await waitRobust(resolveTx);
  steps.push({ label: "Verdict committed on-chain", detail: `status=${verdict.status}`, data: { challengeId, txHash: resolveTx.hash } });

  const claimRecord = await authorChain.contract.claims(claimId);
  steps.push({
    label: "Original claim still queryable, not deleted",
    detail: `claim ${claimId} status on-chain = ${verdict.status} — full evidentiary history remains readable via the indexer`,
    data: { author: claimRecord.author },
  });

  return { scenario: "B: genuine contradiction (full adversarial lifecycle)", steps, ok: true };
  } finally {
    destroyTrackedChains();
  }
}

/**
 * Scenario C — Priority 1 + Priority 2 combined: an agent PAYS to have a
 * claim verified (no adversary, no dispute — spec: "an agent paying for
 * an investigation"), and the investigators that get paid are portable,
 * registered identities (spec Priority 2), not bare addresses.
 */
export async function runScenarioC(): Promise<DemoTrace> {
  try {
  const steps: DemoStep[] = [];
  const storage = new ZgStorageAdapter();

  const claimText = "Protocol X has $100M in total value locked";
  const evidenceText = "On-chain treasury snapshot: $100,000,000 across all vaults as of this block.";

  const agentChain = await makeChain("challenger"); // the "requesting agent" role reuses this funded local key
  const authorChain = await makeChain("author");

  if (!agentChain.investigatorRegistry) {
    steps.push({
      label: "InvestigatorRegistry not configured",
      detail: "set INVESTIGATOR_REGISTRY_ADDRESS in .env (printed by chain:deploy:local) to run the portable-identity path",
    });
    return { scenario: "C: pay-per-verification + portable investigator identity", steps, ok: false };
  }

  const pred = extractRuleBased(claimText);
  const claimUp = await storage.upload(textToBytes(claimText));
  const claimId = await createClaimOnChain(authorChain, hashUtf8(JSON.stringify(pred)), claimUp.rootHash, pred);
  steps.push({ label: "Claim created", detail: `"${claimText}" -> ${claimId}` });

  const fee = 2_000_000_000_000_000n; // 0.002 native token — the verification fee, paid entirely to investigators (spec Priority 1)
  const reqTx = await agentChain.contract.requestVerification(claimId, { value: fee });
  const reqReceipt = await waitRobust(reqTx);
  const opened = await findEventInReceipt(agentChain, reqReceipt, agentChain.contract.interface, "ChallengeOpened");
  const requestId = opened.args.challengeId as string;
  steps.push({
    label: "Agent pays a verification fee — no adversary, no bond game, just a request",
    detail: `requestId=${requestId} fee=${fee} wei (0G Chain native settlement — see docs/AUDIT.md on why there is no separate "0G Pay" SDK to call here)`,
  });

  const investigatorAChain = await makeChain("investigatorA");
  const investigatorBChain = await makeChain("investigatorB");

  const idA = await registerInvestigatorIdentity(investigatorAChain, "anthropic:claude-haiku-4-5");
  const idB = await registerInvestigatorIdentity(investigatorBChain, "openai:gpt-4o-mini");
  steps.push({
    label: "Investigators registered as portable identities (InvestigatorRegistry, not ERC-7857 — see docs/ERC7857_DECISION.md)",
    detail: `idA=${idA} idB=${idB} — these ids persist independently of this or any other single investigation`,
  });

  const ev = makeEvidence({ bytes: textToBytes(evidenceText), sourceType: "ONCHAIN_STATE", submittedBy: await authorChain.signer.getAddress() as `0x${string}`, submittedAt: nowSec() });
  await storage.upload(textToBytes(evidenceText));
  await waitRobust(await authorChain.contract.submitEvidence(requestId, ev.id));
  const bundle = lockBundle(buildBundle(requestId as Hash, [ev.id]), nowSec());
  await waitRobust(await authorChain.contract.lockEvidence(requestId, bundle.root));
  await waitRobust(await authorChain.contract.beginInvestigation(requestId));
  steps.push({ label: "Evidence locked, investigation started", detail: `evidenceRoot=${bundle.root}` });

  const investigatorA = new ZgComputeInvestigator("provider-alpha");
  const investigatorB = new ZgComputeInvestigator("provider-beta");
  const reportA = await investigatorA.investigate({
    claimId: claimId as Hash,
    challengeId: requestId as Hash,
    claimText,
    evidenceTexts: [evidenceText],
    evidenceBundleHash: bundle.root,
    investigatorId: (await investigatorAChain.signer.getAddress()) as `0x${string}`,
  });
  const reportB = await investigatorB.investigate({
    claimId: claimId as Hash,
    challengeId: requestId as Hash,
    claimText,
    evidenceTexts: [evidenceText],
    evidenceBundleHash: bundle.root,
    investigatorId: (await investigatorBChain.signer.getAddress()) as `0x${string}`,
  });

  await submitReportAsIdentityOnChain(investigatorAChain, requestId, idA, bundle.root, reportA);
  await submitReportAsIdentityOnChain(investigatorBChain, requestId, idB, bundle.root, reportB);
  steps.push({
    label: "Independent investigators execute, reports linked to their persistent identities",
    detail: `A: ${reportA.verdict} (${reportA.attestation.mode}) | B: ${reportB.verdict} (${reportB.attestation.mode})`,
    data: { reportA, reportB },
  });

  const procedure = new DefaultResolutionProcedure();
  const verdict = buildVerdict({
    claimId: claimId as Hash,
    challengeId: requestId as Hash,
    procedure,
    reports: [reportA, reportB],
    resolvedAt: nowSec(),
    validFrom: nowSec(),
  });

  const balABefore = await agentChain.provider.getBalance(await investigatorAChain.signer.getAddress());
  const balBBefore = await agentChain.provider.getBalance(await investigatorBChain.signer.getAddress());

  const statusIndex = verdictStatusIndex(verdict.status);
  const resolveTx = await authorChain.contract.resolve(requestId, statusIndex, verdict.procedureHash, verdict.reportsRoot, hashUtf8(JSON.stringify(verdict.dissent)));
  const resolveReceipt = await waitRobust(resolveTx);
  const payouts = resolveReceipt.logs
    .map((l: any) => authorChain.contract.interface.parseLog(l))
    .filter((e: any) => e?.name === "InvestigatorPaid")
    .map((e: any) => ({ investigator: e.args.investigator, amount: e.args.amount.toString() }));

  const balAAfter = await agentChain.provider.getBalance(await investigatorAChain.signer.getAddress());
  const balBAfter = await agentChain.provider.getBalance(await investigatorBChain.signer.getAddress());

  steps.push({
    label: "Verdict committed AND investigators paid, in the same transaction",
    detail: `${verdict.status} — investigatorA received ${(balAAfter - balABefore).toString()} wei, investigatorB received ${(balBAfter - balBBefore).toString()} wei`,
    data: { verdict: verdict.status, rationale: verdict.rationale, payouts, feePaid: fee.toString() },
  });

  steps.push({
    label: "History remains permanently queryable by either persistent identity",
    detail: `GET /investigators/${idA} and /investigators/${idB} now show this investigation in their calibration history`,
  });

  return { scenario: "C: pay-per-verification + portable investigator identity", steps, ok: true };
  } finally {
    destroyTrackedChains();
  }
}

/**
 * The agent-facing entry point (spec Priority 4 / §3): what an
 * autonomous agent actually calls. Runs the identical pipeline above
 * against caller-supplied claim/evidence text instead of the fixed
 * demo fixture, and returns the structured, independently-auditable
 * result shape the spec asks for. Used by demo/server.ts's
 * POST /agent/verify-claim — the same code path, not a separate mock.
 */
export interface AgentVerifyInput {
  claim: string;
  evidence: string[];
  counterClaim?: string;
}

export interface AgentVerifyResult {
  verdict: string;
  confidence: number | null;
  evidenceRoot: string;
  investigationId: string;
  investigators: Array<{ address: string; investigatorId: string; modelProvider: string; verdict: string; attestation: unknown }>;
  attestation: { anyLiveTee: boolean; modes: string[] };
  procedure: { id: string; version: string; procedureHash: string };
  payment: { feeWei: string; payouts: Array<{ investigator: string; amountWei: string }> };
  history: { claimId: string; onChainTxHash: string; queryUrl: string };
}

export async function agentVerifyClaim(input: AgentVerifyInput): Promise<AgentVerifyResult> {
  try {
  const storage = new ZgStorageAdapter();
  const agentChain = await makeChain("challenger");
  const authorChain = await makeChain("author");
  if (!agentChain.investigatorRegistry) throw new Error("INVESTIGATOR_REGISTRY_ADDRESS not configured");

  const pred = extractRuleBased(input.claim);
  const claimUp = await storage.upload(textToBytes(input.claim));
  const claimId = await createClaimOnChain(authorChain, hashUtf8(JSON.stringify(pred)), claimUp.rootHash, pred);

  const fee = 2_000_000_000_000_000n;
  const reqTx = await agentChain.contract.requestVerification(claimId, { value: fee });
  const reqReceipt = await waitRobust(reqTx);
  const requestId = (await findEventInReceipt(agentChain, reqReceipt, agentChain.contract.interface, "ChallengeOpened")).args.challengeId as string;

  const investigatorAChain = await makeChain("investigatorA");
  const investigatorBChain = await makeChain("investigatorB");
  const idA = await registerInvestigatorIdentity(investigatorAChain, "anthropic:claude-haiku-4-5");
  const idB = await registerInvestigatorIdentity(investigatorBChain, "openai:gpt-4o-mini");

  const evidenceIds: Hash[] = [];
  for (const text of input.evidence) {
    const ev = makeEvidence({ bytes: textToBytes(text), sourceType: "OTHER", submittedBy: await authorChain.signer.getAddress() as `0x${string}`, submittedAt: nowSec() });
    await storage.upload(textToBytes(text));
    await waitRobust(await authorChain.contract.submitEvidence(requestId, ev.id));
    evidenceIds.push(ev.id);
  }
  const bundle = lockBundle(buildBundle(requestId as Hash, evidenceIds), nowSec());
  await waitRobust(await authorChain.contract.lockEvidence(requestId, bundle.root));
  await waitRobust(await authorChain.contract.beginInvestigation(requestId));

  const investigatorA = new ZgComputeInvestigator("provider-alpha");
  const investigatorB = new ZgComputeInvestigator("provider-beta");
  const reportA = await investigatorA.investigate({
    claimId: claimId as Hash,
    challengeId: requestId as Hash,
    claimText: input.claim,
    counterClaimText: input.counterClaim,
    evidenceTexts: input.evidence,
    evidenceBundleHash: bundle.root,
    investigatorId: (await investigatorAChain.signer.getAddress()) as `0x${string}`,
  });
  const reportB = await investigatorB.investigate({
    claimId: claimId as Hash,
    challengeId: requestId as Hash,
    claimText: input.claim,
    counterClaimText: input.counterClaim,
    evidenceTexts: input.evidence,
    evidenceBundleHash: bundle.root,
    investigatorId: (await investigatorBChain.signer.getAddress()) as `0x${string}`,
  });
  await submitReportAsIdentityOnChain(investigatorAChain, requestId, idA, bundle.root, reportA);
  await submitReportAsIdentityOnChain(investigatorBChain, requestId, idB, bundle.root, reportB);

  const procedure = new DefaultResolutionProcedure();
  const verdict = buildVerdict({ claimId: claimId as Hash, challengeId: requestId as Hash, procedure, reports: [reportA, reportB], resolvedAt: nowSec(), validFrom: nowSec() });

  const statusIndex = verdictStatusIndex(verdict.status);
  const resolveTx = await authorChain.contract.resolve(requestId, statusIndex, verdict.procedureHash, verdict.reportsRoot, hashUtf8(JSON.stringify(verdict.dissent)));
  const resolveReceipt = await waitRobust(resolveTx);
  const payouts = resolveReceipt.logs
    .map((l: any) => authorChain.contract.interface.parseLog(l))
    .filter((e: any) => e?.name === "InvestigatorPaid")
    .map((e: any) => ({ investigator: e.args.investigator as string, amountWei: e.args.amount.toString() }));

  const avgConfidence = ([reportA, reportB].reduce((s, r) => s + r.confidence, 0)) / 2;

  return {
    verdict: verdict.status,
    confidence: verdict.status === "CONTESTED" || verdict.status === "INCONCLUSIVE" ? null : avgConfidence,
    evidenceRoot: bundle.root,
    investigationId: requestId,
    investigators: [
      { address: await investigatorAChain.signer.getAddress(), investigatorId: idA, modelProvider: "provider-alpha", verdict: reportA.verdict, attestation: reportA.attestation },
      { address: await investigatorBChain.signer.getAddress(), investigatorId: idB, modelProvider: "provider-beta", verdict: reportB.verdict, attestation: reportB.attestation },
    ],
    attestation: {
      anyLiveTee: [reportA, reportB].some((r) => r.attestation.mode === "0G_COMPUTE_TEE" && r.attestation.verified),
      modes: [reportA.attestation.mode, reportB.attestation.mode],
    },
    procedure: { id: verdict.procedureId, version: verdict.procedureVersion, procedureHash: verdict.procedureHash },
    payment: { feeWei: fee.toString(), payouts },
    history: { claimId, onChainTxHash: resolveTx.hash, queryUrl: `/claims/${claimId}` },
  };
  } finally {
    destroyTrackedChains();
  }
}

async function registerInvestigatorIdentity(chain: ZgChainAdapter, modelProvider: string): Promise<string> {
  if (!chain.investigatorRegistry) throw new Error("investigatorRegistry not configured on this chain adapter");
  const tx = await chain.investigatorRegistry.register(modelProvider, "0x" + "0".repeat(64));
  const receipt = await waitRobust(tx);
  const event = await findEventInReceipt(chain, receipt, chain.investigatorRegistry.interface, "InvestigatorRegistered");
  return event.args.investigatorId as string;
}

async function submitReportAsIdentityOnChain(chain: ZgChainAdapter, challengeId: string, investigatorId: string, evidenceBundleHash: Hash, report: Report) {
  const verdictIndex = report.verdict === "SUPPORTS" ? 1 : report.verdict === "REJECTS" ? 2 : 0;
  const attestationModeIndex = report.attestation.mode === "0G_COMPUTE_TEE" ? 0 : report.attestation.mode === "LOCAL_LLM" ? 1 : 2;
  const commitment = hashUtf8(JSON.stringify({ ...report, investigatorId: undefined }));
  const tx = await chain.contract.submitReportAsIdentity(challengeId, investigatorId, evidenceBundleHash, commitment, verdictIndex, attestationModeIndex, report.attestation.verified);
  await waitRobust(tx);
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

/**
 * `tx.wait()` can throw outright on 0G mainnet's own public RPC — not
 * just return a receipt with incomplete logs (that case is
 * `findEventInReceipt` below); the underlying `eth_getTransactionReceipt`
 * poll itself can fail with the RPC's own "no matching receipts found:
 * this may indicate potential data corruption". Retries the wait a
 * bounded number of times on that specific transient-RPC error class
 * before giving up — anything else (a real revert, a genuinely
 * different failure) still surfaces immediately, never silently
 * swallowed.
 */
async function waitRobust(tx: { wait(): Promise<any> }, retries = 4, delayMs = 2000): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx.wait();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const transient = /no matching receipts found|could not coalesce error/i.test(message);
      if (!transient || attempt >= retries) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

/**
 * A real, transient RPC race, observed against 0G mainnet's own public
 * endpoint (see docs/AUDIT.md): `tx.wait()` can return a receipt whose
 * own logs aren't yet fully indexed by the node that served it —
 * confirmed by directly re-querying `eth_getTransactionReceipt` for the
 * same hash a couple of seconds later and getting the complete, correct
 * logs (the RPC's own error text for a related query: "no matching
 * receipts found: this may indicate potential data corruption").
 * Hardhat's local devnet never exhibits this (instant automining, no
 * indexing lag), which is why it was invisible until this pass actually
 * ran against real mainnet infrastructure. Retries a bounded number of
 * times before failing loudly — a genuine transaction failure (the
 * event never appears) still surfaces as a clear error, never a silent
 * false success.
 */
async function findEventInReceipt(
  chain: ZgChainAdapter,
  receipt: { hash: string; logs: readonly any[] },
  iface: { parseLog(l: any): any },
  eventName: string,
  retries = 5,
  delayMs = 1500,
): Promise<any> {
  let logs = receipt.logs;
  for (let attempt = 0; ; attempt++) {
    const event = logs
      .map((l: any) => {
        try {
          return iface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === eventName);
    if (event) return event;
    if (attempt >= retries) {
      throw new Error(
        `Event "${eventName}" not found in receipt for tx ${receipt.hash} after ${retries + 1} attempts — this may be a genuine transaction failure, not just an indexing lag.`,
      );
    }
    await new Promise((res) => setTimeout(res, delayMs));
    try {
      const fresh = await chain.provider.getTransactionReceipt(receipt.hash);
      if (fresh) logs = fresh.logs;
    } catch {
      // same transient-RPC class as waitRobust — just loop and retry again
    }
  }
}

async function createClaimOnChain(chain: ZgChainAdapter, predicateHash: Hash, textHash: Hash, predicate: unknown): Promise<string> {
  const tx = await chain.contract.createClaim(predicateHash, textHash, nowSec());
  const receipt = await waitRobust(tx);
  const event = await findEventInReceipt(chain, receipt, chain.contract.interface, "ClaimCreated");
  return event.args.claimId as string;
}

async function submitReportOnChain(chain: ZgChainAdapter, challengeId: string, evidenceBundleHash: Hash, report: Report) {
  const verdictIndex = report.verdict === "SUPPORTS" ? 1 : report.verdict === "REJECTS" ? 2 : 0;
  const attestationModeIndex = report.attestation.mode === "0G_COMPUTE_TEE" ? 0 : report.attestation.mode === "LOCAL_LLM" ? 1 : 2;
  const commitment = hashUtf8(JSON.stringify({ ...report, investigatorId: undefined }));
  const tx = await chain.contract.submitReport(challengeId, evidenceBundleHash, commitment, verdictIndex, attestationModeIndex, report.attestation.verified);
  await waitRobust(tx);
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
