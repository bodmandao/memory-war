import Link from "next/link";
import type { Challenge } from "@/lib/types";
import { fmtTime, fmtWei, reportVerdictLabel } from "@/lib/format";
import { Card, KV } from "./Card";
import { StatusBadge, ModeBadge, VerdictPill } from "./Badge";
import { Hash } from "./Hash";
import { ChallengeLifecycle } from "./ChallengeLifecycle";
import { EvidenceCard } from "./EvidenceCard";
import { EmptyState } from "./States";
import { Stage } from "./Stage";
import { InvestigatorComparison } from "./InvestigatorComparison";

const CHALLENGE_TYPE_META: Record<string, { title: string; subtitle: string }> = {
  VERIFICATION_REQUEST: { title: "Verification request", subtitle: "Pay-per-verification: no adversary, no liveness window." },
  CONTRADICTION: { title: "Challenge — contradiction", subtitle: "A bonded, adversarial dispute over this claim." },
  SOURCE_QUALITY: { title: "Challenge — source quality", subtitle: "A bonded dispute over the reliability of this claim's sourcing, not its content." },
};

/**
 * Stages 03–07 of the claim dossier (Evidence / Challenge / Investigation
 * / Resolution / Settlement). Always renders all five in fixed numbering,
 * whether or not a challenge exists yet — pending stages show their real
 * pending state rather than being skipped, so numbering never shifts
 * between claims.
 */
export function ChallengeSection({
  challenge,
  investigatorProviders = {},
  stageStart = 3,
}: {
  challenge: Challenge | null;
  investigatorProviders?: Record<string, string>;
  stageStart?: number;
}) {
  if (!challenge) {
    return (
      <>
        <Stage n={stageStart} label="Evidence">
          <Card>
            <EmptyState title="Not triggered">No challenge has been opened against this claim yet — evidence is committed once one is.</EmptyState>
          </Card>
        </Stage>
        <Stage n={stageStart + 1} label="Challenge">
          <Card>
            <EmptyState title="Not triggered">No challenge or verification request opened against this claim yet.</EmptyState>
          </Card>
        </Stage>
        <Stage n={stageStart + 2} label="Investigation">
          <Card>
            <EmptyState title="Not triggered">No investigators assigned — investigation only begins once a challenge is opened.</EmptyState>
          </Card>
        </Stage>
        <Stage n={stageStart + 3} label="Resolution">
          <Card>
            <EmptyState title="Pending">No verdict — nothing has been resolved for this claim yet.</EmptyState>
          </Card>
        </Stage>
        <Stage n={stageStart + 4} label="Settlement" last>
          <Card>
            <EmptyState title="Pending">No on-chain settlement yet.</EmptyState>
          </Card>
        </Stage>
      </>
    );
  }

  const meta = CHALLENGE_TYPE_META[challenge.challengeType] ?? { title: `Challenge — ${challenge.challengeType}`, subtitle: "A bonded, adversarial dispute over this claim." };
  const distinctProviders = new Set(challenge.reports.map((r) => (r.investigatorId ? investigatorProviders[r.investigatorId] : undefined)).filter(Boolean));

  return (
    <>
      <Stage n={stageStart} label="Evidence">
        {challenge.evidenceIds.length > 0 ? (
          <Card subtitle="Content-addressed and locked before investigation begins, so it can't be swapped after the fact.">
            <div className="space-y-2">
              {challenge.evidenceIds.map((h) => (
                <EvidenceCard key={h} hash={h} />
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState title="No data">No evidence submitted for this challenge yet.</EmptyState>
          </Card>
        )}
      </Stage>

      <Stage n={stageStart + 1} label="Challenge">
        <Card title={meta.title} subtitle={meta.subtitle}>
          <div className="mb-5 overflow-x-auto pb-1">
            <ChallengeLifecycle challenge={challenge} />
          </div>
          <KV
            rows={[
              { k: "Challenge ID", v: <Hash value={challenge.id} /> },
              { k: "State", v: <StatusBadge status={challenge.state} /> },
              { k: "Challenger", v: <Hash value={challenge.challenger} len={6} /> },
              { k: "Bond / fee", v: fmtWei(challenge.bondWei) },
              { k: "Evidence root", v: <Hash value={challenge.evidenceRoot} /> },
              { k: "Opened", v: fmtTime(challenge.openedAt) },
            ]}
          />
        </Card>
      </Stage>

      <Stage n={stageStart + 2} label="Investigation">
        <Card subtitle="Each investigator evaluates independently, with no visibility into the others' conclusions before submitting.">
          {challenge.reports.length === 0 ? (
            <EmptyState title="Pending">No reports submitted yet.</EmptyState>
          ) : (
            <>
              <InvestigatorComparison reports={challenge.reports} investigatorProviders={investigatorProviders} />
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line-soft bg-ground/40 px-3 py-2 text-[12px]">
                <span className="text-ink-faint">Model providers represented:</span>
                {distinctProviders.size > 0 ? (
                  [...distinctProviders].map((p) => (
                    <span key={p} className="rounded-full border border-line px-2 py-0.5 font-mono text-ink-dim">
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-ink-faint">not resolvable — no persistent identity linked to these reports</span>
                )}
                <span className={`ml-auto font-mono ${distinctProviders.size >= 2 ? "text-true_" : "text-contested"}`}>
                  {distinctProviders.size} distinct{distinctProviders.size < 2 && " — below the reference procedure's diversity threshold"}
                </span>
              </div>
              <div className="space-y-4">
                {challenge.reports.map((r, i) => {
                  const provider = r.investigatorId ? investigatorProviders[r.investigatorId] : undefined;
                  return (
                    <div key={i} className="border-b border-line-soft pb-4 last:border-0 last:pb-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <VerdictPill verdict={r.verdict} />
                        <ModeBadge mode={r.attestationMode} />
                        {provider && <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-dim">{provider}</span>}
                        {!r.attestationVerified && <span className="text-[11px] text-ink-faint">verified={String(r.attestationVerified)}</span>}
                      </div>
                      <KV
                        rows={[
                          { k: "Investigator", v: <Hash value={r.investigator} len={6} /> },
                          {
                            k: "Identity",
                            v: r.investigatorId ? (
                              <Link href={`/investigators/${r.investigatorId}`} className="font-mono text-[13px] text-accent hover:underline">
                                {r.investigatorId.slice(0, 10)}…
                              </Link>
                            ) : (
                              <span className="text-ink-faint">address-only (no persistent identity linked)</span>
                            ),
                          },
                          { k: "Evidence bundle", v: <Hash value={r.evidenceBundleHash} /> },
                          { k: "Report commitment (reasoning hash)", v: <Hash value={r.reportCommitment} /> },
                          { k: "Submitted", v: fmtTime(r.at) },
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </Stage>

      <Stage n={stageStart + 3} label="Resolution">
        <Card title="Mechanical, not discretionary" subtitle="Derived on-chain from the reports above; a caller cannot resolve to any status those reports don't support.">
          {!challenge.verdict ? (
            <EmptyState title="Pending">
              {challenge.reports.length > 0 ? "Reports are in, but this case hasn't been resolved on-chain yet." : "Not yet resolved — awaiting reports."}
            </EmptyState>
          ) : (
            <>
              <div
                className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-[13px] ${
                  challenge.verdict.status === "CONTESTED" ? "border-contested/40 bg-contested/10" : "border-accent-dim bg-accent-soft/40"
                }`}
              >
                <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-dim">mw-default/v1</span>
                <span className="font-mono text-ink">
                  {challenge.reports.length} independent investigator{challenge.reports.length === 1 ? "" : "s"} →{" "}
                  {(["INSUFFICIENT_EVIDENCE", "SUPPORTS", "REJECTS"] as const)
                    .map((label, verdictIdx) => [label, challenge.reports.filter((r) => r.verdict === verdictIdx).length] as const)
                    .filter(([, count]) => count > 0)
                    .map(([label, count]) => `${count} ${label}`)
                    .join(", ")}
                </span>
                <span className="text-ink-faint">→</span>
                <StatusBadge status={challenge.verdict.status} />
              </div>
              <KV
                rows={[
                  { k: "Status", v: <StatusBadge status={challenge.verdict.status} /> },
                  { k: "Procedure", v: <span className="font-mono">mw-default/v1 — see packages/protocol-core/src/resolution.ts</span> },
                  { k: "Procedure hash", v: <Hash value={challenge.verdict.procedureHash} /> },
                  { k: "Reports root", v: <Hash value={challenge.verdict.reportsRoot} /> },
                  { k: "Dissent root", v: <Hash value={challenge.verdict.dissentRoot} /> },
                  { k: "Resolved", v: fmtTime(challenge.verdict.resolvedAt) },
                ]}
              />
              {challenge.reports.some((r) => r.verdict !== challenge.reports[0]?.verdict) && (
                <p className="mt-3 rounded-lg border border-contested/30 bg-contested/5 p-3 text-[12px] leading-relaxed text-contested">
                  Investigators disagreed on this case ({challenge.reports.map((r) => reportVerdictLabel(r.verdict)).join(" / ")}). The
                  dissent is preserved above, not averaged into the final status.
                </p>
              )}
            </>
          )}
        </Card>
      </Stage>

      <Stage n={stageStart + 4} label="Settlement" last>
        <Card subtitle="Real on-chain native-value transfers, settled in the same transaction as the verdict above.">
          {challenge.payouts.length === 0 ? (
            <EmptyState title="Pending">No on-chain settlement yet.</EmptyState>
          ) : (
            <KV
              rows={[
                { k: "Bond / fee posted", v: fmtWei(challenge.bondWei) },
                {
                  k: "Paid to investigators",
                  v: (
                    <ul className="space-y-2">
                      {challenge.payouts.map((p, i) => (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-3">
                          <Hash value={p.investigator} len={6} />
                          <span className="font-mono text-ink">{fmtWei(p.amountWei)}</span>
                          <span className="text-ink-faint">{fmtTime(p.at)}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                },
                { k: "On-chain status", v: <span className="text-true_">settled</span> },
              ]}
            />
          )}
        </Card>
        {challenge.appeals.length > 0 && (
          <Card title="Appeals" subtitle="Append-only — filing or resolving an appeal never edits the original verdict entry above." className="mt-4">
            <ul className="space-y-2">
              {challenge.appeals.map((a) => (
                <li key={a.appealId} className="text-[13px] text-ink-dim">
                  Appeal #{a.appealId} by <Hash value={a.filedBy} len={6} /> — &ldquo;{a.reason}&rdquo; —{" "}
                  {a.resolved ? <>resolved → <StatusBadge status={a.newStatus ?? "INCONCLUSIVE"} /></> : <span className="text-contested">pending</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Stage>
    </>
  );
}
