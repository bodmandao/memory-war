export function shortHash(h: string | null | undefined, len = 10): string {
  if (!h) return "—";
  return h.length <= len * 2 + 2 ? h : `${h.slice(0, len)}…${h.slice(-4)}`;
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtTime(t: number | null | undefined): string {
  if (!t) return "—";
  return new Date(t * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtRelative(t: number | null | undefined): string {
  if (!t) return "—";
  const deltaSec = Math.round(Date.now() / 1000 - t);
  if (deltaSec < 5) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

export function fmtWei(wei: string | number | bigint | null | undefined): string {
  if (wei === null || wei === undefined) return "—";
  const value = BigInt(wei);
  if (value === 0n) return "0 ETH";
  const whole = value / 10n ** 18n;
  const frac = value % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${fracStr ? "." + fracStr : ""} ETH`;
}

export const REPORT_VERDICT_LABELS = ["INSUFFICIENT_EVIDENCE", "SUPPORTS", "REJECTS"] as const;

export function reportVerdictLabel(verdict: number): string {
  return REPORT_VERDICT_LABELS[verdict] ?? `UNKNOWN(${verdict})`;
}
