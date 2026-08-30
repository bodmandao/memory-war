import { Skeleton } from "./States";

/** Loading skeletons that mirror each page's eventual layout, so real content never causes a jump when it arrives. */

export function ClaimRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-line-soft px-4 py-3.5 last:border-0">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="ml-auto h-4 w-12" />
    </div>
  );
}

export function ClaimsListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {Array.from({ length: 6 }).map((_, i) => (
        <ClaimRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function InvestigatorCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function InvestigatorsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <InvestigatorCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <Skeleton className="h-7 w-14" />
      <Skeleton className="mt-2.5 h-2.5 w-16" />
    </div>
  );
}

export function DashboardMetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <MetricSkeleton key={i} />
      ))}
    </div>
  );
}

function StageCardSkeleton() {
  return (
    <div className="flex gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col items-center">
        <Skeleton className="h-8 w-8 rounded-full" />
        <span className="mt-1 w-px flex-1 bg-line-soft" />
      </div>
      <div className="min-w-0 flex-1 pb-8">
        <Skeleton className="mb-3 h-2.5 w-20" />
        <div className="space-y-2.5 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function ClaimDossierSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="mb-10 h-32 w-full rounded-xl" />
      {Array.from({ length: 4 }).map((_, i) => (
        <StageCardSkeleton key={i} />
      ))}
    </div>
  );
}
