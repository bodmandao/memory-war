import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * A numbered stage in the claim dossier's investigation narrative
 * (01 CLAIM … 08 HISTORY). Always renders all eight in the same fixed
 * order and numbering regardless of how far a given claim has actually
 * progressed — a stage that hasn't happened yet renders its pending
 * state rather than being skipped, so the numbering never shifts
 * between claims and a judge always sees the same map of the protocol.
 */
export function Stage({ n, label, last = false, children }: { n: number; label: string; last?: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35 }}
      className="relative flex gap-4 sm:gap-6"
    >
      <div className="flex shrink-0 flex-col items-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface font-mono text-[11px] font-semibold text-ink-dim">
          {String(n).padStart(2, "0")}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-line-soft" aria-hidden />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-8"}`}>
        <p className="mb-3 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{label}</p>
        {children}
      </div>
    </motion.div>
  );
}
