import { describe, expect, it } from "vitest";
import { addEvidence, buildBundle, EvidenceLockError, lockBundle, makeEvidence, textToBytes, verifyIntegrity } from "../src/evidence.js";

const AUTHOR = "0x1111111111111111111111111111111111111111" as const;

describe("evidence + bundles", () => {
  it("identical bytes always collapse to the same evidence id (content addressing)", () => {
    const e1 = makeEvidence({ bytes: textToBytes("announcement.pdf contents"), sourceType: "OFFICIAL_ANNOUNCEMENT", submittedBy: AUTHOR, submittedAt: 1 });
    const e2 = makeEvidence({ bytes: textToBytes("announcement.pdf contents"), sourceType: "OFFICIAL_ANNOUNCEMENT", submittedBy: AUTHOR, submittedAt: 999 });
    expect(e1.id).toBe(e2.id);
  });

  it("bundle commitment is invariant to the order evidence was submitted in", () => {
    const e1 = makeEvidence({ bytes: textToBytes("A"), sourceType: "NEWS_ARTICLE", submittedBy: AUTHOR, submittedAt: 1 });
    const e2 = makeEvidence({ bytes: textToBytes("B"), sourceType: "NEWS_ARTICLE", submittedBy: AUTHOR, submittedAt: 1 });
    const bundle1 = buildBundle("0xclaim" as `0x${string}`, [e1.id, e2.id]);
    const bundle2 = buildBundle("0xclaim" as `0x${string}`, [e2.id, e1.id]);
    expect(bundle1.root).toBe(bundle2.root);
  });

  it("locking a bundle then adding evidence throws instead of silently mutating it", () => {
    const e1 = makeEvidence({ bytes: textToBytes("A"), sourceType: "NEWS_ARTICLE", submittedBy: AUTHOR, submittedAt: 1 });
    let bundle = buildBundle("0xclaim" as `0x${string}`, [e1.id]);
    bundle = lockBundle(bundle, 100);
    const e2 = makeEvidence({ bytes: textToBytes("B"), sourceType: "NEWS_ARTICLE", submittedBy: AUTHOR, submittedAt: 200 });
    expect(() => addEvidence(bundle, [e2.id])).toThrow(EvidenceLockError);
  });

  it("adding evidence after lock with allowNewVersion creates an explicit new, higher version", () => {
    const e1 = makeEvidence({ bytes: textToBytes("A"), sourceType: "NEWS_ARTICLE", submittedBy: AUTHOR, submittedAt: 1 });
    let bundle = buildBundle("0xclaim" as `0x${string}`, [e1.id]);
    bundle = lockBundle(bundle, 100);
    const e2 = makeEvidence({ bytes: textToBytes("B"), sourceType: "NEWS_ARTICLE", submittedBy: AUTHOR, submittedAt: 200 });
    const next = addEvidence(bundle, [e2.id], { allowNewVersion: true });
    expect(next.version).toBe(bundle.version + 1);
    expect(next.root).not.toBe(bundle.root);
    // original bundle object is untouched
    expect(bundle.evidenceIds).toEqual([e1.id]);
  });

  it("verifyIntegrity passes for untampered bytes and fails for tampered bytes", () => {
    const original = textToBytes("Protocol X announcement: raised $40,000,000");
    const evidence = makeEvidence({ bytes: original, sourceType: "OFFICIAL_ANNOUNCEMENT", submittedBy: AUTHOR, submittedAt: 1 });

    const okCheck = verifyIntegrity(evidence.contentHash, original);
    expect(okCheck.ok).toBe(true);

    const tampered = textToBytes("Protocol X announcement: raised $400,000,000");
    const failCheck = verifyIntegrity(evidence.contentHash, tampered);
    expect(failCheck.ok).toBe(false);
    expect(failCheck.recomputedHash).not.toBe(evidence.contentHash);

    // restoring the original bytes verifies again
    const restoredCheck = verifyIntegrity(evidence.contentHash, original);
    expect(restoredCheck.ok).toBe(true);
  });
});
