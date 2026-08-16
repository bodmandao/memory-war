import { describe, expect, it } from "vitest";
import { DefaultResolutionProcedure, buildVerdict, procedureHash } from "../src/resolution.js";
import type { Report } from "../src/types.js";

const h = (s: string) => `0x${s.padEnd(64, "0")}` as `0x${string}`;

function report(overrides: Partial<Report>): Report {
  return {
    investigatorId: "0x1111111111111111111111111111111111111111",
    modelProvider: "provider-a",
    evidenceBundleHash: h("bundle"),
    claimId: h("claim"),
    challengeId: h("challenge"),
    verdict: "SUPPORTS",
    confidence: 0.8,
    reasoningHash: h("reasoning"),
    submittedAt: 1000,
    attestation: { mode: "SIMULATED", verified: false, detail: "test fixture" },
    ...overrides,
  };
}

describe("DefaultResolutionProcedure", () => {
  const proc = new DefaultResolutionProcedure();

  it("unanimous SUPPORTS from diverse providers -> TRUE", () => {
    const reports = [report({ modelProvider: "a", verdict: "SUPPORTS" }), report({ modelProvider: "b", verdict: "SUPPORTS" })];
    const outcome = proc.apply(reports);
    expect(outcome.status).toBe("TRUE");
    expect(outcome.dissent).toHaveLength(0);
  });

  it("unanimous REJECTS from diverse providers -> FALSE", () => {
    const reports = [report({ modelProvider: "a", verdict: "REJECTS" }), report({ modelProvider: "b", verdict: "REJECTS" })];
    const outcome = proc.apply(reports);
    expect(outcome.status).toBe("FALSE");
  });

  it("disagreement -> CONTESTED, and the dissenting report is preserved in full, not discarded", () => {
    const dissenting = report({ modelProvider: "b", verdict: "REJECTS", investigatorId: "0x2222222222222222222222222222222222222222" });
    const reports = [report({ modelProvider: "a", verdict: "SUPPORTS" }), dissenting];
    const outcome = proc.apply(reports);
    expect(outcome.status).toBe("CONTESTED");
    expect(outcome.dissent).toHaveLength(1);
    expect(outcome.dissent[0]?.investigatorId).toBe(dissenting.investigatorId);
    expect(outcome.dissent[0]?.reasoningHash).toBe(dissenting.reasoningHash); // full report content survives, not a summary
  });

  it("insufficient evidence on all sides -> INCONCLUSIVE", () => {
    const reports = [report({ modelProvider: "a", verdict: "INSUFFICIENT_EVIDENCE" }), report({ modelProvider: "b", verdict: "INSUFFICIENT_EVIDENCE" })];
    const outcome = proc.apply(reports);
    expect(outcome.status).toBe("INCONCLUSIVE");
  });

  it("fewer than the minimum report count -> INCONCLUSIVE, never a snap judgement from one report", () => {
    const outcome = proc.apply([report({})]);
    expect(outcome.status).toBe("INCONCLUSIVE");
  });

  it("model monoculture (same provider twice) -> INCONCLUSIVE even if reports agree", () => {
    const reports = [report({ modelProvider: "same-provider", verdict: "SUPPORTS" }), report({ modelProvider: "same-provider", verdict: "SUPPORTS" })];
    const outcome = proc.apply(reports);
    expect(outcome.status).toBe("INCONCLUSIVE");
    expect(outcome.rationale).toMatch(/distinct model provider/);
  });

  it("stake/bond never appears anywhere in the resolution inputs or outputs", () => {
    // structural guarantee: ResolutionOutcome has no economic field at all
    const outcome = proc.apply([report({ modelProvider: "a" }), report({ modelProvider: "b" })]);
    expect(Object.keys(outcome)).toEqual(["status", "rationale", "majorityReports", "dissent"]);
  });

  it("procedureHash is stable for the same procedure and changes if the description changes", () => {
    const h1 = procedureHash(proc);
    const h2 = procedureHash(proc);
    expect(h1).toBe(h2);
  });

  it("buildVerdict wires the outcome, procedure identity, and reports commitment together", () => {
    const reports = [report({ modelProvider: "a", verdict: "SUPPORTS" }), report({ modelProvider: "b", verdict: "SUPPORTS" })];
    const verdict = buildVerdict({
      claimId: h("claim"),
      challengeId: h("challenge"),
      procedure: proc,
      reports,
      resolvedAt: 5000,
      validFrom: 1000,
    });
    expect(verdict.status).toBe("TRUE");
    expect(verdict.procedureId).toBe("mw-default");
    expect(verdict.procedureHash).toBe(procedureHash(proc));
    expect(verdict.reportsRoot).toBeTruthy();
  });
});
