/**
 * Rebuilds the entire protocol read-model by replaying MemoryWarRegistry
 * events from the chain. This is the concrete proof of spec §5's
 * requirement: "A backend failure must not imply that the historical
 * protocol record disappeared." Delete `.data/`, restart the process,
 * and this file reconstructs identical state from the chain alone.
 */
import { Interface, type Log, type Provider } from "ethers";
import { MEMORY_WAR_ABI, INVESTIGATOR_REGISTRY_ABI } from "@memory-war/zg-adapters";

const CLAIM_STATUS = ["OPEN", "CHALLENGED", "EVIDENCE_LOCKED", "INVESTIGATING", "TRUE", "FALSE", "SUPERSEDED", "CONTESTED", "INCONCLUSIVE"] as const;
const CHALLENGE_TYPE = ["CONTRADICTION", "SOURCE_QUALITY", "VERIFICATION_REQUEST"] as const;
const CHALLENGE_STATE = ["OPEN", "EVIDENCE_LOCKED", "INVESTIGATING", "RESOLVED", "APPEALED"] as const;
const RELATIONSHIP = ["CONTRADICTS", "RELATES_TO", "REFINES", "NARROWS", "EXTENDS", "SUPERSEDES"] as const;
const VERDICT_STATUS = ["NONE", "TRUE", "FALSE", "SUPERSEDED", "CONTESTED", "INCONCLUSIVE"] as const;
const ATTESTATION_MODE = ["0G_COMPUTE_TEE", "LOCAL_LLM", "SIMULATED"] as const;

export interface IndexedClaim {
  id: string;
  predicateHash: string;
  textHash: string;
  author: string;
  createdAt: number;
  validFrom: number;
  validUntil: number | null;
  status: (typeof CLAIM_STATUS)[number];
  challengeIds: string[];
  relationships: Array<{ withClaimId: string; relation: (typeof RELATIONSHIP)[number]; direction: "outgoing" | "incoming"; at: number }>;
}

export interface IndexedReport {
  investigator: string;
  investigatorId: string | null; // set only if submitted via submitReportAsIdentity — links to IndexedInvestigator
  evidenceBundleHash: string;
  reportCommitment: string;
  verdict: number;
  attestationMode: (typeof ATTESTATION_MODE)[number];
  attestationVerified: boolean;
  at: number;
}

export interface IndexedInvestigator {
  id: string;
  controller: string;
  modelProvider: string;
  parentId: string | null; // version lineage — points at a prior IndexedInvestigator.id
  registeredAt: number;
  controllerHistory: Array<{ from: string; to: string; at: number }>;
  linkedReports: Array<{ challengeId: string; at: number }>; // raw pointers — calibration is computed at read time from these + the challenge's verdict
}

export interface IndexedChallenge {
  id: string;
  claimId: string;
  challengeType: (typeof CHALLENGE_TYPE)[number];
  challenger: string;
  bondWei: string;
  openedAt: number;
  windowCloseAt: number;
  evidenceRoot: string | null;
  state: (typeof CHALLENGE_STATE)[number];
  evidenceIds: string[];
  reports: IndexedReport[];
  verdict: {
    status: (typeof VERDICT_STATUS)[number];
    procedureHash: string;
    reportsRoot: string;
    dissentRoot: string;
    resolvedAt: number;
  } | null;
  appeals: Array<{ appealId: number; filedBy: string; filedAt: number; reason: string; resolved: boolean; newStatus?: (typeof VERDICT_STATUS)[number] }>;
  payouts: Array<{ investigator: string; amountWei: string; at: number }>;
}

export interface ProtocolState {
  claims: Map<string, IndexedClaim>;
  challenges: Map<string, IndexedChallenge>;
  investigators: Map<string, IndexedInvestigator>;
  lastBlock: number;
  eventCount: number;
}

export function emptyState(): ProtocolState {
  return { claims: new Map(), challenges: new Map(), investigators: new Map(), lastBlock: -1, eventCount: 0 };
}

const iface = new Interface(MEMORY_WAR_ABI);
const registryIface = new Interface(INVESTIGATOR_REGISTRY_ABI);

/**
 * Pure function: given all MemoryWarRegistry logs (in ascending
 * block/index order) and a starting state, returns the reconstructed
 * state. Deterministic and side-effect free — the same log sequence
 * always rebuilds the same state, which is what lets anyone audit the
 * indexer against the chain.
 */
export function applyLogs(logs: Log[], state: ProtocolState = emptyState()): ProtocolState {
  for (const log of logs) {
    const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) continue;
    applyEvent(state, parsed.name, parsed.args, log);
  }
  return state;
}

/** Same idea, for the separate InvestigatorRegistry contract's own logs. */
export function applyRegistryLogs(logs: Log[], state: ProtocolState = emptyState()): ProtocolState {
  for (const log of logs) {
    const parsed = registryIface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) continue;
    applyRegistryEvent(state, parsed.name, parsed.args, log);
  }
  return state;
}

function getInvestigator(state: ProtocolState, id: string): IndexedInvestigator {
  let inv = state.investigators.get(id);
  if (!inv) {
    inv = { id, controller: "", modelProvider: "", parentId: null, registeredAt: 0, controllerHistory: [], linkedReports: [] };
    state.investigators.set(id, inv);
  }
  return inv;
}

function applyRegistryEvent(state: ProtocolState, name: string, args: any, log: Log) {
  state.eventCount += 1;
  state.lastBlock = Math.max(state.lastBlock, log.blockNumber ?? 0);

  switch (name) {
    case "InvestigatorRegistered": {
      const inv = getInvestigator(state, args.investigatorId);
      inv.controller = args.controller;
      inv.modelProvider = args.modelProvider;
      inv.parentId = args.parentId === "0x" + "0".repeat(64) ? null : args.parentId;
      inv.registeredAt = Number(args.occurredAt);
      break;
    }
    case "ControllerRotated": {
      const inv = getInvestigator(state, args.investigatorId);
      inv.controller = args.newController;
      inv.controllerHistory.push({ from: args.oldController, to: args.newController, at: Number(args.occurredAt) });
      break;
    }
    default:
      break;
  }
}

function getClaim(state: ProtocolState, id: string): IndexedClaim {
  let claim = state.claims.get(id);
  if (!claim) {
    claim = {
      id,
      predicateHash: "",
      textHash: "",
      author: "",
      createdAt: 0,
      validFrom: 0,
      validUntil: null,
      status: "OPEN",
      challengeIds: [],
      relationships: [],
    };
    state.claims.set(id, claim);
  }
  return claim;
}

function getChallenge(state: ProtocolState, id: string): IndexedChallenge {
  let c = state.challenges.get(id);
  if (!c) {
    c = {
      id,
      claimId: "",
      challengeType: "CONTRADICTION",
      challenger: "",
      bondWei: "0",
      openedAt: 0,
      windowCloseAt: 0,
      evidenceRoot: null,
      state: "OPEN",
      evidenceIds: [],
      reports: [],
      verdict: null,
      appeals: [],
      payouts: [],
    };
    state.challenges.set(id, c);
  }
  return c;
}

function applyEvent(state: ProtocolState, name: string, args: any, log: Log) {
  state.eventCount += 1;
  state.lastBlock = Math.max(state.lastBlock, log.blockNumber ?? 0);

  switch (name) {
    case "ClaimCreated": {
      const claim = getClaim(state, args.claimId);
      claim.predicateHash = args.predicateHash;
      claim.textHash = args.textHash;
      claim.author = args.author;
      claim.createdAt = Number(args.createdAt);
      claim.validFrom = Number(args.validFrom);
      break;
    }
    case "RelationshipRecorded": {
      const relation = RELATIONSHIP[Number(args.relation)]!;
      const at = Number(args.occurredAt);
      const a = getClaim(state, args.claimAId);
      const b = getClaim(state, args.claimBId);
      a.relationships.push({ withClaimId: args.claimBId, relation, direction: "outgoing", at });
      b.relationships.push({ withClaimId: args.claimAId, relation, direction: "incoming", at });
      break;
    }
    case "Superseded": {
      const oldClaim = getClaim(state, args.oldClaimId);
      oldClaim.status = "SUPERSEDED";
      oldClaim.validUntil = Number(args.occurredAt);
      break;
    }
    case "ChallengeOpened": {
      const challenge = getChallenge(state, args.challengeId);
      challenge.claimId = args.claimId;
      challenge.challengeType = CHALLENGE_TYPE[Number(args.challengeType)]!;
      challenge.challenger = args.challenger;
      challenge.bondWei = args.bond.toString();
      challenge.openedAt = Number(args.openedAt);
      challenge.windowCloseAt = Number(args.windowCloseAt);
      challenge.state = "OPEN";
      const claim = getClaim(state, args.claimId);
      claim.status = "CHALLENGED";
      claim.challengeIds.push(args.challengeId);
      break;
    }
    case "EvidenceSubmitted": {
      const subjectId = args.subjectId as string;
      const challenge = state.challenges.get(subjectId);
      if (challenge) challenge.evidenceIds.push(args.evidenceId);
      break;
    }
    case "EvidenceLocked": {
      const subjectId = args.subjectId as string;
      const challenge = state.challenges.get(subjectId);
      if (challenge) {
        challenge.evidenceRoot = args.evidenceRoot;
        challenge.state = "EVIDENCE_LOCKED";
        const claim = state.claims.get(challenge.claimId);
        if (claim) claim.status = "EVIDENCE_LOCKED";
      }
      break;
    }
    case "InvestigationStarted": {
      const challenge = getChallenge(state, args.challengeId);
      challenge.state = "INVESTIGATING";
      const claim = state.claims.get(challenge.claimId);
      if (claim) claim.status = "INVESTIGATING";
      break;
    }
    case "ReportSubmitted": {
      const challenge = getChallenge(state, args.challengeId);
      challenge.reports.push({
        investigator: args.investigator,
        investigatorId: null, // filled in by a following ReportIdentityLinked event, if any (submitReportAsIdentity emits both)
        evidenceBundleHash: args.evidenceBundleHash,
        reportCommitment: args.reportCommitment,
        verdict: Number(args.verdict),
        attestationMode: ATTESTATION_MODE[Number(args.attestationMode)]!,
        attestationVerified: Boolean(args.attestationVerified),
        at: Number(args.occurredAt),
      });
      break;
    }
    case "ReportIdentityLinked": {
      const challenge = getChallenge(state, args.challengeId);
      const report = [...challenge.reports].reverse().find((r) => r.investigator === args.investigator && r.investigatorId === null);
      if (report) report.investigatorId = args.investigatorId;
      const inv = getInvestigator(state, args.investigatorId);
      inv.linkedReports.push({ challengeId: args.challengeId, at: report?.at ?? 0 });
      break;
    }
    case "InvestigatorPaid": {
      const challenge = getChallenge(state, args.challengeId);
      challenge.payouts.push({ investigator: args.investigator, amountWei: args.amount.toString(), at: Number(args.occurredAt) });
      break;
    }
    case "Resolved": {
      const challenge = getChallenge(state, args.challengeId);
      const status = VERDICT_STATUS[Number(args.status)]!;
      challenge.state = "RESOLVED";
      challenge.verdict = {
        status,
        procedureHash: args.procedureHash,
        reportsRoot: args.reportsRoot,
        dissentRoot: args.dissentRoot,
        resolvedAt: Number(args.occurredAt),
      };
      const claim = state.claims.get(args.claimId);
      if (claim) claim.status = status === "TRUE" ? "TRUE" : status === "FALSE" ? "FALSE" : (status as any);
      break;
    }
    case "AppealFiled": {
      const challenge = getChallenge(state, args.challengeId);
      challenge.state = "APPEALED";
      challenge.appeals.push({ appealId: Number(args.appealId), filedBy: args.filedBy, filedAt: Number(args.occurredAt), reason: args.reason, resolved: false });
      break;
    }
    case "AppealResolved": {
      for (const challenge of state.challenges.values()) {
        const appeal = challenge.appeals.find((a) => a.appealId === Number(args.appealId));
        if (appeal) {
          appeal.resolved = true;
          appeal.newStatus = VERDICT_STATUS[Number(args.newStatus)]!;
        }
      }
      break;
    }
    default:
      break;
  }
}

export async function rebuildFromChain(
  provider: Provider,
  contractAddress: string,
  investigatorRegistryAddress: string | null,
  fromBlock = 0,
): Promise<ProtocolState> {
  const logs = await provider.getLogs({ address: contractAddress, fromBlock, toBlock: "latest" });
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  const state = applyLogs(logs);

  if (investigatorRegistryAddress) {
    const registryLogs = await provider.getLogs({ address: investigatorRegistryAddress, fromBlock, toBlock: "latest" });
    registryLogs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    applyRegistryLogs(registryLogs, state);
  }

  return state;
}
