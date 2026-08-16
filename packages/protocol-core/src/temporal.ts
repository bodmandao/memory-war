/**
 * Bi-temporal helpers (Graphiti-inspired — see kill-test §14).
 *
 * valid time  = when the claim was/is true IN THE WORLD.
 * record time = when the protocol learned/recorded it (Claim.createdAt,
 *               Verdict.resolvedAt — always immutable, never edited).
 *
 * A claim whose real-world validity ends is never rewritten. A new
 * claim is created, the old claim's ValidTime.until is set, and a
 * Supersession edge links them (see dag.ts). This module only ever
 * *closes* validity windows and *reports* current-ness — it has no
 * function that mutates a claim's historical content.
 */
import type { Claim, Timestamp, ValidTime } from "./types.js";

export function openValidTime(from: Timestamp): ValidTime {
  return { from };
}

/** Returns a NEW ValidTime with `until` set — never mutates the input. */
export function closeValidTime(vt: ValidTime, until: Timestamp): ValidTime {
  if (vt.until !== undefined) return vt; // already closed — idempotent, first close wins
  if (until < vt.from) {
    throw new RangeError(`cannot close validity at ${until}, before it opened at ${vt.from}`);
  }
  return { from: vt.from, until };
}

export function isCurrentAsOf(vt: ValidTime, t: Timestamp): boolean {
  return t >= vt.from && (vt.until === undefined || t < vt.until);
}

/** "Was believed FALSE" vs "WAS TRUE, now SUPERSEDED" — spec §13, kill-test §14. */
export function describeTemporalStatus(claim: Claim, asOf: Timestamp): string {
  if (claim.status === "FALSE") return "Never held true under the evidence considered.";
  if (claim.status === "SUPERSEDED") {
    return isCurrentAsOf(claim.validTime, asOf)
      ? `Was true as of ${asOf}; a successor claim narrows/refines/extends it going forward.`
      : `Was true from ${claim.validTime.from} until ${claim.validTime.until}; superseded thereafter.`;
  }
  return `As of ${asOf}: ${claim.status}.`;
}

export function asOfLabel(t: Timestamp): string {
  return `as of ${new Date(t * 1000).toISOString()}`;
}
