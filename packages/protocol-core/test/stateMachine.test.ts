import { describe, expect, it } from "vitest";
import { assertChallengeTransition, assertClaimTransition, EventLog, IllegalTransitionError } from "../src/stateMachine.js";

const h = (s: string) => `0x${s.padEnd(64, "0")}` as `0x${string}`;

describe("claim transitions", () => {
  it("allows the canonical happy path", () => {
    expect(() => assertClaimTransition("OPEN", "CHALLENGED")).not.toThrow();
    expect(() => assertClaimTransition("CHALLENGED", "EVIDENCE_LOCKED")).not.toThrow();
    expect(() => assertClaimTransition("EVIDENCE_LOCKED", "INVESTIGATING")).not.toThrow();
    expect(() => assertClaimTransition("INVESTIGATING", "CONTESTED")).not.toThrow();
  });

  it("rejects skipping evidence lock / investigation (resolving before investigating)", () => {
    expect(() => assertClaimTransition("CHALLENGED", "TRUE")).toThrow(IllegalTransitionError);
    expect(() => assertClaimTransition("OPEN", "TRUE")).toThrow(IllegalTransitionError);
  });

  it("FALSE and SUPERSEDED are terminal — no further transition out", () => {
    expect(() => assertClaimTransition("FALSE", "TRUE")).toThrow(IllegalTransitionError);
    expect(() => assertClaimTransition("SUPERSEDED", "CHALLENGED")).toThrow(IllegalTransitionError);
  });

  it("CONTESTED and INCONCLUSIVE can be re-challenged (a fresh Challenge, not a mutation)", () => {
    expect(() => assertClaimTransition("CONTESTED", "CHALLENGED")).not.toThrow();
    expect(() => assertClaimTransition("INCONCLUSIVE", "CHALLENGED")).not.toThrow();
  });
});

describe("challenge transitions", () => {
  it("allows the canonical happy path", () => {
    expect(() => assertChallengeTransition("OPEN", "EVIDENCE_LOCKED")).not.toThrow();
    expect(() => assertChallengeTransition("EVIDENCE_LOCKED", "INVESTIGATING")).not.toThrow();
    expect(() => assertChallengeTransition("INVESTIGATING", "RESOLVED")).not.toThrow();
    expect(() => assertChallengeTransition("RESOLVED", "APPEALED")).not.toThrow();
  });

  it("rejects resolving a challenge that never locked evidence or investigated", () => {
    expect(() => assertChallengeTransition("OPEN", "RESOLVED")).toThrow(IllegalTransitionError);
  });
});

describe("EventLog", () => {
  it("is append-only and returns snapshots, not live references", () => {
    const log = new EventLog();
    log.append(1, "CLAIM_CREATED", h("claim1"), { text: "hello" });
    const snap = log.snapshot();
    snap.pop(); // mutate the snapshot
    expect(log.all).toHaveLength(1); // original log untouched
  });

  it("filters events by subject", () => {
    const log = new EventLog();
    log.append(1, "CLAIM_CREATED", h("claim1"), {});
    log.append(2, "CLAIM_CREATED", h("claim2"), {});
    log.append(3, "CHALLENGE_OPENED", h("claim1"), {});
    expect(log.forSubject(h("claim1"))).toHaveLength(2);
  });

  it("assigns strictly increasing sequence numbers", () => {
    const log = new EventLog();
    const e1 = log.append(1, "A", h("x"), {});
    const e2 = log.append(2, "B", h("x"), {});
    expect(e2.seq).toBe(e1.seq + 1);
  });
});
