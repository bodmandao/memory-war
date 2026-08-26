/**
 * Payment math — a pure mirror of MemoryWarRegistry's `_settleBond`.
 *
 * This is not a token, and not a new abstraction layer: it settles in
 * 0G Chain's native currency, the same rail the existing challenge
 * bond already uses. There is currently no separately-published "0G
 * Pay" SDK to integrate against (0G's own announced micropayments
 * layer, "0g402", has no public package as of this build) — so this
 * models the real payment rail 0G actually ships today: native
 * on-chain value settlement, plus the 0G Compute Router's own ledger
 * for the inference-cost leg (see zg-adapters/compute.ts).
 *
 * Kept here, off-chain, so a caller can predict the exact payout
 * before sending a transaction, and so a Hardhat test can assert the
 * live on-chain result equals this pure function's prediction.
 */

export const BPS_DENOMINATOR = 10_000n;
export const INVESTIGATOR_FEE_BPS_VERIFICATION = 10_000n; // 100% — a verification request has no adversary to refund
export const INVESTIGATOR_FEE_BPS_CHALLENGE = 2_000n; // 20% — the rest stays in the win/lose game

export type CaseKind = "VERIFICATION_REQUEST" | "CONTRADICTION" | "SOURCE_QUALITY";

export interface FeeSplit {
  /** Paid to EACH investigator who reported — 0 if nobody reported. */
  perInvestigator: bigint;
  /** Paid to the challenger — only possible for an adversarial case the challenger won. */
  remainderToChallenger: bigint;
  /** Retained by the contract — an adversarial case the challenger lost, or leftover integer-division dust. */
  remainderForfeit: bigint;
}

function feeBpsFor(kind: CaseKind): bigint {
  return kind === "VERIFICATION_REQUEST" ? INVESTIGATOR_FEE_BPS_VERIFICATION : INVESTIGATOR_FEE_BPS_CHALLENGE;
}

/**
 * Predicts exactly how `totalPoolWei` will be split once a case
 * resolves — mirrors MemoryWarRegistry._settleBond step for step:
 *   1. carve out the investigator fee share (100% for a verification
 *      request, 20% for an adversarial challenge), split evenly;
 *   2. whatever's left (including any un-payable dust) either returns
 *      to the challenger (adversarial + they were right) or is
 *      forfeit (adversarial + they were wrong) — a verification
 *      request has no adversary, so its leftover simply has no
 *      recipient and stays with the protocol.
 */
export function computeFeeSplit(params: {
  totalPoolWei: bigint;
  investigatorCount: number;
  kind: CaseKind;
  challengerWasRight: boolean | null; // null for VERIFICATION_REQUEST — there is no adversary
}): FeeSplit {
  const { totalPoolWei, investigatorCount, kind, challengerWasRight } = params;

  if (totalPoolWei === 0n) {
    return { perInvestigator: 0n, remainderToChallenger: 0n, remainderForfeit: 0n };
  }

  const feeBps = feeBpsFor(kind);
  const investigatorPool = (totalPoolWei * feeBps) / BPS_DENOMINATOR;
  let remainder = totalPoolWei - investigatorPool;

  let perInvestigator = 0n;
  if (investigatorCount > 0 && investigatorPool > 0n) {
    perInvestigator = investigatorPool / BigInt(investigatorCount);
    const dust = investigatorPool - perInvestigator * BigInt(investigatorCount);
    remainder += dust;
  } else {
    remainder += investigatorPool; // nobody to pay — the whole fee pool folds back into the remainder
  }

  if (kind === "VERIFICATION_REQUEST") {
    // no adversary — whatever wasn't paid to an investigator simply
    // has no recipient and stays with the protocol.
    return { perInvestigator, remainderToChallenger: 0n, remainderForfeit: remainder };
  }
  if (challengerWasRight) {
    return { perInvestigator, remainderToChallenger: remainder, remainderForfeit: 0n };
  }
  return { perInvestigator, remainderToChallenger: 0n, remainderForfeit: remainder };
}
