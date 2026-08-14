import { describe, expect, it } from "vitest";
import { classifyRelationship, extractRuleBased } from "../src/predicate.js";

describe("extractRuleBased", () => {
  it("parses a raise claim", () => {
    const p = extractRuleBased("Protocol X raised $40M in a Series A");
    expect(p.metric).toBe("RAISE_AMOUNT");
    expect(p.value).toBe(40_000_000);
    expect(p.qualifiers).toContain("series-a");
  });

  it("parses a valuation claim", () => {
    const p = extractRuleBased("Protocol X was valued at $40M");
    expect(p.metric).toBe("VALUATION");
    expect(p.value).toBe(40_000_000);
  });

  it("parses a competing raise figure for the same subject", () => {
    const p = extractRuleBased("Protocol X raised $12M");
    expect(p.metric).toBe("RAISE_AMOUNT");
    expect(p.value).toBe(12_000_000);
  });
});

describe("classifyRelationship — the predicate-disambiguation gate", () => {
  it('scenario A: "raised $40M" vs "valued at $40M" is RELATES_TO, not a contradiction', () => {
    const a = extractRuleBased("Protocol X raised $40M");
    const b = extractRuleBased("Protocol X was valued at $40M");
    const r = classifyRelationship(a, b);
    expect(r.relation).toBe("RELATES_TO");
    expect(r.requiresChallenge).toBe(false);
  });

  it('scenario B: "raised $40M" vs "raised $12M" is a genuine CONTRADICTS', () => {
    const a = extractRuleBased("Protocol X raised $40M");
    const b = extractRuleBased("Protocol X raised $12M");
    const r = classifyRelationship(a, b);
    expect(r.relation).toBe("CONTRADICTS");
    expect(r.requiresChallenge).toBe(true);
  });

  it("different subjects never contradict", () => {
    const a = extractRuleBased("Protocol X raised $40M");
    const b = extractRuleBased("Protocol Y raised $12M");
    const r = classifyRelationship(a, b);
    expect(r.relation).toBe("RELATES_TO");
    expect(r.requiresChallenge).toBe(false);
  });

  it("same value within tolerance is not a contradiction (rounding / snapshot skew)", () => {
    const a = extractRuleBased("Protocol X raised $40M");
    const b = extractRuleBased("Protocol X raised $40.2M");
    const r = classifyRelationship(a, b);
    expect(r.relation).not.toBe("CONTRADICTS");
  });

  it("adding a qualifier to an otherwise-identical claim is REFINES", () => {
    const a = extractRuleBased("Protocol X raised $40M");
    const b = extractRuleBased("Protocol X raised $40M in a Series A");
    const r = classifyRelationship(a, b);
    expect(r.relation).toBe("REFINES");
    expect(r.requiresChallenge).toBe(false);
  });

  it("unparseable / GENERIC claims default to RELATES_TO, never a false CONTRADICTS", () => {
    const a = extractRuleBased("Protocol X has a great team");
    const b = extractRuleBased("Protocol X raised $40M");
    const r = classifyRelationship(a, b);
    expect(r.relation).toBe("RELATES_TO");
    expect(r.requiresChallenge).toBe(false);
  });
});
