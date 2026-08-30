"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { Claim, ClaimStatus } from "@/lib/types";
import { fmtRelative, shortHash } from "@/lib/format";
import { StatusBadge } from "@/components/Badge";
import { NoClaimsFound, IndexerUnavailable } from "@/components/States";
import { ClaimsListSkeleton } from "@/components/Skeletons";

const FILTERS: Array<{ label: string; match: (s: ClaimStatus) => boolean }> = [
  { label: "All", match: () => true },
  { label: "Open", match: (s) => s === "OPEN" },
  { label: "In progress", match: (s) => s === "CHALLENGED" || s === "EVIDENCE_LOCKED" || s === "INVESTIGATING" },
  { label: "True", match: (s) => s === "TRUE" },
  { label: "False", match: (s) => s === "FALSE" },
  { label: "Contested", match: (s) => s === "CONTESTED" },
  { label: "Inconclusive", match: (s) => s === "INCONCLUSIVE" },
  { label: "Superseded", match: (s) => s === "SUPERSEDED" },
];

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  async function load() {
    setError(null);
    try {
      const { claims } = await api.claims();
      setClaims(claims);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load claims.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!claims) return [];
    const byStatus = claims.filter((c) => FILTERS[filter].match(c.status));
    const searched = query.trim()
      ? byStatus.filter((c) => c.id.toLowerCase().includes(query.trim().toLowerCase()) || c.author.toLowerCase().includes(query.trim().toLowerCase()))
      : byStatus;
    return [...searched].sort((a, b) => (sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  }, [claims, filter, query, sort]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-accent">Claim intelligence explorer</p>
        <h1 className="mt-1 font-display text-[26px] font-bold text-ink">Claims</h1>
        <p className="mt-1 text-[13px] text-ink-dim">Every claim ever recorded on-chain, reconstructed by the indexer from the contract&apos;s own event log.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => setFilter(i)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              filter === i ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-dim hover:border-line hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-dim focus:border-accent focus:outline-none"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by claim ID or author…"
            className="w-full min-w-[200px] max-w-xs rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {error && <IndexerUnavailable onRetry={load} />}
      {!error && claims === null && <ClaimsListSkeleton />}
      {!error && claims !== null && filtered.length === 0 && <NoClaimsFound />}
      {!error && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-medium">Claim</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Author</th>
                <th className="px-4 py-3 font-medium">Challenges</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.2 }}
                  className="border-b border-line-soft last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-3">
                    <Link href={`/claims/${c.id}`} className="font-mono text-ink hover:text-accent">
                      {shortHash(c.id, 12)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-dim">{shortHash(c.author, 6)}</td>
                  <td className="px-4 py-3 text-ink-dim">{c.challengeIds.length}</td>
                  <td className="px-4 py-3 text-ink-dim">{fmtRelative(c.createdAt)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
