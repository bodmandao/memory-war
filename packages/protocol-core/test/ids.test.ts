import { describe, expect, it } from "vitest";
import { canonicalJson, hashJson, merkleRoot, hashUtf8 } from "../src/ids.js";

describe("canonical hashing", () => {
  it("produces identical hashes regardless of key order", () => {
    const a = hashJson({ author: "0x1", predicate: "raise", value: 40 });
    const b = hashJson({ value: 40, predicate: "raise", author: "0x1" });
    expect(a).toBe(b);
  });

  it("canonicalJson sorts nested objects and array contents recursively", () => {
    const a = canonicalJson({ b: 1, a: { y: 2, x: 1 }, c: [3, 1, 2] });
    const b = canonicalJson({ a: { x: 1, y: 2 }, c: [3, 1, 2], b: 1 });
    expect(a).toBe(b);
  });

  it("different content produces different hashes", () => {
    expect(hashUtf8("claim A")).not.toBe(hashUtf8("claim B"));
  });
});

describe("merkleRoot", () => {
  it("is invariant to leaf submission order", () => {
    const l1 = hashUtf8("evidence-1");
    const l2 = hashUtf8("evidence-2");
    const l3 = hashUtf8("evidence-3");
    expect(merkleRoot([l1, l2, l3])).toBe(merkleRoot([l3, l1, l2]));
    expect(merkleRoot([l1, l2, l3])).toBe(merkleRoot([l2, l3, l1]));
  });

  it("changes when the leaf set changes", () => {
    const l1 = hashUtf8("evidence-1");
    const l2 = hashUtf8("evidence-2");
    const l3 = hashUtf8("evidence-3");
    expect(merkleRoot([l1, l2])).not.toBe(merkleRoot([l1, l2, l3]));
  });

  it("is deterministic for the empty bundle", () => {
    expect(merkleRoot([])).toBe(merkleRoot([]));
  });
});
