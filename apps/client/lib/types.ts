// Mirrors apps/indexer/src/eventStore.ts exactly — this app never invents
// a field the indexer doesn't actually emit. If something isn't here, the
// UI shows "not available" rather than a fabricated value.

// Exact literal unions from apps/indexer/src/eventStore.ts's own const
// arrays (CLAIM_STATUS / CHALLENGE_TYPE / CHALLENGE_STATE / VERDICT_STATUS)
// — copied, not guessed, so a status this app doesn't recognize is a
// build-time type error rather than a silently mislabeled badge.
export type ClaimStatus = "OPEN" | "CHALLENGED" | "EVIDENCE_LOCKED" | "INVESTIGATING" | "TRUE" | "FALSE" | "SUPERSEDED" | "CONTESTED" | "INCONCLUSIVE";
export type ChallengeState = "OPEN" | "EVIDENCE_LOCKED" | "INVESTIGATING" | "RESOLVED" | "APPEALED";
export type VerdictStatus = "NONE" | "TRUE" | "FALSE" | "SUPERSEDED" | "CONTESTED" | "INCONCLUSIVE";
export type ChallengeType = "CONTRADICTION" | "SOURCE_QUALITY" | "VERIFICATION_REQUEST";
export type AttestationMode = "0G_COMPUTE_TEE" | "LOCAL_LLM" | "SIMULATED";
export type StorageMode = "0G_STORAGE_LIVE" | "LOCAL_DEMO";

export interface Relationship {
  withClaimId: string;
  relation: string;
  direction: "outgoing" | "incoming";
  at: number;
}

export interface Claim {
  id: string;
  predicateHash: string;
  textHash: string;
  author: string;
  createdAt: number;
  validFrom: number;
  validUntil: number | null;
  status: ClaimStatus;
  challengeIds: string[];
  relationships: Relationship[];
}

export interface Report {
  investigator: string;
  investigatorId: string | null;
  evidenceBundleHash: string;
  reportCommitment: string;
  verdict: number; // 0 INSUFFICIENT_EVIDENCE · 1 SUPPORTS · 2 REJECTS
  attestationMode: AttestationMode;
  attestationVerified: boolean;
  at: number;
}

export interface Verdict {
  status: VerdictStatus;
  procedureHash: string;
  reportsRoot: string;
  dissentRoot: string;
  resolvedAt: number;
}

export interface Appeal {
  appealId: number;
  filedBy: string;
  filedAt: number;
  reason: string;
  resolved: boolean;
  newStatus?: VerdictStatus;
}

export interface Payout {
  investigator: string;
  amountWei: string;
  at: number;
}

export interface Challenge {
  id: string;
  claimId: string;
  challengeType: ChallengeType;
  challenger: string;
  bondWei: string;
  openedAt: number;
  windowCloseAt: number;
  evidenceRoot: string | null;
  state: ChallengeState;
  evidenceIds: string[];
  reports: Report[];
  verdict: Verdict | null;
  appeals: Appeal[];
  payouts: Payout[];
}

export interface InvestigatorCalibration {
  investigatorId: string;
  agreed: number;
  disagreed: number;
  pending: number;
  contestedInvolvement: number;
  totalInvestigations: number;
  investigations: Array<{ claimId: string | null; challengeId: string; reportVerdict: string | null; finalVerdict: string | null }>;
}

export interface Investigator {
  id: string;
  controller: string;
  modelProvider: string;
  parentId: string | null;
  registeredAt: number;
  controllerHistory: Array<{ from: string; to: string; at: number }>;
  linkedReports: Array<{ challengeId: string; at: number }>;
  calibration: InvestigatorCalibration | null;
}

export interface Health {
  ok: boolean;
  note?: string;
  contractAddress: string | null;
  investigatorRegistryAddress: string | null;
  rpcUrl: string;
  storageMode: StorageMode;
  lastRebuildAt: number | null;
  lastRebuildError: string | null;
  eventCount: number;
  lastIndexedBlock: number;
}

export interface DemoStep {
  label: string;
  detail: string;
  data?: unknown;
}

export interface DemoTrace {
  scenario: string;
  ok: boolean;
  steps: DemoStep[];
}

export interface AgentVerifyResult {
  verdict: string;
  confidence: number | null;
  evidenceRoot: string;
  investigationId: string;
  investigators: Array<{
    address: string;
    investigatorId: string;
    modelProvider: string;
    verdict: string;
    attestation: { mode: AttestationMode; verified: boolean; detail: string };
  }>;
  attestation: { anyLiveTee: boolean; modes: AttestationMode[] };
  procedure: { id: string; version: string; procedureHash: string };
  payment: { feeWei: string; payouts: Array<{ investigator: string; amountWei: string }> };
  history: { claimId: string; onChainTxHash: string; queryUrl: string };
}
