const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-line-soft text-ink-dim border-line",
  CHALLENGED: "bg-contested/10 text-contested border-contested/30",
  TRUE: "bg-true_/10 text-true_ border-true_/30",
  FALSE: "bg-false_/10 text-false_ border-false_/30",
  SUPERSEDED: "bg-superseded/10 text-superseded border-superseded/30",
  CONTESTED: "bg-contested/10 text-contested border-contested/30",
  INCONCLUSIVE: "bg-line-soft text-ink-dim border-line",
  EVIDENCE_LOCKED: "bg-accent-soft text-accent border-accent-dim",
  INVESTIGATING: "bg-accent-soft text-accent border-accent-dim",
  RESOLVED: "bg-line-soft text-ink-dim border-line",
  APPEALED: "bg-contested/10 text-contested border-contested/30",
  NONE: "bg-line-soft text-ink-faint border-line",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-line-soft text-ink-dim border-line";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide font-mono ${cls}`}>
      {status}
    </span>
  );
}

const MODE_META: Record<string, { label: string; cls: string; title: string }> = {
  "0G_STORAGE_LIVE": { label: "0G STORAGE · LIVE", cls: "bg-accent-soft text-accent border-accent-dim", title: "Uploaded to and retrieved from the live 0G Storage network." },
  "0G_COMPUTE_TEE": { label: "0G COMPUTE · TEE", cls: "bg-accent-soft text-accent border-accent-dim", title: "Executed on live 0G Compute with TEE attestation. Attestation proves this exact model produced this exact output — it does not prove the claim is true." },
  LOCAL_LLM: { label: "LOCAL LLM", cls: "bg-contested/10 text-contested border-contested/30", title: "A real model call, made locally — not run on 0G Compute, not TEE-attested." },
  LOCAL_DEMO: { label: "LOCAL DEMO", cls: "bg-contested/10 text-contested border-contested/30", title: "Real content-hashing and tamper detection, against a local content-addressed store instead of live 0G Storage." },
  SIMULATED: { label: "SIMULATED", cls: "bg-line-soft text-ink-faint border-line", title: "A deterministic rule-based stub — not a model call of any kind." },
};

export function ModeBadge({ mode }: { mode: string }) {
  const meta = MODE_META[mode] ?? { label: mode, cls: "bg-line-soft text-ink-dim border-line", title: mode };
  return (
    <span title={meta.title} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide font-mono cursor-help ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

const INFRA_META: Record<string, { label: string; cls: string; title: string }> = {
  "0G_STORAGE_LIVE": { label: "LIVE", cls: "bg-accent-soft text-accent border-accent-dim", title: "Uploaded to and retrieved from the live 0G Storage network." },
  LOCAL_DEMO: { label: "LOCAL DEMO", cls: "bg-contested/10 text-contested border-contested/30", title: "Real content-hashing and tamper detection, against a local content-addressed store — not the live 0G Storage network." },
  "0G_COMPUTE_TEE": { label: "TEE LIVE", cls: "bg-accent-soft text-accent border-accent-dim", title: "Executed on live 0G Compute with TEE attestation." },
  LOCAL_LLM: { label: "LOCAL LLM", cls: "bg-contested/10 text-contested border-contested/30", title: "A real model call, made locally — not run on 0G Compute, not TEE-attested." },
  SIMULATED: { label: "SIMULATED", cls: "bg-line-soft text-ink-faint border-line", title: "A deterministic rule-based stub — not a model call of any kind." },
  COMMITMENT_READY: { label: "COMMITMENT READY", cls: "bg-line-soft text-ink-dim border-line", title: "The batch-commitment math this needs is implemented and tested, not wired to a live 0G DA network call — see the note below for why." },
};

export function InfraBadge({ state }: { state: string }) {
  const meta = INFRA_META[state] ?? { label: state, cls: "bg-line-soft text-ink-dim border-line", title: state };
  return (
    <span title={meta.title} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide font-mono cursor-help ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function VerdictPill({ verdict }: { verdict: number }) {
  const labels = ["INSUFFICIENT EVIDENCE", "SUPPORTS", "REJECTS"];
  const cls = verdict === 1 ? "bg-true_/10 text-true_ border-true_/30" : verdict === 2 ? "bg-false_/10 text-false_ border-false_/30" : "bg-line-soft text-ink-dim border-line";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide font-mono ${cls}`}>{labels[verdict] ?? verdict}</span>;
}
