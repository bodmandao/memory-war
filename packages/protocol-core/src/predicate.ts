/**
 * Predicate extraction and disambiguation.
 *
 * This is the highest-risk, highest-value component in the protocol
 * (spec §8 / kill-test §15, §25): it decides whether two claims are a
 * genuine CONTRADICTION that deserves a bonded, adversarial fight, or
 * merely RELATES_TO / REFINES / NARROWS / EXTENDS each other and can
 * stand side by side with no economic stake at all.
 *
 * Design decision: extraction (free text → StructuredPredicate) may be
 * done by an LLM — that is a data-extraction task language models are
 * good at. Classification (StructuredPredicate × StructuredPredicate →
 * RelationshipType) is a PURE, DETERMINISTIC function with no model
 * call in it at all. This keeps the one judgement that gates economic
 * stakes fully mechanical, auditable, and reproducible — never "the
 * LLM decided these conflict."
 *
 * Safety principle: when in doubt, classify as RELATES_TO, never
 * CONTRADICTS. A missed contradiction is recoverable (anyone can still
 * open a manual CONTRADICTION challenge). A false contradiction forces
 * an adversarial fight over claims that were never actually opposed —
 * the exact failure the brief's own worked example exists to warn
 * against — and is the more expensive mistake to make by default.
 */
import type { PredicateMetric, RelationshipType, StructuredPredicate } from "./types.js";

export interface PredicateExtractor {
  extract(claimText: string): Promise<StructuredPredicate>;
}

/**
 * Deterministic, regex-based extractor. Real (not simulated) — it does
 * exactly what it claims, with no network dependency. Good for the
 * financial/DeFi claim shapes the MVP targets (spec §21); anything it
 * can't confidently parse degrades to metric: "GENERIC", which forces
 * the classifier below toward RELATES_TO rather than a false positive.
 */
export class RuleBasedExtractor implements PredicateExtractor {
  async extract(claimText: string): Promise<StructuredPredicate> {
    return extractRuleBased(claimText);
  }
}

const MONEY = /\$?\s*([\d,.]+)\s*(k|m|mm|million|b|bn|billion)?\b/i;

function parseMoney(text: string): { value?: number; unit?: string } {
  const m = text.match(MONEY);
  if (!m) return {};
  const raw = m[1];
  if (!raw) return {};
  const num = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(num)) return {};
  const scaleTok = (m[2] ?? "").toLowerCase();
  const scale =
    scaleTok === "k" ? 1_000
    : scaleTok === "m" || scaleTok === "mm" || scaleTok === "million" ? 1_000_000
    : scaleTok === "b" || scaleTok === "bn" || scaleTok === "billion" ? 1_000_000_000
    : 1;
  return { value: num * scale, unit: "USD" };
}

function normalizeSubject(text: string): string {
  // Heuristic: capitalized token(s) before/around the verb, e.g.
  // "Protocol X raised $40M" -> "protocol x". A production system would
  // use NER; this is intentionally simple and honest about that.
  const m = text.match(/^([A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)*)/);
  const guess = m?.[1] ?? text.split(/\s+/).slice(0, 2).join(" ");
  return guess.trim().toLowerCase().replace(/\s+/g, "-");
}

function detectMetric(text: string): PredicateMetric {
  const t = text.toLowerCase();
  if (/\b(raised|raise|funding round|series [a-z]|led by)\b/.test(t)) return "RAISE_AMOUNT";
  if (/\b(valued at|valuation)\b/.test(t)) return "VALUATION";
  if (/\btvl|total value locked\b/.test(t)) return "TVL";
  if (/\bexploit|hack(?:ed)?|drained|lost \$/i.test(text)) return "EXPLOIT_LOSS";
  return "GENERIC";
}

function detectQualifiers(text: string): string[] {
  const q: string[] = [];
  const series = text.match(/\bseries\s+([a-z])\b/i);
  if (series) q.push(`series-${series[1]!.toLowerCase()}`);
  const asOf = text.match(/\bas of\s+([\w\- ]+\d{4})/i);
  if (asOf) q.push(`as-of:${asOf[1]!.trim()}`);
  return q;
}

export function extractRuleBased(claimText: string): StructuredPredicate {
  const { value, unit } = parseMoney(claimText);
  return {
    subject: normalizeSubject(claimText),
    metric: detectMetric(claimText),
    value,
    unit,
    qualifiers: detectQualifiers(claimText),
    raw: claimText,
  };
}

export interface RelationshipResult {
  relation: RelationshipType;
  reason: string;
  /** Only CONTRADICTS is ever allowed to proceed into a bonded Challenge. */
  requiresChallenge: boolean;
}

const RELATIVE_TOLERANCE = 0.02; // 2%: treat as "same value" (rounding, differing snapshot times)

/**
 * The one function in the whole protocol that decides whether two
 * claims are allowed to fight each other economically. Pure, total,
 * deterministic — same inputs always produce the same output, and the
 * function itself (not an LLM's opinion of it) is what gets audited.
 */
export function classifyRelationship(
  a: StructuredPredicate,
  b: StructuredPredicate,
): RelationshipResult {
  if (a.subject !== b.subject) {
    return { relation: "RELATES_TO", reason: "different subjects", requiresChallenge: false };
  }

  if (a.metric !== b.metric) {
    return {
      relation: "RELATES_TO",
      reason: `different predicates (${a.metric} vs ${b.metric}) — e.g. a raise amount is not a valuation`,
      requiresChallenge: false,
    };
  }

  if (a.metric === "GENERIC" || b.metric === "GENERIC") {
    // We could not confidently structure at least one side. Per the
    // safety principle above: never force a fight on an unparsed claim.
    return {
      relation: "RELATES_TO",
      reason: "at least one claim could not be confidently structured — defaulting to non-adversarial",
      requiresChallenge: false,
    };
  }

  // Same subject, same metric, both confidently parsed numeric claims.
  if (typeof a.value === "number" && typeof b.value === "number") {
    const diff = Math.abs(a.value - b.value);
    const denom = Math.max(Math.abs(a.value), Math.abs(b.value), 1);
    if (diff / denom <= RELATIVE_TOLERANCE) {
      // Same predicate, same value within tolerance, but possibly more
      // qualifiers on one side ("Series A", "as of Q1") -> REFINES.
      const aQ = a.qualifiers.length,
        bQ = b.qualifiers.length;
      if (aQ !== bQ) {
        return {
          relation: "REFINES",
          reason: "same predicate and value; one claim adds qualifying detail the other lacks",
          requiresChallenge: false,
        };
      }
      return { relation: "RELATES_TO", reason: "materially equivalent claims", requiresChallenge: false };
    }
    return {
      relation: "CONTRADICTS",
      reason: `same subject and predicate (${a.metric}), materially different values: ${a.value} vs ${b.value}`,
      requiresChallenge: true,
    };
  }

  // Same subject/metric, non-numeric or partially-specified — qualifier
  // containment can still tell us NARROWS/EXTENDS without a fight.
  if (a.qualifiers.every((q) => b.qualifiers.includes(q)) && b.qualifiers.length > a.qualifiers.length) {
    return { relation: "NARROWS", reason: "b adds qualifiers a does not have", requiresChallenge: false };
  }
  if (b.qualifiers.every((q) => a.qualifiers.includes(q)) && a.qualifiers.length > b.qualifiers.length) {
    return { relation: "EXTENDS", reason: "a adds qualifiers b does not have", requiresChallenge: false };
  }

  return { relation: "RELATES_TO", reason: "same predicate family, insufficient basis to declare contradiction", requiresChallenge: false };
}
