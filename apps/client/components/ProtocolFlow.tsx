"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const ICONS: Record<string, JSX.Element> = {
  claim: <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z M14 3.5V8h4.5" />,
  evidence: <path d="M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z M9 12l2 2 4-4" />,
  challenge: <path d="M12 2 3 6.5V12c0 5.5 3.8 9.7 9 11 5.2-1.3 9-5.5 9-11V6.5L12 2Z M12 8v5 M12 16.2v.1" />,
  investigators: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M16 16l5 5" />,
  attestation: <path d="M12 2 3 6.5V12c0 5.5 3.8 9.7 9 11 5.2-1.3 9-5.5 9-11V6.5L12 2Z M8.5 12l2.3 2.3L15.5 9.5" />,
  resolution: <path d="M4 12l5 5L20 6" />,
  settlement: <path d="M4 8h16 M4 8l1.5-4h13L20 8 M6 8v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8 M9.5 12.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z" />,
  history: <path d="M12 21a9 9 0 1 0-9-9 M3 12H1.5 M12 7v5l3.5 2 M4.6 4.6l1.2 1.2" />,
};

const STAGES = [
  { key: "claim", label: "Claim", downstream: "evidence gets committed", detail: "A machine-generated statement is recorded, content-addressed, and given a permanent identifier. It is never treated as fact by default." },
  { key: "evidence", label: "Evidence", downstream: "disagreement creates a challenge", detail: "Supporting material is committed as a content-addressed bundle before any dispute begins, so it can't be altered retroactively without detection." },
  { key: "challenge", label: "Challenge", downstream: "independent investigators examine it", detail: "A genuine contradiction can be bonded and disputed on-chain. A claim that merely relates, refines, or narrows another is never forced into an adversarial fight." },
  { key: "investigators", label: "Investigators", downstream: "each report is issued through 0G Compute", detail: "Independent identities evaluate the locked evidence without coordinating with each other, and issue signed reports." },
  { key: "attestation", label: "0G TEE Attestation", downstream: "attested reports enter mechanical resolution", detail: "Each report is run through 0G Compute with TEE attestation, independently verified on testnet in this build — attestation proves a specific model produced a specific output from a specific input, never that the claim itself is true." },
  { key: "resolution", label: "Resolution", downstream: "the verdict settles atomically with payment", detail: "A disclosed, mechanical procedure (mw-default/v1) — not a vote, not an admin — turns the reports into a verdict. Disagreement is preserved as CONTESTED, never averaged away." },
  { key: "settlement", label: "Settlement", downstream: "the resolved case becomes permanent history", detail: "Investigator fees are paid on-chain in the same transaction as the verdict — real native-token settlement, not a separate payments layer." },
  { key: "history", label: "History", downstream: null, detail: "The claim's full record — including anything that superseded it — stays permanently queryable. Nothing is deleted." },
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
      {/* Desktop: horizontal chain. Eight stages plus captions can exceed
          even a wide viewport's width, so the row scrolls within its own
          bounds rather than bleeding past the card border. */}
      <div className="hidden lg:block">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-center">
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
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 font-mono text-[12px] transition-colors ${
                    i === active ? "border-accent bg-accent-soft text-accent" : i < active ? "border-line text-ink-dim" : "border-line-soft text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  <StageIcon stageKey={stage.key} active={i === active} />
                  {stage.label}
                </motion.button>
                {stage.downstream && (
                  <div className="mx-1.5 w-16 shrink-0 grow xl:w-24">
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
      </div>

      {/* Mobile / tablet: vertical chain (8 stages is too dense for a horizontal row below lg) */}
      <div className="space-y-0 lg:hidden">
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
