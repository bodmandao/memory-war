import type { Challenge } from "@/lib/types";

const STAGES = ["Challenged", "Evidence locked", "Investigated", "Resolved"] as const;

function stageIndex(c: Challenge): number {
  if (c.verdict) return 3;
  if (c.reports.length > 0) return 2;
  if (c.evidenceRoot) return 1;
  return 0;
}

/** A compact 4-stage lifecycle strip for one challenge — "claim created" is implicit (the claim already exists by the time a challenge exists). */
export function ChallengeLifecycle({ challenge }: { challenge: Challenge }) {
  const current = stageIndex(challenge);
  return (
    <div className="flex items-center gap-0">
      {STAGES.map((stage, i) => {
        const done = i <= current;
        const isLast = i === STAGES.length - 1;
        return (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${done ? "bg-accent" : "bg-line"}`} aria-hidden />
              <span className={`whitespace-nowrap text-[10.5px] uppercase tracking-wide ${done ? "text-ink-dim" : "text-ink-faint"}`}>{stage}</span>
            </div>
            {!isLast && <span className={`mx-1.5 mb-4 h-px w-8 sm:w-14 ${i < current ? "bg-accent" : "bg-line"}`} aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
