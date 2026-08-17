/**
 * The claim/challenge lifecycle state machine.
 *
 * Spec §2:
 *   OPEN -> predicate-disambiguation -> CHALLENGED -> INVESTIGATING
 *        -> TRUE | FALSE | SUPERSEDED | CONTESTED | INCONCLUSIVE
 *
 * A predicate mismatch never enters this machine at all — it exits at
 * disambiguation into a free, unstaked RELATES_TO/REFINES/NARROWS/
 * EXTENDS edge (see predicate.ts + dag.ts). Only a genuine CONTRADICTS
 * classification is allowed to open a Challenge.
 *
 * Every transition is (a) guarded — illegal transitions throw instead
 * of silently succeeding, and (b) recorded as an immutable
 * ProtocolEvent, so "what did we believe, why, and what changed it" is
 * always answerable by replaying the event log (spec §25).
 */
import { hashJson } from "./ids.js";
import type { ChallengeState, ClaimStatus, Hash, ProtocolEvent, Timestamp } from "./types.js";

const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN: ["CHALLENGED", "SUPERSEDED"], // SUPERSEDED can happen with no dispute at all, e.g. a claimant refines their own claim
  CHALLENGED: ["EVIDENCE_LOCKED"],
  EVIDENCE_LOCKED: ["INVESTIGATING"],
  INVESTIGATING: ["TRUE", "FALSE", "CONTESTED", "INCONCLUSIVE"],
  TRUE: ["SUPERSEDED"], // a TRUE claim can still be superseded later by a new, more current claim
  FALSE: [], // terminal — a FALSE claim is not re-litigated in place; a fresh claim would be a new object
  SUPERSEDED: [], // terminal
  CONTESTED: ["CHALLENGED"], // re-investigation is a fresh challenge, appended, not a mutation of the contested one
  INCONCLUSIVE: ["CHALLENGED"],
};

const CHALLENGE_TRANSITIONS: Record<ChallengeState, ChallengeState[]> = {
  OPEN: ["EVIDENCE_LOCKED"],
  EVIDENCE_LOCKED: ["INVESTIGATING"],
  INVESTIGATING: ["RESOLVED"],
  RESOLVED: ["APPEALED"],
  APPEALED: [], // terminal at the Challenge level; the appeal record (appeals.ts-equivalent below) carries the new decision
};

export class IllegalTransitionError extends Error {
  constructor(kind: string, from: string, to: string) {
    super(`Illegal ${kind} transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertClaimTransition(from: ClaimStatus, to: ClaimStatus): void {
  if (!CLAIM_TRANSITIONS[from]?.includes(to)) throw new IllegalTransitionError("claim", from, to);
}

export function assertChallengeTransition(from: ChallengeState, to: ChallengeState): void {
  if (!CHALLENGE_TRANSITIONS[from]?.includes(to)) throw new IllegalTransitionError("challenge", from, to);
}

/** Append-only event log. No method here ever removes or edits a past entry. */
export class EventLog {
  private events: ProtocolEvent[] = [];

  append(at: Timestamp, type: string, subjectId: Hash, payload: unknown): ProtocolEvent {
    const event: ProtocolEvent = {
      seq: this.events.length,
      at,
      type,
      subjectId,
      payloadHash: hashJson(payload),
      payload,
    };
    this.events.push(event);
    return event;
  }

  get all(): ReadonlyArray<ProtocolEvent> {
    return this.events;
  }

  forSubject(subjectId: Hash): ProtocolEvent[] {
    return this.events.filter((e) => e.subjectId === subjectId);
  }

  /** Historical events are exposed only by value — mutating the array does not touch the log. */
  snapshot(): ProtocolEvent[] {
    return JSON.parse(JSON.stringify(this.events));
  }
}
