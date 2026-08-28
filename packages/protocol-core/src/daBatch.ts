/**
 * 0G DA batch commitments — Priority 3 of the 0G-native integration
 * pass, and the one piece deliberately kept OUT of the live demo.
 *
 * The honest finding (see docs/DA_DECISION.md for the full reasoning):
 * MEMORY WAR's evidence artifacts are already content-addressed and
 * individually retrievable from 0G Storage — that is not a DA problem.
 * The place DA COULD genuinely help is a high-throughput future where
 * many claim/challenge/investigation EVENTS are being written per
 * block by autonomous agents faster than it's economical to commit
 * each one to 0G Chain individually: batch them, submit the batch to
 * DA, and post only the batch's availability commitment on-chain.
 *
 * This module is that mechanism, real and tested — a pure function
 * from a list of event hashes to a Merkle batch commitment, plus the
 * throughput heuristic that decides whether batching is worth it at
 * all. There is no 0G DA submission call wired up: as of this build,
 * 0G has not published an official TypeScript DA client (see
 * docs/DA_DECISION.md), so an actual `submitToDa()` here would either
 * be a stub pretending to be real, or a dependency on an unofficial
 * third-party package this repository has no way to verify. Neither
 * is acceptable per spec §22 ("do not fake it"). The commitment math
 * below is exactly what a real submission call would need to produce
 * — everything up to the network call is real and ready.
 */
import { hashJson, merkleRoot } from "./ids.js";
import type { Hash, ProtocolEvent } from "./types.js";

export interface BatchCommitment {
  batchId: Hash;
  eventCount: number;
  root: Hash; // order-independent Merkle root over the batch's event payload hashes
  firstSeq: number;
  lastSeq: number;
}

export function eventHash(event: ProtocolEvent): Hash {
  return hashJson({ seq: event.seq, at: event.at, type: event.type, subjectId: event.subjectId, payloadHash: event.payloadHash });
}

/** Pure: same events in any order produce the same commitment (mirrors evidence.ts's bundle root). */
export function computeBatchCommitment(events: ProtocolEvent[]): BatchCommitment {
  if (events.length === 0) throw new RangeError("cannot batch zero events");
  const hashes = events.map(eventHash);
  const root = merkleRoot(hashes);
  const seqs = events.map((e) => e.seq);
  return {
    batchId: hashJson({ root, count: events.length }),
    eventCount: events.length,
    root,
    firstSeq: Math.min(...seqs),
    lastSeq: Math.max(...seqs),
  };
}

/**
 * The actual "does this help" question, as a runnable heuristic rather
 * than a paragraph. Committing one event directly to 0G Chain costs
 * roughly one transaction; DA batching costs one DA submission plus
 * one on-chain commitment TX for the whole batch, but adds latency
 * (events aren't individually final until the batch closes) and
 * complexity (a batch failure affects every event in it). The
 * break-even is a real engineering tradeoff, not a fixed constant —
 * this function makes the assumption explicit and adjustable rather
 * than burying it in a comment.
 */
export function shouldBatchForDA(params: {
  pendingEventCount: number;
  /** minimum batch size below which per-event on-chain commitment is simply cheaper and lower-latency */
  minBatchSize?: number;
}): { batch: boolean; reason: string } {
  const minBatchSize = params.minBatchSize ?? 25;
  if (params.pendingEventCount < minBatchSize) {
    return {
      batch: false,
      reason: `${params.pendingEventCount} pending event(s) < minBatchSize ${minBatchSize} — commit individually to 0G Chain, DA adds latency and complexity for no real saving at this volume`,
    };
  }
  return {
    batch: true,
    reason: `${params.pendingEventCount} pending events >= minBatchSize ${minBatchSize} — batching to DA and posting one commitment amortizes on-chain cost across all of them`,
  };
}
