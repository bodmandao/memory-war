"use client";

import { useState } from "react";

export function JsonDetails({ data, label = "View technical details" }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12px] font-medium text-ink-faint transition-colors hover:text-accent"
      >
        {open ? "Hide technical details" : label}
      </button>
      {open && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-line bg-ground p-4 text-[11.5px] leading-relaxed text-ink-dim">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
