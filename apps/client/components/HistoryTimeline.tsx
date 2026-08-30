import Link from "next/link";
import type { Challenge, Claim } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { Hash } from "./Hash";
import { Card } from "./Card";

interface HistoryEvent {
  at: number;
  label: string;
  detail?: React.ReactNode;
}

/**
 * Aggregates every real, already-fetched timestamped sub-event for a claim
 * (creation, relationships, challenge lifecycle, reports, resolution,
 * payouts, appeals) into one chronological record. Nothing here is a new
 * API call or a synthesized status snapshot — it's the same data already
 * shown elsewhere on the page, reordered to make one thing undeniable: the
 * claim's record only ever grows, it is never rewritten or deleted.
 */
export function HistoryTimeline({ claim, challenges }: { claim: Claim; challenges: Challenge[] }) {
  const events: HistoryEvent[] = [];

  events.push({ at: claim.createdAt, label: "Claim recorded", detail: <span className="text-ink-faint">record time — see the claim&apos;s valid time range separately</span> });

  for (const r of claim.relationships) {
    events.push({
      at: r.at,
      label: `Classified as ${r.relation}`,
      detail: (
        <Link href={`/claims/${r.withClaimId}`} className="text-accent hover:underline">
          {r.direction === "outgoing" ? "→" : "←"} <Hash value={r.withClaimId} />
        </Link>
      ),
    });
  }

  for (const c of challenges) {
    events.push({ at: c.openedAt, label: `${c.challengeType === "VERIFICATION_REQUEST" ? "Verification requested" : "Challenge opened"}`, detail: <Hash value={c.id} /> });
    for (const r of c.reports) {
      events.push({ at: r.at, label: "Investigation report submitted", detail: <Hash value={r.investigator} len={6} /> });
    }
    if (c.verdict) {
      events.push({ at: c.verdict.resolvedAt, label: `Resolved — ${c.verdict.status}`, detail: <span className="text-ink-faint">mw-default/v1</span> });
    }
    for (const p of c.payouts) {
      events.push({ at: p.at, label: "Investigator paid", detail: <Hash value={p.investigator} len={6} /> });
    }
    for (const a of c.appeals) {
      events.push({ at: a.filedAt, label: `Appeal #${a.appealId} filed${a.resolved ? ` — resolved → ${a.newStatus}` : ""}`, detail: <span className="text-ink-faint">&ldquo;{a.reason}&rdquo;</span> });
    }
  }

  events.sort((a, b) => a.at - b.at);

  return (
    <Card title="History" subtitle="A bad claim does not disappear. Its full history — including anything that superseded it — becomes permanent, queryable evidence.">
      <ol className="relative ml-3">
        {events.map((e, i) => (
          <li key={i} className="relative pb-6 pl-6 last:pb-0">
            {i < events.length - 1 && <span className="absolute left-[3px] top-2.5 h-full w-px bg-line" aria-hidden />}
            <span className="absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full bg-accent" aria-hidden />
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-medium text-ink">{e.label}</span>
              <span className="text-[11px] text-ink-faint">{fmtTime(e.at)}</span>
            </div>
            {e.detail && <div className="mt-0.5 text-[12.5px]">{e.detail}</div>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
