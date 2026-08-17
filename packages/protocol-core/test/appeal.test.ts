import { describe, expect, it } from "vitest";
import { fileAppeal, resolveAppeal } from "../src/appeal.js";
import type { Verdict } from "../src/types.js";

const h = (s: string) => `0x${s.padEnd(64, "0")}` as `0x${string}`;
const ADDR = "0x1111111111111111111111111111111111111111" as const;

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    claimId: h("claim"),
    challengeId: h("challenge"),
    status: "TRUE",
    procedureId: "mw-default",
    procedureVersion: "v1",
    procedureHash: h("proc"),
    reportsRoot: h("reports"),
    majorityReports: [],
    dissent: [],
    rationale: "test",
    resolvedAt: 1000,
    validFrom: 1000,
    ...overrides,
  };
}

describe("appeals append, never rewrite", () => {
  it("filing an appeal preserves the full original verdict object", () => {
    const original = verdict();
    const appeal = fileAppeal(original, "new evidence emerged", ADDR, 2000);
    expect(appeal.originalVerdict).toEqual(original);
  });

  it("resolving an appeal produces a NEW verdict without mutating the original", () => {
    const original = verdict({ status: "TRUE" });
    const appeal = fileAppeal(original, "new evidence emerged", ADDR, 2000);
    const newVerdict = verdict({ status: "FALSE", resolvedAt: 3000 });
    const resolved = resolveAppeal(appeal, newVerdict, 3000);

    expect(resolved.originalVerdict.status).toBe("TRUE"); // untouched
    expect(resolved.newVerdict?.status).toBe("FALSE");
    expect(original.status).toBe("TRUE"); // the original object itself is never mutated
  });

  it("refuses to resolve the same appeal twice (no overwriting a decision)", () => {
    const appeal = fileAppeal(verdict(), "reason", ADDR, 2000);
    const resolved = resolveAppeal(appeal, verdict({ status: "FALSE" }), 3000);
    expect(() => resolveAppeal(resolved, verdict({ status: "CONTESTED" }), 4000)).toThrow();
  });
});
