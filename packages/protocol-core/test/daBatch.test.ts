import { describe, expect, it } from "vitest";
import { computeBatchCommitment, eventHash, shouldBatchForDA } from "../src/daBatch.js";
import { EventLog } from "../src/stateMachine.js";

const h = (s: string) => `0x${s.padEnd(64, "0")}` as `0x${string}`;

function sampleEvents(n: number) {
  const log = new EventLog();
  for (let i = 0; i < n; i++) log.append(1000 + i, "ReportSubmitted", h(`claim${i}`), { i });
  return log.snapshot();
}

describe("computeBatchCommitment", () => {
  it("is invariant to event submission order", () => {
    const events = sampleEvents(5);
    const forward = computeBatchCommitment(events);
    const shuffled = computeBatchCommitment([...events].reverse());
    expect(forward.root).toBe(shuffled.root);
    expect(forward.batchId).toBe(shuffled.batchId);
  });

  it("changes when the event set changes", () => {
    const a = computeBatchCommitment(sampleEvents(5));
    const b = computeBatchCommitment(sampleEvents(6));
    expect(a.root).not.toBe(b.root);
  });

  it("tracks the sequence range covered", () => {
    const events = sampleEvents(10);
    const commitment = computeBatchCommitment(events);
    expect(commitment.firstSeq).toBe(0);
    expect(commitment.lastSeq).toBe(9);
    expect(commitment.eventCount).toBe(10);
  });

  it("refuses to commit an empty batch", () => {
    expect(() => computeBatchCommitment([])).toThrow(RangeError);
  });

  it("eventHash is deterministic for the same event content", () => {
    const events = sampleEvents(1);
    expect(eventHash(events[0]!)).toBe(eventHash(events[0]!));
  });
});

describe("shouldBatchForDA — the actual throughput decision, not a fixed opinion", () => {
  it("says no at the current demo's event volume", () => {
    const result = shouldBatchForDA({ pendingEventCount: 3 });
    expect(result.batch).toBe(false);
  });

  it("says yes once pending events cross the configured threshold", () => {
    const result = shouldBatchForDA({ pendingEventCount: 100 });
    expect(result.batch).toBe(true);
  });

  it("the threshold is a parameter, not a magic number buried in the function", () => {
    const result = shouldBatchForDA({ pendingEventCount: 10, minBatchSize: 5 });
    expect(result.batch).toBe(true);
  });
});
