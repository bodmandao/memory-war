import { describe, expect, it } from "vitest";
import { computeFeeSplit } from "../src/payment.js";

describe("computeFeeSplit — mirrors MemoryWarRegistry._settleBond", () => {
  it("a verification request with 2 investigators splits 100% of the fee evenly, nothing forfeit", () => {
    const split = computeFeeSplit({
      totalPoolWei: 1_000_000_000_000_000_000n, // 1 ether
      investigatorCount: 2,
      kind: "VERIFICATION_REQUEST",
      challengerWasRight: null,
    });
    expect(split.perInvestigator).toBe(500_000_000_000_000_000n);
    expect(split.remainderToChallenger).toBe(0n);
    expect(split.remainderForfeit).toBe(0n);
  });

  it("a verification request with zero investigators forfeits the whole pool (nobody did the work, nobody to refund)", () => {
    const split = computeFeeSplit({
      totalPoolWei: 1_000_000_000_000_000_000n,
      investigatorCount: 0,
      kind: "VERIFICATION_REQUEST",
      challengerWasRight: null,
    });
    expect(split.perInvestigator).toBe(0n);
    expect(split.remainderForfeit).toBe(1_000_000_000_000_000_000n);
  });

  it("an adversarial challenge pays investigators 20% and refunds the remaining 80% to a challenger who was right", () => {
    const split = computeFeeSplit({
      totalPoolWei: 1_000_000_000_000_000_000n,
      investigatorCount: 2,
      kind: "CONTRADICTION",
      challengerWasRight: true,
    });
    expect(split.perInvestigator).toBe(100_000_000_000_000_000n); // 20% / 2
    expect(split.remainderToChallenger).toBe(800_000_000_000_000_000n);
    expect(split.remainderForfeit).toBe(0n);
  });

  it("an adversarial challenge still pays investigators 20% even when the challenger was wrong — the remaining 80% is forfeit, not refunded", () => {
    const split = computeFeeSplit({
      totalPoolWei: 1_000_000_000_000_000_000n,
      investigatorCount: 2,
      kind: "CONTRADICTION",
      challengerWasRight: false,
    });
    expect(split.perInvestigator).toBe(100_000_000_000_000_000n);
    expect(split.remainderToChallenger).toBe(0n);
    expect(split.remainderForfeit).toBe(800_000_000_000_000_000n);
  });

  it("an adversarial challenge with no investigator reports behaves exactly like the pre-payment-pass contract (100% follows win/lose)", () => {
    const won = computeFeeSplit({ totalPoolWei: 1_000_000_000_000_000_000n, investigatorCount: 0, kind: "CONTRADICTION", challengerWasRight: true });
    expect(won.remainderToChallenger).toBe(1_000_000_000_000_000_000n);

    const lost = computeFeeSplit({ totalPoolWei: 1_000_000_000_000_000_000n, investigatorCount: 0, kind: "CONTRADICTION", challengerWasRight: false });
    expect(lost.remainderForfeit).toBe(1_000_000_000_000_000_000n);
  });

  it("integer-division dust never disappears — it always folds into remainderToChallenger/remainderForfeit", () => {
    const split = computeFeeSplit({
      totalPoolWei: 10n, // deliberately awkward: 100% fee bps of 10 wei / 3 investigators doesn't divide evenly
      investigatorCount: 3,
      kind: "VERIFICATION_REQUEST",
      challengerWasRight: null,
    });
    const totalPaidToInvestigators = split.perInvestigator * 3n;
    expect(totalPaidToInvestigators + split.remainderForfeit + split.remainderToChallenger).toBe(10n);
  });

  it("a zero-value pool splits to nothing, cleanly", () => {
    const split = computeFeeSplit({ totalPoolWei: 0n, investigatorCount: 2, kind: "VERIFICATION_REQUEST", challengerWasRight: null });
    expect(split.perInvestigator).toBe(0n);
    expect(split.remainderForfeit).toBe(0n);
  });
});
