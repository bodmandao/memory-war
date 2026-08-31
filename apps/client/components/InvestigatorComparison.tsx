import type { Report } from "@/lib/types";
import { reportVerdictLabel } from "@/lib/format";
import { ModeBadge } from "./Badge";
import { Hash } from "./Hash";

function ClaimPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-accent-dim bg-accent-soft px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-accent">
      {children}
    </span>
  );
}

/** A compact, glanceable comparison of independent reports on one case — agreement, disagreement, and provider diversity at a glance, before the detailed per-report cards below. */
export function InvestigatorComparison({ reports, investigatorProviders }: { reports: Report[]; investigatorProviders: Record<string, string> }) {
  if (reports.length < 2) return null;

  const verdicts = reports.map((r) => r.verdict);
  const unanimous = verdicts.every((v) => v === verdicts[0]);

  // Each of these is only ever shown when the underlying indexed data
  // genuinely supports it — never inferred from the scenario or the
  // number of report rows alone.
  const distinctAddresses = new Set(reports.map((r) => r.investigator.toLowerCase())).size;
  const distinctProviders = new Set(reports.map((r) => (r.investigatorId ? investigatorProviders[r.investigatorId] : undefined)).filter(Boolean)).size;
  const allTeeVerified = reports.every((r) => r.attestationMode === "0G_COMPUTE_TEE" && r.attestationVerified);

  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-line-soft">
      {(distinctAddresses >= 2 || distinctProviders >= 2 || allTeeVerified) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-ground/30 px-3 py-2.5">
          {distinctAddresses >= 2 && <ClaimPill>Independent</ClaimPill>}
          {distinctProviders >= 2 && <ClaimPill>Model-diverse</ClaimPill>}
          {allTeeVerified && <ClaimPill>TEE verified</ClaimPill>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line-soft bg-ground/40 text-[10.5px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-medium">Investigator</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
              <th className="px-3 py-2 font-medium">Attestation</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => {
              const provider = r.investigatorId ? investigatorProviders[r.investigatorId] : undefined;
              const agrees = r.verdict === verdicts[0];
              return (
                <tr key={i} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-2">
                    <Hash value={r.investigator} len={6} />
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-dim">{provider ?? "unknown"}</td>
                  <td className="px-3 py-2">
                    <span className={`font-mono ${agrees || unanimous ? "text-ink" : "text-contested"}`}>{reportVerdictLabel(r.verdict)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <ModeBadge mode={r.attestationMode} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`border-t border-line-soft px-3 py-2 text-[11.5px] ${unanimous ? "text-ink-faint" : "text-contested"}`}>
        {unanimous ? "All investigators agree." : "Investigators disagree — preserved as dissent, not averaged away."}
      </div>
    </div>
  );
}
