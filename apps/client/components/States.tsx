export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-6 text-[13px] text-ink-dim">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line-soft ${className}`} />;
}

export function EmptyState({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      {title && <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint">{title}</p>}
      <p className="text-[13px] text-ink-dim">{children}</p>
    </div>
  );
}

/** No claims match the current filter/search — never an empty-looking broken table. */
export function NoClaimsFound({ hint }: { hint?: string }) {
  return <EmptyState title="No claims found">{hint ?? "Run a scenario in the Playground to populate one, or adjust your filters."}</EmptyState>;
}

/** The indexer process is unreachable — distinct from "no data", with an actionable fix. */
export function IndexerUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-contested/30 bg-contested/5 p-6 text-center">
      <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-contested">Indexer unavailable</p>
      <p className="text-[13px] leading-relaxed text-ink-dim">
        This page reads from the read-only indexer. It isn&apos;t reachable right now — start it with{" "}
        <code className="font-mono text-ink">npm run indexer:dev</code>.
      </p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-md border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent">
          Retry
        </button>
      )}
    </div>
  );
}

/** Labels a genuinely-local fallback (no funded 0G credentials configured) as exactly that — never implies live infrastructure ran. */
export function LocalDemonstrationNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-contested/30 bg-contested/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-dim">
      <span className="mr-1.5 font-mono font-semibold uppercase tracking-wide text-contested">Local demonstration mode</span>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-false_/30 bg-false_/5 p-6 text-[13px] text-ink">
      <p className="font-medium text-false_">Something went wrong</p>
      <p className="mt-1 text-ink-dim">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-md border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent">
          Retry
        </button>
      )}
    </div>
  );
}
