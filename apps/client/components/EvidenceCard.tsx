"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Hash } from "./Hash";
import { ModeBadge } from "./Badge";
import { Skeleton } from "./States";

export function EvidenceCard({ hash }: { hash: string }) {
  const [state, setState] = useState<{ text: string; mode: string; verified: boolean } | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .content(hash)
      .then((r) => !cancelled && setState(r))
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [hash]);

  return (
    <div className="rounded-lg border border-line-soft bg-ground/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Hash value={hash} />
        {state && state !== "error" && <ModeBadge mode={state.mode} />}
      </div>
      {state === null && <Skeleton className="h-4 w-3/4" />}
      {state === "error" && <p className="text-[12px] text-ink-faint">Content not available from the currently configured storage adapter.</p>}
      {state && state !== "error" && (
        <p className="text-[13px] leading-relaxed text-ink">
          {state.text}
          {state.verified === false && <span className="ml-2 text-[11px] text-false_">(content hash mismatch)</span>}
        </p>
      )}
    </div>
  );
}
