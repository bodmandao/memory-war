import { describe, expect, it } from "vitest";
import { CycleError, JustificationGraph } from "../src/dag.js";

const h = (s: string) => `0x${s.padEnd(64, "0")}` as `0x${string}`;

describe("JustificationGraph", () => {
  it("distinguishes JUSTIFIES edges from relationship edges", () => {
    const g = new JustificationGraph();
    g.addEdge({ from: h("evidence1"), to: h("claimA"), kind: "JUSTIFIES" });
    g.addEdge({ from: h("claimA"), to: h("claimB"), kind: "REFINES" });
    expect(g.supportersOf(h("claimA"))).toEqual([h("evidence1")]);
    expect(g.relationshipsOf(h("claimA"))).toHaveLength(1);
  });

  it("rejects a direct cycle (A supersedes B, B supersedes A)", () => {
    const g = new JustificationGraph();
    g.addEdge({ from: h("claimA"), to: h("claimB"), kind: "SUPERSEDES" });
    expect(() => g.addEdge({ from: h("claimB"), to: h("claimA"), kind: "SUPERSEDES" })).toThrow(CycleError);
  });

  it("rejects circular evidence: A justifies B, B justifies C, C justifies A", () => {
    const g = new JustificationGraph();
    g.addEdge({ from: h("claimA"), to: h("claimB"), kind: "JUSTIFIES" });
    g.addEdge({ from: h("claimB"), to: h("claimC"), kind: "JUSTIFIES" });
    expect(() => g.addEdge({ from: h("claimC"), to: h("claimA"), kind: "JUSTIFIES" })).toThrow(CycleError);
  });

  it("rejects a self-loop", () => {
    const g = new JustificationGraph();
    expect(() => g.addEdge({ from: h("claimA"), to: h("claimA"), kind: "REFINES" })).toThrow(CycleError);
  });

  it("does NOT reject symmetric RELATES_TO/CONTRADICTS edges as cycles", () => {
    const g = new JustificationGraph();
    g.addEdge({ from: h("claimA"), to: h("claimB"), kind: "RELATES_TO" });
    expect(() => g.addEdge({ from: h("claimB"), to: h("claimA"), kind: "RELATES_TO" })).not.toThrow();
  });

  it("walks a SUPERSEDES chain to find the current successor", () => {
    const g = new JustificationGraph();
    g.addEdge({ from: h("v1"), to: h("v2"), kind: "SUPERSEDES" });
    g.addEdge({ from: h("v2"), to: h("v3"), kind: "SUPERSEDES" });
    expect(g.successorChain(h("v1"))).toEqual([h("v2"), h("v3")]);
  });
});
