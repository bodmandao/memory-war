"use client";

import { useState } from "react";
import { shortHash } from "@/lib/format";

/**
 * Renders a hash/address/tx-id as a small cryptographic-artifact chip:
 * monospace, a subtle bordered background, click-to-copy. `full` shows
 * the complete value wrapped (never truncated with an ellipsis and never
 * causing horizontal overflow — `break-all` wraps mid-string instead of
 * forcing the container wider).
 */
export function Hash({ value, len = 10, full = false }: { value: string | null | undefined; len?: number; full?: boolean }) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-ink-faint">—</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard API unavailable — silently ignore, the value is still selectable text
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className={`group inline-flex max-w-full items-center gap-1.5 rounded-md border border-line-soft bg-ground/50 px-1.5 py-0.5 font-mono text-[12.5px] text-ink-dim transition-colors hover:border-accent-dim hover:text-accent ${
        full ? "" : "align-middle"
      }`}
    >
      <span className={full ? "break-all text-left" : "truncate"}>{full ? value : shortHash(value, len)}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint group-hover:text-accent">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
