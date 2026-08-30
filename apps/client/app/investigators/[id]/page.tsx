"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { Investigator, Challenge } from "@/lib/types";
import { fmtTime, fmtWei } from "@/lib/format";
import { Card, KV } from "@/components/Card";
import { Hash } from "@/components/Hash";
import { StatusBadge } from "@/components/Badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";

interface Detail {
  investigator: Investigator;
  calibration: Investigator["calibration"];
  payouts: Array<{ challengeId: string; amountWei: string; at: number }>;
}

export default function InvestigatorDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setData(null);
    try {
      const { investigator, calibration } = await api.investigator(params.id);
      // Payouts aren't a field on the investigator record itself — they
      // live on each linked challenge. Cross-reference them here rather
      // than inventing an aggregate the indexer doesn't actually compute.
      const challenges = await Promise.all(
        investigator.linkedReports.map((lr) => api.challenge(lr.challengeId).then((r) => r.challenge).catch((): Challenge | null => null)),
      );
      const payouts = challenges
        .filter((c): c is Challenge => c !== null)
        .flatMap((c) => c.payouts.filter((p) => p.investigator.toLowerCase() === investigator.controller.toLowerCase()).map((p) => ({ challengeId: c.id, amountWei: p.amountWei, at: p.at })));
      setData({ investigator, calibration, payouts });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this investigator.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Loading investigator identity…" />;

  const { investigator: inv, calibration, payouts } = data;
  const totalEarnedWei = payouts.reduce((sum, p) => sum + BigInt(p.amountWei), 0n);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/investigators" className="text-[12px] text-ink-faint hover:text-accent">
          ← Investigators
        </Link>
        <h1 className="mt-2 text-[22px] font-semibold text-ink">{inv.modelProvider}</h1>
      </div>

      <Card title="Identity">
        <KV
          rows={[
            { k: "Investigator ID", v: <Hash value={inv.id} full /> },
            { k: "Current controller", v: <Hash value={inv.controller} len={8} /> },
            { k: "Registered", v: fmtTime(inv.registeredAt) },
            {
              k: "Lineage",
              v: inv.parentId ? (
                <Link href={`/investigators/${inv.parentId}`} className="text-accent hover:underline">
                  succeeds <Hash value={inv.parentId} />
                </Link>
              ) : (
                <span className="text-ink-dim">original — no parent identity</span>
              ),
            },
          ]}
        />
      </Card>

      {inv.controllerHistory.length > 0 && (
        <Card title="Controller rotation history" subtitle="Identity persists across key rotation — reputation isn't lost when a controlling key changes.">
          <ul className="space-y-2">
            {inv.controllerHistory.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-dim">
                <Hash value={h.from} len={6} /> <span className="text-ink-faint">→</span> <Hash value={h.to} len={6} />
                <span className="text-ink-faint">({fmtTime(h.at)})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Calibration" subtitle="Computed at read time from every linked report vs. that case's final on-chain verdict — never stored as an opaque score.">
        {calibration && calibration.totalInvestigations > 0 ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Agreed", value: calibration.agreed, cls: "text-true_" },
                { label: "Disagreed", value: calibration.disagreed, cls: "text-false_" },
                { label: "Pending", value: calibration.pending, cls: "text-ink-dim" },
                { label: "In contested cases", value: calibration.contestedInvolvement, cls: "text-contested" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-line-soft bg-ground/40 px-3 py-2.5">
                  <div className={`font-mono text-[20px] font-semibold ${s.cls}`}>{s.value}</div>
                  <div className="text-[11px] text-ink-faint">{s.label}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-2">
              {calibration.investigations.map((i, idx) => (
                <li key={idx} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-dim">
                  {i.claimId ? (
                    <Link href={`/claims/${i.claimId}`} className="hover:text-accent">
                      <Hash value={i.claimId} />
                    </Link>
                  ) : (
                    <span className="text-ink-faint">claim unknown</span>
                  )}
                  <span>reported</span>
                  <span className="font-mono text-ink">{i.reportVerdict ?? "—"}</span>
                  <span>· final:</span>
                  {i.finalVerdict ? <StatusBadge status={i.finalVerdict} /> : <span className="text-ink-faint">pending</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState>No linked investigations yet.</EmptyState>
        )}
      </Card>

      <Card title="Payouts" subtitle="Real on-chain transfers to this identity's current controller address, paid atomically with each case's verdict.">
        {payouts.length === 0 ? (
          <EmptyState>No payouts recorded for this identity yet.</EmptyState>
        ) : (
          <>
            <p className="mb-3 font-mono text-[20px] font-semibold text-accent">{fmtWei(totalEarnedWei)}</p>
            <ul className="space-y-2">
              {payouts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[13px] text-ink-dim">
                  <Link href={`/claims`} className="hover:text-accent">
                    <Hash value={p.challengeId} />
                  </Link>
                  <span className="font-mono text-ink">{fmtWei(p.amountWei)}</span>
                  <span>{fmtTime(p.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
