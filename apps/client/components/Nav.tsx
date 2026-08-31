"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Health } from "@/lib/types";
import { networkFromRpc } from "@/lib/network";

const LINKS = [
  { href: "/claims", label: "Claims" },
  { href: "/investigators", label: "Investigators" },
  { href: "/playground", label: "Playground" },
  { href: "/verify", label: "Agent API" },
];

export function Nav() {
  const pathname = usePathname();
  const [health, setHealth] = useState<Health | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const h = await api.health();
        if (!cancelled) setHealth(h);
      } catch {
        if (!cancelled) setHealth(null);
      }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const online = !!health?.ok;
  const network = networkFromRpc(health?.rpcUrl);
  const statusLabel = online ? `${network.name.toUpperCase()} · LIVE` : "OFFLINE";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-9">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full transition-colors ${online ? "animate-pulse-dot bg-accent shadow-glow-accent" : "bg-ink-faint"}`} aria-hidden />
            <span className="font-display text-[15px] font-bold tracking-[0.04em] text-ink transition-colors group-hover:text-accent">MEMORY WAR</span>
          </Link>
          <nav className="hidden items-center gap-7 sm:flex">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link key={l.href} href={l.href} className={`relative py-1 text-[13px] transition-colors ${active ? "text-ink" : "text-ink-dim hover:text-ink"}`}>
                  {l.label}
                  {active && <motion.span layoutId="nav-underline" className="absolute -bottom-[13px] left-0 right-0 h-px bg-accent" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="hidden items-center gap-2 rounded-full border border-line-soft px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint sm:flex"
            title={health?.rpcUrl}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-true_" : "bg-ink-faint"}`} aria-hidden />
            <span>{statusLabel}</span>
          </div>
          <Link
            href="/verify"
            className="hidden rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-ground transition-transform hover:scale-[1.03] sm:inline-block"
          >
            Verify a Claim
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft text-ink-dim sm:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 top-0 h-px w-4 bg-current transition-transform ${menuOpen ? "translate-y-[6px] rotate-45" : ""}`} />
              <span className={`absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`absolute bottom-0 left-0 h-px w-4 bg-current transition-transform ${menuOpen ? "-translate-y-[6px] -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-line-soft sm:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-3">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-lg px-2 py-2.5 text-[14px] text-ink-dim hover:bg-surface hover:text-ink">
                  {l.label}
                </Link>
              ))}
              <Link href="/verify" className="mt-2 rounded-lg bg-accent px-3 py-2.5 text-center text-[13px] font-semibold text-ground">
                Verify a Claim
              </Link>
              <div className="mt-2 flex items-center gap-2 px-2 font-mono text-[11px] text-ink-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-true_" : "bg-ink-faint"}`} aria-hidden />
                {statusLabel}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
