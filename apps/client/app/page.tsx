"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { Claim, Investigator } from "@/lib/types";
import { StatCounter } from "@/components/StatCounter";
import { Card } from "@/components/Card";
import { InfraBadge } from "@/components/Badge";
import { ProtocolFlow } from "@/components/ProtocolFlow";
import { NetworkBackground } from "@/components/NetworkBackground";
import { IndexerUnavailable, LocalDemonstrationNote } from "@/components/States";
import { DashboardMetricsSkeleton } from "@/components/Skeletons";

type Stats = { claims: number; resolved: number; contested: number; open: number; investigators: number } | null;

export default function LandingPage() {
  const [stats, setStats] = useState<Stats>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ claims }, { investigators }] = await Promise.all([api.claims(), api.investigators()]);
        if (cancelled) return;
        const resolved = claims.filter((c: Claim) => c.status === "TRUE" || c.status === "FALSE").length;
        const contested = claims.filter((c: Claim) => c.status === "CONTESTED").length;
        const open = claims.filter((c: Claim) => c.status === "OPEN").length;
        setStats({ claims: claims.length, resolved, contested, open, investigators: investigators.length });
        setReachable(true);
      } catch {
        if (!cancelled) setReachable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative -mx-6 overflow-hidden px-6 pb-4 pt-12 sm:pt-16">
        <div className="absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" aria-hidden />
        <NetworkBackground />
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative mx-auto max-w-content">
          <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-accent">MEMORY WAR · built on 0G</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-[clamp(1.9rem,4.6vw,3rem)] font-bold leading-[1.12] text-ink">
            When AI remembers something, who gets to decide whether it&apos;s true?
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
            A persistent, adversarially verifiable knowledge layer for machine-generated claims. Claims aren&apos;t
            simply stored as facts — they can be challenged, independently investigated, mechanically resolved, and
            permanently audited, even after they&apos;re superseded.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/playground" className="rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-ground shadow-glow-accent transition-transform hover:scale-[1.02]">
              Run a live scenario
            </Link>
            <Link href="/claims" className="rounded-lg border border-line px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-accent hover:text-accent">
              Explore claims
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Protocol flow — interactive, hover/click any stage */}
      <section>
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">How a claim moves through the protocol</h2>
        <ProtocolFlow />
      </section>

      {/* Live stats — dominant, first thing under the hero */}
      <section>
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Protocol activity</h2>
        {reachable === false && <IndexerUnavailable />}
        {reachable === null && <DashboardMetricsSkeleton />}
        {reachable === true && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCounter label="Claims" value={stats?.claims ?? null} />
            <StatCounter label="Open" value={stats?.open ?? null} />
            <StatCounter label="Resolved" value={stats?.resolved ?? null} />
            <StatCounter label="Contested" value={stats?.contested ?? null} />
            <StatCounter label="Investigators" value={stats?.investigators ?? null} />
          </div>
        )}
      </section>

      {/* 0G integration honesty */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">0G integration status (this build, by default)</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-ink-faint">STORAGE</span>
            <InfraBadge state="LOCAL_DEMO" />
            <span className="ml-2 text-[11px] text-ink-faint">COMPUTE</span>
            <InfraBadge state="SIMULATED" />
            <span className="ml-2 text-[11px] text-ink-faint">DA</span>
            <InfraBadge state="COMMITMENT_READY" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="0G Storage" subtitle="Evidence, claim text, and investigator reasoning are content-addressed and never stored raw on-chain.">
          <p className="mb-3 text-[13px] leading-relaxed text-ink-dim">The live path calls the real 0G Storage SDK.</p>
          <LocalDemonstrationNote>
            Without a funded wallet and indexer RPC configured, every adapter falls back honestly here — real
            content-hashing and real tamper detection, against a local content-addressed store. Never upgraded in the
            UI to look more impressive than what actually happened.
          </LocalDemonstrationNote>
        </Card>
        <Card title="0G Compute" subtitle="Independent investigators evaluate evidence and issue signed reports.">
          <p className="mb-3 text-[13px] leading-relaxed text-ink-dim">
            Live mode runs on 0G Compute with TEE attestation (Intel TDX / NVIDIA H100-H200). TEE attestation proves a
            specific model produced a specific output from a specific input — it does not prove the claim is true.
          </p>
          <LocalDemonstrationNote>
            Without a funded ledger, this falls back to a real local LLM call, or with no model key at all, a
            deterministic rule-based stub labeled SIMULATED.
          </LocalDemonstrationNote>
        </Card>
      </section>

      {/* Scaling posture — DA and identity decisions, stated plainly rather than implemented decoratively */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="High-throughput DA commitments" subtitle="Not wired to a live network call in this build.">
          <p className="text-[13px] leading-relaxed text-ink-dim">
            Every evidence artifact is already individually content-addressed and retrievable from 0G Storage, and
            every state transition is already a cheap, individually-verifiable on-chain event — there is no
            undifferentiated batch a light client would otherwise have to trust blindly, which is the problem 0G DA
            actually solves. The batch-commitment math this would need is implemented and tested (
            <code className="font-mono text-accent">packages/protocol-core/src/daBatch.ts</code>) for a future
            high-volume deployment, but calling a live DA network today would be decoration, not engineering.
          </p>
        </Card>
        <Card title="Why investigator identity isn't ERC-7857" subtitle="Agentic ID was considered and deliberately not used here.">
          <p className="text-[13px] leading-relaxed text-ink-dim">
            ERC-7857 (Agentic ID) is built for encrypted, transferable intelligence — a fundamentally different shape
            than what an investigator needs, which is a persistent, publicly auditable identity with explicit
            version lineage across key rotation. <code className="font-mono text-accent">InvestigatorRegistry.sol</code>{" "}
            provides exactly that, is not transferable, and is not encrypted — reputation has to stay visible to mean
            anything.
          </p>
        </Card>
      </section>

      {/* Core innovation, tied to real protocol behavior rather than marketing language */}
      <section>
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">The central idea, and what actually enforces it</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Genuinely implemented guarantees">
            <ul className="space-y-2 text-[13px] leading-relaxed text-ink-dim">
              <li>· <span className="text-ink">Persistent, immutable claims</span> — every claim is content-addressed; changing the text produces a new claim, not a silent edit.</li>
              <li>· <span className="text-ink">Immutable evidence commitments</span> — evidence is hashed and locked before investigation begins, so it can&apos;t be swapped after the fact.</li>
              <li>· <span className="text-ink">Adversarial challenges</span> — a genuine contradiction requires a bond; agreement-in-form (RELATES_TO / REFINES / NARROWS / EXTENDS) never does.</li>
              <li>· <span className="text-ink">Mechanical, disclosed resolution</span> — a verdict must match the reports actually submitted on-chain, or the transaction reverts (see a claim&apos;s Resolution section for the exact procedure).</li>
              <li>· <span className="text-ink">Dissent preservation</span> — disagreement among investigators resolves to CONTESTED, and is recorded in full, never averaged into a single score.</li>
              <li>· <span className="text-ink">Economic incentives</span> — bonds and investigator fees are paid out atomically with the verdict, in the same transaction.</li>
              <li>· <span className="text-ink">Complete historical provenance</span> — superseded claims remain permanently queryable, never deleted (see any claim&apos;s History section).</li>
            </ul>
          </Card>
          <Card title="What is not claimed">
            <ul className="space-y-2 text-[13px] leading-relaxed text-ink-dim">
              <li>· Not protection against arbitrary mempool front-running or MEV.</li>
              <li>· TEE attestation is not a truth oracle — see the Compute note above.</li>
              <li>
                · <span className="text-ink">Model/provider diversity</span> is required by the off-chain reference
                resolution procedure (<code className="font-mono text-accent">mw-default/v1</code>, at least 2 distinct
                model providers) but is <span className="text-contested">not yet checked by the deployed contract</span> —
                the contract enforces report count and verdict-consistency on-chain, not provider identity. Sybil/
                monoculture addresses can still satisfy the count threshold today.
              </li>
              <li>· No live 0G Data Availability integration in this build — see above for why.</li>
            </ul>
          </Card>
        </div>
      </section>
    </div>
  );
}
