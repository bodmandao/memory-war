/**
 * MEMORY WAR — protocol-level types.
 *
 * These mirror the objects specified in the revised protocol spec:
 * Claim, Evidence, Challenge, Investigation, Report, Verdict, Agent,
 * Source, Supersession. This module has zero framework/network
 * dependencies — it is the vocabulary every other layer speaks.
 */

export type Hash = `0x${string}`;
export type Address = `0x${string}`;
export type Timestamp = number; // unix seconds

// ── Predicate model ─────────────────────────────────────────────────
// A claim's meaning is normalized into a StructuredPredicate BEFORE any
// relationship judgement is made. This is what lets the protocol tell
// "raised $40M" apart from "valued at $40M" mechanically, instead of by
// vibes or by asking an LLM to vote on whether they conflict.

export type PredicateMetric =
  | "RAISE_AMOUNT"
  | "VALUATION"
  | "TVL"
  | "EXPLOIT_LOSS"
  | "GENERIC";

export interface StructuredPredicate {
  subject: string; // normalized entity name, e.g. "protocol-x"
  metric: PredicateMetric;
  value?: number;
  unit?: string; // e.g. "USD"
  qualifiers: string[]; // e.g. ["series-a"], ["as-of:2026-01"]
  asOf?: string; // ISO date the predicate is claimed to hold as of
  raw: string; // original claim text, preserved verbatim
}

export type RelationshipType =
  | "CONTRADICTS"
  | "RELATES_TO"
  | "REFINES"
  | "NARROWS"
  | "EXTENDS"
  | "SUPERSEDES";

// ── Core lifecycle ──────────────────────────────────────────────────

export type ClaimStatus =
  | "OPEN"
  | "CHALLENGED"
  | "EVIDENCE_LOCKED"
  | "INVESTIGATING"
  | "TRUE"
  | "FALSE"
  | "SUPERSEDED"
  | "CONTESTED"
  | "INCONCLUSIVE";

export interface ValidTime {
  from: Timestamp;
  until?: Timestamp; // set only when a Supersession closes this claim's validity window
}

export interface Claim {
  id: Hash; // deterministic, content-derived — see ids.ts
  predicateHash: Hash; // hash of the normalized StructuredPredicate
  predicate: StructuredPredicate;
  textUri?: string; // 0G Storage reference to full text/context, once uploaded
  textHash: Hash;
  author: Address;
  createdAt: Timestamp; // record time — immutable
  validTime: ValidTime; // bi-temporal — see temporal.ts
  status: ClaimStatus;
  evidenceRefs: Hash[]; // Evidence.id[] — justification DAG edges
  challengeRefs: Hash[]; // Challenge.id[]
}

export interface Evidence {
  id: Hash; // = contentHash, content-addressed
  contentHash: Hash;
  storageUri?: string; // 0G Storage reference once uploaded
  sourceUrl?: string;
  sourceType:
    | "OFFICIAL_FILING"
    | "OFFICIAL_ANNOUNCEMENT"
    | "ONCHAIN_STATE"
    | "NEWS_ARTICLE"
    | "SOCIAL_POST"
    | "LLM_OUTPUT"
    | "OTHER";
  submittedBy: Address;
  submittedAt: Timestamp;
  bond: string; // wei, as decimal string
}

export interface EvidenceBundle {
  claimOrChallengeId: Hash;
  evidenceIds: Hash[]; // canonicalized (sorted) — see evidence.ts
  root: Hash; // Merkle root over canonicalized leaves
  lockedAt?: Timestamp; // once set, bundle is immutable; new evidence forms a new version
  version: number;
}

export type ChallengeType = "CONTRADICTION" | "SOURCE_QUALITY";
// NB: predicate mismatches never reach Challenge at all — they resolve
// into a RELATES_TO/REFINES/NARROWS/EXTENDS Supersession-family edge
// before any bond is possible. See predicate.ts + stateMachine.ts.

export type ChallengeState =
  | "OPEN"
  | "EVIDENCE_LOCKED"
  | "INVESTIGATING"
  | "RESOLVED"
  | "APPEALED";

export interface Challenge {
  id: Hash;
  claimId: Hash;
  type: ChallengeType;
  challenger: Address;
  bond: string; // wei
  counterEvidenceRefs: Hash[];
  openedAt: Timestamp;
  windowCloseAt: Timestamp;
  state: ChallengeState;
}

export type ProviderDiversityClass = string; // e.g. model-family identifier

export interface Report {
  investigatorId: Address;
  modelProvider: ProviderDiversityClass;
  evidenceBundleHash: Hash; // binds this report to an exact, locked bundle
  claimId: Hash;
  challengeId: Hash;
  verdict: "SUPPORTS" | "REJECTS" | "INSUFFICIENT_EVIDENCE";
  confidence: number; // [0,1] — a stated probability, not a truth value
  findingsUri?: string; // 0G Storage reference to full reasoning text
  reasoningHash: Hash;
  submittedAt: Timestamp;
  signature?: Hash; // investigator's signature over the report payload
  attestation: {
    mode: "0G_COMPUTE_TEE" | "LOCAL_LLM" | "SIMULATED";
    verified: boolean; // true only if a real attestation/signature check passed
    detail: string;
  };
}

export type VerdictStatus =
  | "TRUE"
  | "FALSE"
  | "SUPERSEDED"
  | "CONTESTED"
  | "INCONCLUSIVE";

export interface Verdict {
  claimId: Hash;
  challengeId: Hash;
  status: VerdictStatus;
  procedureId: string;
  procedureVersion: string;
  procedureHash: Hash; // hash of the exact resolution rule that was applied
  reportsRoot: Hash; // commitment over all reports considered
  majorityReports: Report[];
  dissent: Report[]; // NEVER discarded — see resolution.ts
  rationale: string;
  resolvedAt: Timestamp;
  validFrom: Timestamp;
  validUntil?: Timestamp;
}

export interface Agent {
  id: Address;
  pubkey?: string;
  role: "CLAIMANT" | "CHALLENGER" | "INVESTIGATOR" | "EVIDENCE_PROVIDER" | "MIXED";
  modelProvider?: ProviderDiversityClass; // disclosed if this agent is an AI investigator
  reputationScore: number; // calibration-based — see agent.ts
}

export interface Source {
  id: Hash; // hash of normalized domain/identifier
  domainOrId: string;
  type: Evidence["sourceType"];
  reliabilityScore: number; // [0,1], empirical, defeasible — see agent.ts
  scoreHistory: Array<{ at: Timestamp; score: number; reason: string }>;
}

export interface Supersession {
  oldClaimId: Hash;
  newClaimId: Hash;
  relation: RelationshipType;
  recordedAt: Timestamp;
}

export interface AppealRecord {
  id: Hash;
  originalVerdict: Verdict; // full, unmutated copy — history is append-only
  reason: string;
  filedBy: Address;
  filedAt: Timestamp;
  reviewedAt?: Timestamp;
  newVerdict?: Verdict; // a NEW object; originalVerdict is never edited
}

/** Every state transition in the protocol is recorded as an immutable event. */
export interface ProtocolEvent {
  seq: number;
  at: Timestamp;
  type: string;
  subjectId: Hash;
  payloadHash: Hash;
  payload: unknown;
}
