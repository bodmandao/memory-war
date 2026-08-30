import Link from "next/link";
import type { Relationship } from "@/lib/types";
import { Card } from "./Card";
import { Hash } from "./Hash";
import { EmptyState } from "./States";
import { fmtTime } from "@/lib/format";

// Static, honest per-relation explanations of what the protocol's predicate
// classifier decided and why — not a per-instance "reason" the indexer
// doesn't record, but the actual, fixed rule this relation type means.
const RELATION_META: Record<string, { label: string; explains: string; bonded: boolean }> = {
  CONTRADICTS: { label: "CONTRADICTS", explains: "A genuine logical conflict over the same predicate and subject — the only relation type that requires a bonded challenge to resolve.", bonded: true },
  RELATES_TO: { label: "RELATES_TO", explains: "The claims share a subject or predicate but do not conflict — classified as agreement-in-form, not a dispute. No bond, no challenge.", bonded: false },
  REFINES: { label: "REFINES", explains: "This claim adds precision to another without contradicting it (e.g. a more specific value or timeframe). No bond, no challenge.", bonded: false },
  NARROWS: { label: "NARROWS", explains: "This claim restricts the scope of another without conflicting with it. No bond, no challenge.", bonded: false },
  EXTENDS: { label: "EXTENDS", explains: "This claim builds on another without conflicting with it. No bond, no challenge.", bonded: false },
  SUPERSEDES: { label: "SUPERSEDES", explains: "This claim replaces another as current — the prior claim is marked SUPERSEDED, not deleted; its full record stays permanently queryable.", bonded: false },
};

export function InterpretationCard({ relationships }: { relationships: Relationship[] }) {
  return (
    <Card
      title="Interpretation"
      subtitle="Predicate disambiguation decides, before anything economic happens, whether two claims genuinely conflict or merely relate."
    >
      {relationships.length === 0 ? (
        <EmptyState>This claim hasn&apos;t been compared against another yet — nothing to disambiguate.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {relationships.map((r, i) => {
            const meta = RELATION_META[r.relation] ?? { label: r.relation, explains: "", bonded: false };
            return (
              <li key={i} className="rounded-lg border border-line-soft bg-ground/40 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium ${meta.bonded ? "border-false_/30 bg-false_/10 text-false_" : "border-line text-ink-dim"}`}>
                    {meta.label}
                  </span>
                  <span className="text-ink-faint">{r.direction === "outgoing" ? "→" : "←"}</span>
                  <Link href={`/claims/${r.withClaimId}`} className="font-mono text-[13px] text-ink hover:text-accent">
                    <Hash value={r.withClaimId} />
                  </Link>
                  <span className="text-[11px] text-ink-faint">{fmtTime(r.at)}</span>
                </div>
                {meta.explains && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">{meta.explains}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
