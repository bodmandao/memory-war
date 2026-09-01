"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StepTimeline } from "./StepTimeline";
import { InfraBadge } from "./Badge";
import { api } from "@/lib/api";
import { networkFromRpc } from "@/lib/network";
import type { DemoStep, DemoTrace } from "@/lib/types";

const KNOWN_MODES = ["0G_STORAGE_LIVE", "LOCAL_DEMO", "0G_COMPUTE_TEE", "LOCAL_LLM", "SIMULATED"];

/** Scans the trace's own returned data for mode labels it actually contains — never a guess, never a fixed assumption about what a scenario "should" have used. */
function modesUsedIn(trace: DemoTrace): string[] {
  const text = JSON.stringify(trace);
  return KNOWN_MODES.filter((m) => text.includes(m));
}

type RunState = "idle" | "running" | "done" | "error" | "cancelled";

export function ScenarioCard({
  title,
  objective,
  run,
  flagship = false,
}: {
  title: string;
  objective: string;
  run: (onStep: (step: DemoStep) => void, signal?: AbortSignal) => Promise<DemoTrace>;
  flagship?: boolean;
}) {
  const [state, setState] = useState<RunState>("idle");
  const [liveSteps, setLiveSteps] = useState<DemoStep[]>([]);
  const [trace, setTrace] = useState<DemoTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modesUsed = useMemo(() => (trace ? modesUsedIn(trace) : []), [trace]);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => {
        if (!cancelled) setNetworkName(networkFromRpc(h.rpcUrl).name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRun() {
    setState("running");
    setLiveSteps([]);
    setTrace(null);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await run((step) => setLiveSteps((prev) => [...prev, step]), controller.signal);
      setTrace(result);
      setState("done");
    } catch (err) {
      if (err instanceof Error && err.message === "cancelled") {
        setState("cancelled");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <section className={`rounded-xl border p-5 sm:p-6 ${flagship ? "border-accent/40 bg-accent-soft/40" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {flagship && <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-accent">Flagship scenario</p>}
          <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-dim">{objective}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state === "running" && (
            <button
              onClick={handleCancel}
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-dim transition-colors hover:border-false_/40 hover:text-false_"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={state === "running"}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-ground transition-opacity disabled:opacity-50"
          >
            {state === "running" ? "Running…" : state === "done" || state === "cancelled" || state === "error" ? "Run again" : "Run"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {state === "running" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5">
            {liveSteps.length === 0 ? (
              <div className="flex items-center gap-3 text-[13px] text-ink-dim">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
                <span>
                  <span className="mr-2 font-mono text-[11px] uppercase tracking-wide text-accent">Connecting</span>
                  Driving real transactions against {networkName ?? "the chain"}. First step can take a few seconds.
                </span>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-3 text-[13px] text-ink-dim">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
                  <span>
                    <span className="mr-2 font-mono text-[11px] uppercase tracking-wide text-accent">Running</span>
                    {liveSteps[liveSteps.length - 1].label}
                  </span>
                </div>
                <StepTimeline steps={liveSteps} ok={true} />
              </>
            )}
          </motion.div>
        )}
        {state === "cancelled" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5">
            <div className="mb-4 rounded-lg border border-line-soft bg-ground/40 p-4 text-[13px] text-ink-dim">
              Stopped watching this run. Steps already submitted to the chain can&apos;t be undone — the server may have
              finished the run in the background even though this view stopped early.
            </div>
            {liveSteps.length > 0 && <StepTimeline steps={liveSteps} ok={true} />}
          </motion.div>
        )}
        {state === "error" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-lg border border-false_/30 bg-false_/5 p-4 text-[13px] text-false_">
            {error}
            <p className="mt-1 text-ink-dim">
              Is the demo driver running? <code className="font-mono">npm run demo:server</code> alongside a local chain and a deployed contract.
            </p>
          </motion.div>
        )}
        {state === "done" && trace && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium ${trace.ok ? "border-true_/30 bg-true_/10 text-true_" : "border-false_/30 bg-false_/10 text-false_"}`}>
                {trace.ok ? "Protocol completed as expected" : "Failed"}
              </span>
              {modesUsed.map((m) => (
                <InfraBadge key={m} state={m} />
              ))}
            </div>
            <StepTimeline steps={trace.steps} ok={trace.ok} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
