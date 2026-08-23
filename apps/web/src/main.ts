import "./style.css";
import { api } from "./api.js";

const app = document.getElementById("app")!;

let selectedClaimId: string | null = null;
let lastTrace: any = null;
let health: any = null;

async function refreshHealth() {
  try {
    health = await api.health();
  } catch {
    health = { ok: false, error: "indexer unreachable — is `npm run indexer:dev` running?" };
  }
}

function modeBadge(mode: string): string {
  const cls = mode === "0G_STORAGE_LIVE" || mode === "0G_COMPUTE_TEE" ? "live" : mode === "LOCAL_LLM" || mode === "LOCAL_DEMO" ? "local" : "sim";
  return `<span class="mode-badge ${cls}">${escapeHtml(mode)}</span>`;
}

function statusBadge(status: string): string {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function render() {
  app.innerHTML = `
    <header class="top">
      <div>
        <h1>MEMORY WAR</h1>
        <div class="tag">a persistent, adversarially-tested knowledge layer for machine-generated claims</div>
      </div>
      <div class="tag" id="health-tag">
        ${health?.ok ? `indexer ok · contract ${health.contractAddress ? shortAddr(health.contractAddress) : "not deployed"} · ${health.eventCount ?? 0} events indexed` : `<span style="color:#e05555">${escapeHtml(health?.error ?? "loading…")}</span>`}
      </div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <h2>Run the demo</h2>
        <div class="btn-row" style="flex-direction:column">
          <button class="btn" id="btn-tamper">Tamper detection</button>
          <button class="btn" id="btn-a">Scenario A — predicate mismatch</button>
          <button class="btn primary" id="btn-b">Scenario B — genuine contradiction</button>
        </div>
        <h2 style="margin-top:24px">Claims</h2>
        <div id="claim-list"></div>
      </aside>
      <main class="content" id="content"></main>
    </div>
  `;

  document.getElementById("btn-tamper")!.addEventListener("click", () => runDemo("tamper"));
  document.getElementById("btn-a")!.addEventListener("click", () => runDemo("a"));
  document.getElementById("btn-b")!.addEventListener("click", () => runDemo("b"));

  await renderClaimList();
  await renderContent();
}

async function renderClaimList() {
  const list = document.getElementById("claim-list")!;
  try {
    const { claims } = await api.claims();
    if (claims.length === 0) {
      list.innerHTML = `<div class="empty">No claims indexed yet. Run a demo scenario, or create one via the contract.</div>`;
      return;
    }
    list.innerHTML = claims
      .map(
        (c: any) => `
      <div class="claim-row" data-id="${c.id}">
        <div class="status">${statusBadge(c.status)}</div>
        <div class="id">${shortHash(c.id)}</div>
      </div>`,
      )
      .join("");
    list.querySelectorAll<HTMLElement>(".claim-row").forEach((el) => {
      el.addEventListener("click", () => {
        selectedClaimId = el.dataset.id!;
        lastTrace = null;
        renderContent();
      });
    });
  } catch {
    list.innerHTML = `<div class="empty">Could not reach the indexer.</div>`;
  }
}

async function renderContent() {
  const content = document.getElementById("content")!;
  if (lastTrace) return renderTrace(content, lastTrace);
  if (!selectedClaimId) {
    content.innerHTML = `
      <div class="warn-box">
        <strong>What "0G STORAGE VERIFIED" and "0G COMPUTE TEE" badges mean here:</strong>
        a badge only ever shows a mode this system genuinely ran in. When live 0G network access
        isn't configured, everything downgrades honestly to LOCAL DEMO / SIMULATED — never
        upgraded in the UI to look more impressive than what happened. And "TEE verified" never
        means "verified true" — it means a specific model, given a specific evidence bundle,
        produced a specific signed output. Semantic correctness is never what attestation proves.
      </div>
      <div class="empty">Select a claim on the left, or run a demo scenario to populate one.</div>
    `;
    return;
  }
  content.innerHTML = `<div class="loading">Loading claim ${escapeHtml(selectedClaimId)}…</div>`;
  try {
    const { claim, challenges } = await api.claim(selectedClaimId);
    renderClaimDetail(content, claim, challenges);
  } catch (err) {
    content.innerHTML = `<div class="empty">Could not load claim: ${escapeHtml(String(err))}</div>`;
  }
}

function renderClaimDetail(content: HTMLElement, claim: any, challenges: any[]) {
  content.innerHTML = `
    <div class="card">
      <h3>Claim</h3>
      <div class="kv">
        <div class="k">id</div><div class="v hash">${claim.id}</div>
        <div class="k">status</div><div class="v">${statusBadge(claim.status)}</div>
        <div class="k">author</div><div class="v hash">${claim.author}</div>
        <div class="k">predicate hash</div><div class="v hash">${claim.predicateHash}</div>
        <div class="k">text hash</div><div class="v hash">${claim.textHash}</div>
        <div class="k">record time</div><div class="v">${fmtTime(claim.createdAt)}</div>
        <div class="k">valid time</div><div class="v">${fmtTime(claim.validFrom)} ${claim.validUntil ? "→ " + fmtTime(claim.validUntil) : "→ (open-ended)"}</div>
      </div>
    </div>

    <div class="card">
      <h3>Relationships &amp; supersession — the graph, not a single verdict</h3>
      ${
        claim.relationships.length === 0
          ? `<div class="empty">No relationships recorded — this claim has not been compared against another.</div>`
          : claim.relationships
              .map(
                (r: any) => `<div class="rel-edge">${r.direction === "outgoing" ? "→" : "←"} <strong>${r.relation}</strong> ${shortHash(r.withClaimId)} <span style="color:var(--ink-dim)">(${fmtTime(r.at)})</span></div>`,
              )
              .join("")
      }
    </div>

    ${challenges.map((c) => renderChallengeCard(c)).join("")}
  `;
}

function renderChallengeCard(c: any): string {
  return `
    <div class="card">
      <h3>Challenge — ${c.challengeType}</h3>
      <div class="kv">
        <div class="k">id</div><div class="v hash">${c.id}</div>
        <div class="k">state</div><div class="v">${statusBadge(c.state)}</div>
        <div class="k">challenger</div><div class="v hash">${c.challenger}</div>
        <div class="k">bond</div><div class="v">${c.bondWei} wei</div>
        <div class="k">evidence root</div><div class="v hash">${c.evidenceRoot ?? "(not locked yet)"}</div>
      </div>
    </div>

    <div class="card">
      <h3>Independent investigation (${c.reports.length} report${c.reports.length === 1 ? "" : "s"})</h3>
      ${
        c.reports.length === 0
          ? `<div class="empty">No reports submitted yet.</div>`
          : c.reports
              .map(
                (r: any) => `
        <div class="kv" style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--line)">
          <div class="k">investigator</div><div class="v hash">${r.investigator}</div>
          <div class="k">verdict</div><div class="v">${["INSUFFICIENT_EVIDENCE", "SUPPORTS", "REJECTS"][r.verdict] ?? r.verdict}</div>
          <div class="k">attestation</div><div class="v">${modeBadge(r.attestationMode)} verified=${r.attestationVerified}</div>
        </div>`,
              )
              .join("")
      }
    </div>

    ${
      c.verdict
        ? `<div class="card">
            <h3>Verdict — mechanical, not discretionary</h3>
            <div class="kv">
              <div class="k">status</div><div class="v">${statusBadge(c.verdict.status)}</div>
              <div class="k">procedure hash</div><div class="v hash">${c.verdict.procedureHash}</div>
              <div class="k">reports root</div><div class="v hash">${c.verdict.reportsRoot}</div>
              <div class="k">resolved at</div><div class="v">${fmtTime(c.verdict.resolvedAt)}</div>
            </div>
          </div>`
        : ""
    }

    ${
      c.appeals.length > 0
        ? `<div class="card"><h3>Appeals (append-only — the original verdict above is never edited)</h3>
          ${c.appeals.map((a: any) => `<div class="rel-edge">appeal #${a.appealId} by ${shortAddr(a.filedBy)} — "${escapeHtml(a.reason)}" — ${a.resolved ? `resolved → ${a.newStatus}` : "pending"}</div>`).join("")}
        </div>`
        : ""
    }
  `;
}

async function runDemo(which: "tamper" | "a" | "b") {
  const content = document.getElementById("content")!;
  content.innerHTML = `<div class="loading">Running scenario ${which.toUpperCase()}… this drives real transactions against the configured chain (local devnet by default). This can take a few seconds.</div>`;
  try {
    const trace = which === "tamper" ? await api.runTamper() : which === "a" ? await api.runScenarioA() : await api.runScenarioB();
    lastTrace = trace;
    selectedClaimId = null;
    await renderTrace(content, trace);
    await api.rebuild();
    await renderClaimList();
  } catch (err) {
    content.innerHTML = `<div class="empty">Demo failed: ${escapeHtml(String(err))}<br/><br/>Is the demo driver running? <code>npm run demo:server</code> (port 4401) alongside a local chain (<code>npm run chain:node</code>) and a deployed contract.</div>`;
  }
}

async function renderTrace(content: HTMLElement, trace: any) {
  content.innerHTML = `
    <div class="card">
      <h3>${escapeHtml(trace.scenario)} — ${trace.ok ? "OK" : "FAILED"}</h3>
      ${trace.steps
        .map(
          (s: any) => `
        <div class="trace-step">
          <div class="label">${escapeHtml(s.label)}</div>
          <div class="detail">${escapeHtml(s.detail)}</div>
          ${s.data ? `<pre>${escapeHtml(JSON.stringify(s.data, null, 2))}</pre>` : ""}
        </div>`,
        )
        .join("")}
    </div>
  `;
}

function shortHash(h: string, len = 14): string {
  return h ? `${h.slice(0, len)}…` : "—";
}
function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}
function fmtTime(t: number): string {
  if (!t) return "—";
  return new Date(t * 1000).toISOString();
}

async function boot() {
  await refreshHealth();
  await render();
  setInterval(async () => {
    await refreshHealth();
    const tag = document.getElementById("health-tag");
    if (tag) {
      tag.innerHTML = health?.ok
        ? `indexer ok · contract ${health.contractAddress ? shortAddr(health.contractAddress) : "not deployed"} · ${health.eventCount ?? 0} events indexed`
        : `<span style="color:#e05555">${escapeHtml(health?.error ?? "loading…")}</span>`;
    }
  }, 5000);
}

boot();
