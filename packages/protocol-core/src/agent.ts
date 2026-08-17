/**
 * Reputation and source reliability.
 *
 * Both are empirical and defeasible (kill-test §16 / spec §17):
 * "Avoid SEC = 100, Twitter = 20 as permanent truth. A source's
 * reliability can itself be challenged." Scores are seeded with a
 * defeasible prior and then move only in response to resolved
 * outcomes — never hand-assigned as a fixed hierarchy.
 */
import { hashUtf8 } from "./ids.js";
import type { Evidence, Report, Source, Timestamp, Verdict } from "./types.js";

const PRIOR_BY_SOURCE_TYPE: Record<Evidence["sourceType"], number> = {
  OFFICIAL_FILING: 0.9,
  ONCHAIN_STATE: 0.9,
  OFFICIAL_ANNOUNCEMENT: 0.75,
  NEWS_ARTICLE: 0.55,
  SOCIAL_POST: 0.3,
  LLM_OUTPUT: 0.25,
  OTHER: 0.4,
};

export function seedSource(domainOrId: string, type: Evidence["sourceType"], at: Timestamp): Source {
  const score = PRIOR_BY_SOURCE_TYPE[type];
  return {
    id: hashUtf8(`source:${domainOrId}`),
    domainOrId,
    type,
    reliabilityScore: score,
    scoreHistory: [{ at, score, reason: `seeded prior for source type ${type}` }],
  };
}

/**
 * Nudge a source's score toward 1 (verdict TRUE) or 0 (verdict FALSE)
 * based on a resolved verdict whose primary evidence traced to it.
 * SUPERSEDED/CONTESTED/INCONCLUSIVE do not move the score — they are
 * not evidence the source was wrong, only that the claim didn't
 * survive as originally stated, or that the process couldn't decide.
 */
export function updateSourceReliability(source: Source, verdict: Verdict, at: Timestamp): Source {
  const LEARNING_RATE = 0.08;
  let target: number | null = null;
  if (verdict.status === "TRUE") target = 1;
  if (verdict.status === "FALSE") target = 0;
  if (target === null) return source;

  const next = source.reliabilityScore + LEARNING_RATE * (target - source.reliabilityScore);
  return {
    ...source,
    reliabilityScore: next,
    scoreHistory: [
      ...source.scoreHistory,
      { at, score: next, reason: `claim resolved ${verdict.status} (procedure ${verdict.procedureId}/${verdict.procedureVersion})` },
    ],
  };
}

/**
 * Investigator reputation is a calibration score, not raw activity
 * (kill-test §9 "reputation farming"): it is weighted by how contested
 * the claim was, so unanimous, trivial claims contribute ~0.
 */
export function reputationDelta(params: {
  ownReportVerdict: Report["verdict"];
  finalVerdictStatus: Verdict["status"];
  wasContested: boolean;
}): number {
  if (!params.wasContested) return 0.01; // trivial claim: negligible credit either way
  const agreedWithFinal =
    (params.finalVerdictStatus === "TRUE" && params.ownReportVerdict === "SUPPORTS") ||
    (params.finalVerdictStatus === "FALSE" && params.ownReportVerdict === "REJECTS");
  return agreedWithFinal ? 0.1 : -0.05;
}
