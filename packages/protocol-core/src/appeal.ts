/**
 * Appeals append history; they never rewrite it (spec §16).
 * `fileAppeal` and `resolveAppeal` both return NEW objects — the
 * original Verdict passed in is never mutated, and remains reachable
 * forever via AppealRecord.originalVerdict.
 */
import { hashJson } from "./ids.js";
import type { AppealRecord, Verdict, Address, Timestamp } from "./types.js";

export function fileAppeal(originalVerdict: Verdict, reason: string, filedBy: Address, filedAt: Timestamp): AppealRecord {
  const id = hashJson({ claimId: originalVerdict.claimId, filedBy, filedAt, reason });
  return { id, originalVerdict, reason, filedBy, filedAt };
}

export function resolveAppeal(appeal: AppealRecord, newVerdict: Verdict, reviewedAt: Timestamp): AppealRecord {
  if (appeal.newVerdict) {
    throw new Error(`appeal ${appeal.id} already resolved — file a new appeal instead of overwriting this one`);
  }
  return { ...appeal, reviewedAt, newVerdict };
}
