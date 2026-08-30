"use client";

import { useEffect, useRef, useState } from "react";

function useCountUp(target: number | null, durationMs = 600): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number>();

  useEffect(() => {
    if (target === null) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target! - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}

export function StatCounter({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  const animated = useCountUp(value);
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="font-mono text-[28px] font-semibold leading-none text-ink tabular-nums">
        {value === null ? <span className="text-ink-faint">—</span> : `${animated}${suffix}`}
      </div>
      <div className="mt-1.5 text-[12px] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
