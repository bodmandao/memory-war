"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { Investigator } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { Card } from "@/components/Card";
import { Hash } from "@/components/Hash";
import { EmptyState, IndexerUnavailable } from "@/components/States";
import { InvestigatorsGridSkeleton } from "@/components/Skeletons";

export default function InvestigatorsPage() {
  const [investigators, setInvestigators] = useState<Investigator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const { investigators } = await api.investigators();
      setInvestigators(investigators.sort((a, b) => b.registeredAt - a.registeredAt));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load investigators.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-accent">Persistent protocol identities, not disposable wallet addresses</p>
        <h1 className="mt-1 font-display text-[26px] font-bold text-ink">Investigators</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
          Portable identities (<code className="font-mono text-accent">InvestigatorRegistry.sol</code>) — deliberately
          not ERC-7857 Agentic IDs, since an investigator needs auditable lineage, not encrypted transferable
          intelligence. An identity survives key rotation and accumulates a public calibration history across every
          investigation it&apos;s linked to.
        </p>
      </div>

      {error && <IndexerUnavailable onRetry={load} />}
      {!error && investigators === null && <InvestigatorsGridSkeleton />}
      {!error && investigators !== null && investigators.length === 0 && (
        <EmptyState title="No investigators registered">Run Scenario C in the Playground to register two.</EmptyState>
      )}
      {!error && investigators && investigators.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {investigators.map((inv, i) => (
            <motion.div key={inv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
              <Link href={`/investigators/${inv.id}`}>
                <Card className="h-full transition-colors hover:border-accent">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-ink">{inv.modelProvider}</h3>
                    <span className="text-[11px] text-ink-faint">{fmtTime(inv.registeredAt)}</span>
                  </div>
                  <dl className="space-y-1.5 text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Identity</dt>
                      <dd>
                        <Hash value={inv.id} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Controller</dt>
                      <dd>
                        <Hash value={inv.controller} len={6} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Lineage</dt>
                      <dd className="text-ink-dim">{inv.parentId ? "succeeds a prior identity" : "original — no parent"}</dd>
                    </div>
                    {inv.calibration && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-faint">Investigations</dt>
                        <dd className="font-mono text-ink-dim">{inv.calibration.totalInvestigations}</dd>
                      </div>
                    )}
                  </dl>
                  {inv.calibration && inv.calibration.totalInvestigations > 0 && (
                    <div className="mt-3 flex overflow-hidden rounded-full border border-line-soft" title="agreed / disagreed / pending, vs. each case's final on-chain verdict">
                      {(
                        [
                          ["agreed", inv.calibration.agreed, "bg-true_"],
                          ["disagreed", inv.calibration.disagreed, "bg-false_"],
                          ["pending", inv.calibration.pending, "bg-line"],
                        ] as const
                      ).map(([label, count, cls]) =>
                        count > 0 ? <div key={label} className={`h-1.5 ${cls}`} style={{ width: `${(count / inv.calibration!.totalInvestigations) * 100}%` }} /> : null,
                      )}
                    </div>
                  )}
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
