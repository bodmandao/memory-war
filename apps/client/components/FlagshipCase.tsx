"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { Challenge, Claim } from "@/lib/types";
import { fmtTime, fmtWei } from "@/lib/format";
import { StatusBadge, ModeBadge, VerdictPill } from "./Badge";
import { Hash } from "./Hash";
import { Skeleton } from "./States";

/**
 * The verified, resolved mainnet case from this build's own audit pass
 * (docs/AUDIT.md Addendum 8) — resolved entirely through the real data
 * layer: nothing here is hardcoded except which claim ID to look up.
 * Claim text itself comes from a real /content/:hash fetch, exactly
 * like the claim detail page does, so it's honest even if this
 * instance is pointed at a different deployment where this claim
 * doesn't exist — in which case the section simply doesn't render.
 */
const FLAGSHIP_CLAIM_ID = "0x4b5404e369419e2c95a075f811a6a926ec09f1e68ce4c3b06f4a73e0294fd93c";

export function FlagshipCase() {
  const [data, setData] = useState<{ claim: Claim; challenge: Challenge; text: string | null } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { claim, challenges } = await api.claim(FLAGSHIP_CLAIM_ID);
        const challenge = challenges[0];
        if (!challenge || !challenge.verdict) throw new Error("not yet resolved on this deployment");
        const text = await api.content(claim.textHash).then((r) => r.text).catch(() => null);
        if (cancelled) return;
        setData({ claim, challenge, text });
        setState("ready");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unavailable") return null; // this specific case isn't indexed on this deployment — say nothing rather than show a broken card

  return (
    <section>
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">A resolved case, on real 0G mainnet</h2>
      {state === "loading" ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : (
        data && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-hidden rounded-xl border border-accent-dim bg-gradient-to-br from-surface via-surface to-accent-soft/30"
          >
            <div className="p-6 sm:p-7">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-line-soft bg-ground/60 px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
                  Flagship case
                </span>
                <StatusBadge status={data.claim.status} />
              </div>
              <p className="mt-3 max-w-xl text-[17px] font-medium leading-snug text-ink">{data.text ?? "claim text unavailable"}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-dim">
                <span>
                  Claim <Hash value={data.claim.id} len={6} />
                </span>
                <span>
                  Challenge <Hash value={data.challenge.id} len={6} />
                </span>
                <span>Resolved {fmtTime(data.challenge.verdict?.resolvedAt)}</span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {data.challenge.reports.map((r, i) => (
                  <div key={i} className="rounded-lg border border-line-soft bg-ground/40 p-3.5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-ink-faint">Investigator {i === 0 ? "A" : "B"}</span>
                      <VerdictPill verdict={r.verdict} />
                      <ModeBadge mode={r.attestationMode} />
                    </div>
                    <Hash value={r.investigator} len={8} />
                  </div>
                ))}
              </div>

              {data.challenge.payouts.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-faint">
                  <span>Paid on-chain, atomically with the verdict:</span>
                  {data.challenge.payouts.map((p, i) => (
                    <span key={i} className="font-mono text-accent">
                      {fmtWei(p.amountWei)}
                    </span>
                  ))}
                </div>
              )}

              <Link
                href={`/claims/${data.claim.id}`}
                className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-ground shadow-glow-accent transition-transform hover:scale-[1.02]"
              >
                Inspect live case →
              </Link>
            </div>
          </motion.div>
        )
      )}
    </section>
  );
}
