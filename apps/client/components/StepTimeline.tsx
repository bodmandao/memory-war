"use client";

import { motion } from "framer-motion";
import { JsonDetails } from "./JsonDetails";
import type { DemoStep } from "@/lib/types";

/**
 * Renders a scenario trace's *actual* steps, in order, as a vertical
 * lifecycle. Nothing here is a fixed, idealized 10-stage diagram —
 * different scenarios genuinely go through different steps (tamper
 * detection never opens a challenge; Scenario A never reaches
 * investigation), and inventing a uniform shape would misrepresent that.
 */
export function StepTimeline({ steps, ok }: { steps: DemoStep[]; ok: boolean }) {
  return (
    <ol className="relative ml-3 space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const failed = isLast && !ok;
        return (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="relative pb-7 pl-7 last:pb-0"
          >
            {!isLast && <span className="absolute left-[5px] top-3 h-full w-px bg-line" aria-hidden />}
            <span
              className={`absolute left-0 top-1 h-[11px] w-[11px] rounded-full border-2 ${
                failed ? "border-false_ bg-false_/20" : "border-accent bg-accent-soft"
              }`}
              aria-hidden
            />
            <div className="text-[13px] font-medium text-ink">{step.label}</div>
            <div className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{step.detail}</div>
            {step.data !== undefined && <JsonDetails data={step.data} />}
          </motion.li>
        );
      })}
    </ol>
  );
}
