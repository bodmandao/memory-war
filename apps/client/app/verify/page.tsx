"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { AgentVerifyResult } from "@/lib/types";
import { fmtWei } from "@/lib/format";
import { Card, KV } from "@/components/Card";
import { Hash } from "@/components/Hash";
import { ModeBadge } from "@/components/Badge";
import { JsonDetails } from "@/components/JsonDetails";
import { ErrorState } from "@/components/States";

const REQUEST_EXAMPLE = {
  claim: "Protocol X raised $40,000,000",
  evidence: ["Official announcement: Protocol X closed a $40,000,000 Series A."],
};

export default function VerifyPage() {
  const [claim, setClaim] = useState("Protocol X raised $40,000,000");
  const [evidence, setEvidence] = useState("Official announcement: Protocol X closed a $40,000,000 Series A.");
  const [counterClaim, setCounterClaim] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<AgentVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("running");
    setError(null);
    try {
      const res = await api.verifyClaim({
        claim,
        evidence: evidence
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        counterClaim: counterClaim.trim() || undefined,
      });
      setResult(res);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] font-bold text-ink">Agent verification API</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
          Any agent can submit a claim and receive a structured, independently auditable verification result. One call
          runs pay → investigate → attest → resolve end to end, against the real, deployed protocol.
        </p>
      </div>

      <Card title="Endpoint">
        <div className="mb-4 flex items-center gap-2 font-mono text-[13px]">
          <span className="rounded bg-accent-soft px-2 py-0.5 text-accent">POST</span>
          <span className="text-ink">/agent/verify-claim</span>
        </div>
        <p className="mb-3 text-[12px] uppercase tracking-wide text-ink-faint">Request</p>
        <pre className="mb-4 overflow-auto rounded-lg border border-line bg-ground p-4 text-[12px] leading-relaxed text-ink-dim">
          {JSON.stringify(REQUEST_EXAMPLE, null, 2)}
        </pre>
        <p className="mb-3 text-[12px] uppercase tracking-wide text-ink-faint">Response (shape)</p>
        <pre className="overflow-auto rounded-lg border border-line bg-ground p-4 text-[12px] leading-relaxed text-ink-dim">
          {`{
  "verdict": "TRUE" | "FALSE" | "CONTESTED" | "INCONCLUSIVE",
  "confidence": number,
  "evidenceRoot": "0x…",
  "investigationId": "0x…",
  "investigators": [{ "address", "investigatorId", "modelProvider", "verdict", "attestation": { "mode", "verified", "detail" } }],
  "attestation": { "anyLiveTee": boolean, "modes": [...] },
  "payment": { "feeWei", "payouts": [{ "investigator", "amountWei" }] },
  "history": { "claimId", "onChainTxHash", "queryUrl" }
}`}
        </pre>
        <p className="mt-3 text-[12px] text-ink-faint">A failure is always a real HTTP error — this endpoint never reports success for an operation that didn&apos;t actually happen.</p>
      </Card>

      <Card title="Try verification" subtitle="This sends a real request to the demo driver and executes the real on-chain flow.">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {(["Submit", "Process", "Result"] as const).map((step, i) => {
            // idle/error sit at step 0 (nothing submitted yet, or the
            // attempt didn't survive processing); running is step 1;
            // done is step 2 — only a completed call reaches "Result".
            const activeStep = state === "done" ? 2 : state === "running" ? 1 : 0;
            return (
              <div key={step} className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
                    i === activeStep ? "border-accent bg-accent-soft text-accent" : i < activeStep ? "border-line text-ink-dim" : "border-line-soft text-ink-faint"
                  }`}
                >
                  {i + 1}. {step}
                </span>
                {i < 2 && <span className="text-ink-faint">→</span>}
              </div>
            );
          })}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] uppercase tracking-wide text-ink-faint">Claim</label>
            <input
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              className="w-full rounded-lg border border-line bg-ground px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] uppercase tracking-wide text-ink-faint">Evidence (one per line)</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-line bg-ground px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] uppercase tracking-wide text-ink-faint">Counter-claim (optional)</label>
            <input
              value={counterClaim}
              onChange={(e) => setCounterClaim(e.target.value)}
              className="w-full rounded-lg border border-line bg-ground px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <button type="submit" disabled={state === "running"} className="rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-ground disabled:opacity-50">
            {state === "running" ? "Verifying…" : "Verify"}
          </button>
        </form>

        <AnimatePresence>
          {state === "running" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 flex items-center gap-3 text-[13px] text-ink-dim">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
              Running pay → investigate → attest → resolve against the configured chain. This can take a few seconds.
            </motion.div>
          )}
        </AnimatePresence>

        {state === "error" && error && <div className="mt-5"><ErrorState message={error} /></div>}

        {state === "done" && result && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4 border-t border-line pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 font-mono text-[13px] text-accent">{result.verdict}</span>
              <span className="text-[13px] text-ink-dim">confidence {(result.confidence * 100).toFixed(0)}%</span>
            </div>
            <KV
              rows={[
                { k: "Investigation ID", v: <Hash value={result.investigationId} /> },
                { k: "Evidence root", v: <Hash value={result.evidenceRoot} /> },
                { k: "Verification fee", v: fmtWei(result.payment.feeWei) },
                { k: "On-chain tx", v: <Hash value={result.history.onChainTxHash} /> },
                {
                  k: "Claim record",
                  v: (
                    <Link href={`/claims/${result.history.claimId}`} className="text-accent hover:underline">
                      view claim →
                    </Link>
                  ),
                },
              ]}
            />
            <div>
              <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-faint">Investigators</p>
              <div className="space-y-2">
                {result.investigators.map((inv, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft bg-ground/40 p-3 text-[13px]">
                    <span className="font-medium text-ink">{inv.modelProvider}</span>
                    <span className="text-ink-dim">{inv.verdict}</span>
                    <ModeBadge mode={inv.attestation.mode} />
                  </div>
                ))}
              </div>
            </div>
            <JsonDetails data={result} />
          </motion.div>
        )}
      </Card>
    </div>
  );
}
