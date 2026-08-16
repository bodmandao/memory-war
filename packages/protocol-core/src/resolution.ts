/**
 * Mechanical resolution.
 *
 * Spec §13: "Do not implement: LLM says guilty -> guilty. The AI
 * produces reports. The protocol applies a disclosed resolution
 * procedure to those reports... explicit, versioned, deterministic,
 * auditable."
 *
 * A ResolutionProcedure is a pure function over Report[]. It is
 * identified by (id, version) and its exact behavior is committed via
 * procedureHash — anyone can recompute that hash from this file and
 * confirm the verdict was produced by the disclosed rule, not by
 * discretion.
 */
import { hashUtf8, merkleRoot } from "./ids.js";
import type { Hash, Report, Verdict, VerdictStatus } from "./types.js";

export interface ResolutionOutcome {
  status: VerdictStatus;
  rationale: string;
  majorityReports: Report[];
  dissent: Report[];
}

export interface ResolutionProcedure {
  id: string;
  version: string;
  /** Human-readable description, included in the hash so behavior changes are detectable. */
  describe(): string;
  apply(reports: Report[]): ResolutionOutcome;
}

export const MIN_DISTINCT_PROVIDERS = 2;
export const MIN_REPORTS = 2;

/**
 * The MVP default procedure (spec §13's worked examples, implemented
 * exactly):
 *   - no reports, or none report retrievable primary evidence -> INCONCLUSIVE
 *   - fewer than MIN_REPORTS, or fewer than MIN_DISTINCT_PROVIDERS distinct
 *     model families -> INCONCLUSIVE (insufficient diversity to responsibly
 *     resolve — this is the model-monoculture mitigation from the threat
 *     model, enforced structurally rather than trusted to happen)
 *   - unanimous SUPPORTS -> TRUE
 *   - unanimous REJECTS -> FALSE
 *   - anything else (material disagreement) -> CONTESTED, with the
 *     minority preserved in full, never discarded
 */
export class DefaultResolutionProcedure implements ResolutionProcedure {
  readonly id = "mw-default";
  readonly version = "v1";

  describe(): string {
    return [
      `${this.id}/${this.version}`,
      `require >= ${MIN_REPORTS} reports from >= ${MIN_DISTINCT_PROVIDERS} distinct model providers`,
      "unanimous SUPPORTS -> TRUE",
      "unanimous REJECTS -> FALSE",
      "any INSUFFICIENT_EVIDENCE among reports, or any disagreement -> CONTESTED unless all are INSUFFICIENT_EVIDENCE -> INCONCLUSIVE",
    ].join(" | ");
  }

  apply(reports: Report[]): ResolutionOutcome {
    if (reports.length < MIN_REPORTS) {
      return {
        status: "INCONCLUSIVE",
        rationale: `only ${reports.length} report(s) submitted; procedure requires >= ${MIN_REPORTS}`,
        majorityReports: reports,
        dissent: [],
      };
    }

    const distinctProviders = new Set(reports.map((r) => r.modelProvider)).size;
    if (distinctProviders < MIN_DISTINCT_PROVIDERS) {
      return {
        status: "INCONCLUSIVE",
        rationale: `reports came from only ${distinctProviders} distinct model provider(s); procedure requires >= ${MIN_DISTINCT_PROVIDERS} to guard against model monoculture (kill-test §9)`,
        majorityReports: reports,
        dissent: [],
      };
    }

    const support = reports.filter((r) => r.verdict === "SUPPORTS");
    const reject = reports.filter((r) => r.verdict === "REJECTS");
    const insufficient = reports.filter((r) => r.verdict === "INSUFFICIENT_EVIDENCE");

    if (insufficient.length === reports.length) {
      return {
        status: "INCONCLUSIVE",
        rationale: "every investigator reported insufficient evidence to reach a conclusion",
        majorityReports: [],
        dissent: reports,
      };
    }

    if (support.length === reports.length) {
      return {
        status: "TRUE",
        rationale: "all independent, model-diverse investigators support the claim under the evidence considered",
        majorityReports: support,
        dissent: [],
      };
    }

    if (reject.length === reports.length) {
      return {
        status: "FALSE",
        rationale: "all independent, model-diverse investigators reject the claim under the evidence considered",
        majorityReports: reject,
        dissent: [],
      };
    }

    // Any material disagreement — including a support/reject split with
    // some INSUFFICIENT_EVIDENCE reports mixed in — is CONTESTED, not
    // "resolved by majority." Majority vote is exactly the truth-by-
    // consensus conflation the epistemic model forbids (kill-test §8).
    const majority = support.length >= reject.length ? support : reject;
    const dissent = reports.filter((r) => !majority.includes(r));
    return {
      status: "CONTESTED",
      rationale: `investigators disagree: ${support.length} support, ${reject.length} reject, ${insufficient.length} insufficient — disagreement is preserved, not averaged away`,
      majorityReports: majority,
      dissent,
    };
  }
}

export function procedureHash(p: ResolutionProcedure): Hash {
  return hashUtf8(`${p.id}/${p.version}::${p.describe()}`);
}

export function reportCommitment(r: Report): Hash {
  return hashUtf8(
    [r.investigatorId, r.modelProvider, r.evidenceBundleHash, r.claimId, r.challengeId, r.verdict, r.confidence, r.reasoningHash, r.submittedAt].join(
      "|",
    ),
  );
}

export function reportsRoot(reports: Report[]): Hash {
  return merkleRoot(reports.map(reportCommitment));
}

export function buildVerdict(params: {
  claimId: Hash;
  challengeId: Hash;
  procedure: ResolutionProcedure;
  reports: Report[];
  resolvedAt: number;
  validFrom: number;
  validUntil?: number;
}): Verdict {
  const outcome = params.procedure.apply(params.reports);
  return {
    claimId: params.claimId,
    challengeId: params.challengeId,
    status: outcome.status,
    procedureId: params.procedure.id,
    procedureVersion: params.procedure.version,
    procedureHash: procedureHash(params.procedure),
    reportsRoot: reportsRoot(params.reports),
    majorityReports: outcome.majorityReports,
    dissent: outcome.dissent,
    rationale: outcome.rationale,
    resolvedAt: params.resolvedAt,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
  };
}
