"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Health } from "@/lib/types";
import { networkFromRpc } from "@/lib/network";
import { Hash } from "./Hash";
import { InfraBadge } from "./Badge";
import { Skeleton } from "./States";

/**
 * Real values only — the network name/chain ID are derived from
 * whichever CHAIN_RPC_URL the indexer is actually configured against
 * (never hardcoded as "0G Mainnet"), and the contract addresses come
 * straight from the indexer's own /health response. If this is pointed
 * at a different network tomorrow, this panel reflects that honestly
 * instead of silently lying.
 */
export function InfrastructureProof() {
  const [health, setHealth] = useState<Health | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => {
        if (!cancelled) {
          setHealth(h);
          setReachable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReachable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const network = networkFromRpc(health?.rpcUrl);
  const isMainnet = network.isMainnet;

  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Infrastructure proof</p>
          <h3 className="mt-1 font-display text-[17px] font-bold text-ink">What this deployment is actually running on</h3>
        </div>
        {reachable === true && (
          <span className={`rounded-full border px-3 py-1 font-mono text-[11px] font-semibold ${isMainnet ? "border-accent-dim bg-accent-soft text-accent" : "border-contested/30 bg-contested/10 text-contested"}`}>
            {network.name.toUpperCase()}
          </span>
        )}
      </div>

      {reachable === false && (
        <p className="text-[13px] text-ink-dim">
          Indexer unreachable — start it with <code className="font-mono text-accent">npm run indexer:dev</code> to see real network/contract state here.
        </p>
      )}

      {reachable === null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {reachable === true && health && (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line-soft bg-ground/40 p-3.5">
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Network</dt>
              <dd className="mt-1 font-mono text-[13px] text-ink">
                {network.name} <span className="text-ink-faint">· chain {network.chainId}</span>
              </dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-ground/40 p-3.5">
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Indexed events</dt>
              <dd className="mt-1 font-mono text-[13px] text-ink">{health.eventCount} <span className="text-ink-faint">as of block {health.lastIndexedBlock}</span></dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-ground/40 p-3.5">
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">MemoryWarRegistry</dt>
              <dd className="mt-1">
                <Hash value={health.contractAddress} len={8} />
              </dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-ground/40 p-3.5">
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">InvestigatorRegistry</dt>
              <dd className="mt-1">
                <Hash value={health.investigatorRegistryAddress} len={8} />
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-line-soft pt-5 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">Storage</span>
              <InfraBadge state={health.storageMode} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">Compute</span>
              <InfraBadge state="0G_COMPUTE_TEE" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">Settlement</span>
              <InfraBadge state="ON_CHAIN" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">DA</span>
              <InfraBadge state="COMMITMENT_READY" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
