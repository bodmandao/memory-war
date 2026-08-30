"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const ICONS: Record<string, JSX.Element> = {
  claim: <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z M14 3.5V8h4.5" />,
  evidence: <path d="M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z M9 12l2 2 4-4" />,
  challenge: <path d="M12 2 3 6.5V12c0 5.5 3.8 9.7 9 11 5.2-1.3 9-5.5 9-11V6.5L12 2Z M12 8v5 M12 16.2v.1" />,
  investigators: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M16 16l5 5" />,
  resolution: <path d="M4 12l5 5L20 6" />,
  history: <path d="M12 21a9 9 0 1 0-9-9 M3 12H1.5 M12 7v5l3.5 2 M4.6 4.6l1.2 1.2" />,
};

const STAGES = [
  { key: "claim", label: "Claim", downstream: "evidence gets committed", detail: "A machine-generated statement is recorded, content-addressed, and given a permanent identifier. It is never treated as fact by default." },
  { key: "evidence", label: "Evidence", downstream: "disagreement creates a challenge", detail: "Supporting material is committed as a content-addressed bundle before any dispute begins, so it can't be altered retroactively without detection." },
  { key: "challenge", label: "Challenge", downstream: "independent investigators examine it", detail: "A genuine contradiction can be bonded and disputed on-chain. A claim that merely relates, refines, or narrows another is never forced into an adversarial fight." },
  { key: "investigators", label: "Investigators", downstream: "reports enter mechanical resolution", detail: "Independent identities evaluate the evidence without coordinating with each other, and issue signed, attestable reports." },
  { key: "resolution", label: "Resolution", downstream: "final state becomes persistent history", detail: "A disclosed, mechanical procedure — not a vote, not an admin — turns the reports into a verdict. Disagreement is preserved as CONTESTED, never averaged away." },
  { key: "history", label: "History", downstream: null, detail: "The verdict settles on-chain and the claim's full record — including anything that superseded it — stays permanently queryable. Nothing is deleted." },
] as const;

function StageIcon({ stageKey, active }: { stageKey: string; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-accent" : "text-ink-faint"}`}
    >
      {ICONS[stageKey]}
    </svg>
  );
}

export function ProtocolFlow() {
  const [active, setActive] = useState<number>(0);

  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-7">
      {/* Desktop: horizontal chain */}
      <div className="hidden sm:block">
        <div className="flex items-center">
          {STAGES.map((stage, i) => (
            <div key={stage.key} className="flex flex-1 items-center last:flex-none">
              <motion.button
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.35 }}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 font-mono text-[12px] transition-colors ${
                  i === active ? "border-accent bg-accent-soft text-accent" : i < active ? "border-line text-ink-dim" : "border-line-soft text-ink-faint hover:text-ink-dim"
                }`}
              >
                <StageIcon stageKey={stage.key} active={i === active} />
                {stage.label}
              </motion.button>
              {stage.downstream && (
                <div className="mx-2 flex-1">
                  <div className="relative h-px w-full bg-line-soft">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-accent"
                      initial={false}
                      animate={{ width: i < active ? "100%" : "0%" }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="mt-2 text-center text-[10.5px] italic leading-snug text-ink-faint">{stage.downstream}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: vertical chain */}
      <div className="space-y-0 sm:hidden">
        {STAGES.map((stage, i) => (
          <div key={stage.key}>
            <motion.button
              type="button"
              onClick={() => setActive(i)}
              initial={{ opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className={`flex w-full items-center gap-2.5 rounded-full border px-3.5 py-2 font-mono text-[12px] transition-colors ${
                i === active ? "border-accent bg-accent-soft text-accent" : i < active ? "border-line text-ink-dim" : "border-line-soft text-ink-faint"
              }`}
            >
              <StageIcon stageKey={stage.key} active={i === active} />
              {stage.label}
            </motion.button>
            {stage.downstream && (
              <div className="flex items-stretch gap-3 py-2 pl-[18px]">
                <div className="relative w-px bg-line-soft">
                  <motion.div className="absolute inset-x-0 top-0 bg-accent" initial={false} animate={{ height: i < active ? "100%" : "0%" }} transition={{ duration: 0.3 }} style={{ width: 1 }} />
                </div>
                <p className="py-1 text-[11px] italic leading-snug text-ink-faint">↓ {stage.downstream}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <motion.p
        key={active}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mt-7 max-w-2xl border-t border-line-soft pt-5 text-[13.5px] leading-relaxed text-ink-dim"
      >
        <span className="mr-2 font-mono text-[11px] uppercase tracking-wide text-accent">{STAGES[active].label} —</span>
        {STAGES[active].detail}
      </motion.p>
    </div>
  );
}
