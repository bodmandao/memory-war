"use client";

import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { ScenarioCard } from "@/components/ScenarioCard";

const REFERENCE_STAGES = ["Claim", "Evidence", "Challenge", "Investigation", "Reports", "Resolution", "Settlement"];

export default function PlaygroundPage() {
  return (
    <motion.div initial="initial" animate="animate" transition={{ staggerChildren: 0.08 }} className="space-y-8">
      <motion.div variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }} transition={{ duration: 0.3 }}>
        <p className="font-mono text-[11px] uppercase tracking-wide text-accent">Protocol laboratory</p>
        <h1 className="mt-1 font-display text-[26px] font-bold text-ink">Playground</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
          Four controlled runs of the actual protocol against the configured chain — not a mock. Each one drives real
          transactions and shows its own real, unedited step trace below, not a fixed animation. A full run typically
          moves through {REFERENCE_STAGES.join(" → ")} — but the exact steps shown are whatever this run actually did.
        </p>
      </motion.div>

      <motion.div variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }} transition={{ duration: 0.3 }}>
        <ScenarioCard
          title="Scenario B — genuine contradiction"
          objective="Two claims genuinely contradict each other. A bonded challenge is opened, evidence is locked, independent investigators evaluate it, and the protocol resolves the dispute mechanically — this is the core value MEMORY WAR provides."
          run={() => api.runScenarioB()}
          flagship
        />
      </motion.div>

      <motion.div variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }} transition={{ duration: 0.3 }}>
        <ScenarioCard
          title="Tamper detection"
          objective="Evidence is uploaded, content-addressed, then the underlying bytes are altered. Verification against the original commitment hash fails — proving tamper detection works independent of any chain interaction."
          run={() => api.runTamper()}
        />
      </motion.div>

      <motion.div variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }} transition={{ duration: 0.3 }}>
        <ScenarioCard
          title="Scenario A — predicate mismatch"
          objective="Two claims relate to each other but are not a genuine contradiction (RELATES_TO / REFINES / NARROWS / EXTENDS). No bond is posted, no challenge opens — the protocol correctly declines to treat disagreement-in-form as a dispute."
          run={() => api.runScenarioA()}
        />
      </motion.div>

      <motion.div variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }} transition={{ duration: 0.3 }}>
        <ScenarioCard
          title="Scenario C — pay-per-verification"
          objective="An agent pays a verification fee for a claim with no adversary present. Independent investigators are paid from that fee, and a portable investigator identity is registered and linked to the resulting report."
          run={() => api.runScenarioC()}
        />
      </motion.div>
    </motion.div>
  );
}
