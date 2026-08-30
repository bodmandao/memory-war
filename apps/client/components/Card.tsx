import type { ReactNode } from "react";

export function Card({ title, subtitle, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {title && (
        <header className="mb-4">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function KV({ rows }: { rows: Array<{ k: string; v: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[160px_1fr]">
      {rows.map((row, i) => (
        <div key={i} className="contents">
          <dt className="text-[12px] uppercase tracking-wide text-ink-faint sm:pt-0.5">{row.k}</dt>
          <dd className="min-w-0 text-[13px] text-ink">{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}
