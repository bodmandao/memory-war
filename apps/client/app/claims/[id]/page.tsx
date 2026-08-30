"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { Challenge, Claim } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { Card, KV } from "@/components/Card";
import { StatusBadge } from "@/components/Badge";
import { Hash } from "@/components/Hash";
import { ErrorState } from "@/components/States";
import { ClaimDossierSkeleton } from "@/components/Skeletons";
import { ChallengeSection } from "@/components/ChallengeSection";
import { InterpretationCard } from "@/components/InterpretationCard";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { Stage } from "@/components/Stage";

export default function ClaimDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ claim: Claim; challenges: Challenge[] } | null>(null);
  const [investigatorProviders, setInvestigatorProviders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setData(null);
    try {
      const [result, { investigators }] = await Promise.all([api.claim(params.id), api.investigators().catch(() => ({ investigators: [] }))]);
      setData(result);
      setInvestigatorProviders(Object.fromEntries(investigators.map((inv) => [inv.id, inv.modelProvider])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this claim.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <ClaimDossierSkeleton />;

  const { claim, challenges } = data;
  const [primary, ...additional] = challenges;

  return (
    <div className="space-y-2">
      {/* Case header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-10">
        <Link href="/claims" className="text-[12px] text-ink-faint hover:text-accent">
          ← Claims
        </Link>
        <div className="mt-3 rounded-xl border border-line bg-gradient-to-br from-surface to-surface-raised p-6 sm:p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">Case file</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[20px] font-bold text-ink">Claim dossier</h1>
            <StatusBadge status={claim.status} />
          </div>
          <p className="mt-2 break-all font-mono text-[12px] text-ink-dim">{claim.id}</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-faint">
            <span>Recorded {fmtTime(claim.createdAt)}</span>
            <span>Author <Hash value={claim.author} len={6} /></span>
            <span>{challenges.length} challenge{challenges.length === 1 ? "" : "s"} / verification request{challenges.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </motion.div>

      <Stage n={1} label="Claim">
        <Card>
          <KV
            rows={[
              { k: "Claim ID", v: <Hash value={claim.id} full /> },
              { k: "Author", v: <Hash value={claim.author} len={6} /> },
              { k: "Predicate hash", v: <Hash value={claim.predicateHash} /> },
              { k: "Text hash", v: <Hash value={claim.textHash} /> },
              { k: "Record time", v: fmtTime(claim.createdAt) },
              { k: "Valid from", v: `${fmtTime(claim.validFrom)}${claim.validUntil ? ` → ${fmtTime(claim.validUntil)}` : " → (open-ended)"}` },
            ]}
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            Claim text itself is content-addressed, not stored on-chain — the text hash above commits to it. See Evidence
            below for how content is retrieved from the configured storage adapter.
          </p>
        </Card>
      </Stage>

      <Stage n={2} label="Interpretation">
        <InterpretationCard relationships={claim.relationships} />
      </Stage>

      <ChallengeSection challenge={primary ?? null} investigatorProviders={investigatorProviders} stageStart={3} />

      {additional.length > 0 && (
        <div className="mb-8 ml-12 space-y-4 border-l border-dashed border-line-soft pl-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Additional challenges on this claim ({additional.length})</p>
          {additional.map((c) => (
            <ChallengeSection key={c.id} challenge={c} investigatorProviders={investigatorProviders} stageStart={3} />
          ))}
        </div>
      )}

      <Stage n={8} label="History" last>
        <HistoryTimeline claim={claim} challenges={challenges} />
      </Stage>
    </div>
  );
}
