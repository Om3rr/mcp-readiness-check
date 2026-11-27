#!/usr/bin/env node
// Builds the programmatic token-cost pages from recorded scans (real results only, nothing invented):
//   worker/public/token-cost/index.html            ranked comparison (open servers) + separate needs-login table
//   worker/public/token-cost/<slug>/index.html     one page per scanned server (capped, see MAX_PAGES)
//   worker/public/token-cost/<tier>/index.html     hub pages by measured tokens per turn
//   worker/src/token-cost-paths.js                  paths for the sitemap
// and appends a "Token cost pages" section to worker/public/llms.txt (between markers, idempotent).
// Inputs:
//   reports/registry-token-cost-2026-11-27.json.gz current scan (gzipped JSON) of the official MCP Registry (see reports/scan-registry-token-cost.mjs)
//   reports/token-cost-2026-11-20.json             previous scan behind the pages, for the "changed since last scan" delta
// Run after reports/build-seo-pages.mjs (which rewrites llms.txt):
//   node reports/build-seo-pages.mjs && node reports/build-token-cost-pages.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PAGE_CSS, PAGE_NAV, PAGE_FOOT, ogTags } from '../worker/src/pages.js';

const SITE = process.env.SITE_URL || 'https://mcp.pacerai.fit';
const REPO = 'https://github.com/Om3rr/mcp-readiness-check';
const CUR_FILE = process.argv[2] || 'reports/registry-token-cost-2026-11-27.json.gz';
const PREV_FILE = process.argv[3] || 'reports/token-cost-2026-11-20.json';
const MAX_PAGES = Number(process.env.MAX_PAGES || 500);
const PER_NAMESPACE = 2; // new pages per registry namespace, so one publisher can't fill the list
const raw = readFileSync(CUR_FILE);
const cur = JSON.parse((CUR_FILE.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
const prev = JSON.parse(readFileSync(PREV_FILE, 'utf8')).servers;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const pageOf = (u) => { const x = new URL(u); return `/s/${x.host}${x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '')}`; };
const key = (u) => String(u).trim().replace(/\/+$/, '');
// Public pages stay neutral: no Origin/CORS findings, and nothing that names people or unrelated brands.
const NO_ORIGIN = (i) => !/origin|cors/i.test(`${i.id || ''} ${i.title || ''}`);
const BLOCK = /omer|wonderful|\bvia\b|origin|cors|pacer/i;
// Test, demo and throwaway registry entries make thin pages.
const JUNK = /\b(test|testing|demo|example|sample|hello|benchmark|todo|template|playground)\b|[0-9a-f]{8}/i;
const clean = (s) => s != null && !BLOCK.test(String(s));
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
const RESERVED = new Set(['under-1k-tokens', '1k-5k-tokens', '5k-20k-tokens', 'over-20k-tokens']);
const TIERS = [
  { id: 'under-1k-tokens', label: 'under 1,000 tokens', min: 0, max: 1000 },
  { id: '1k-5k-tokens', label: '1,000 to 5,000 tokens', min: 1000, max: 5000 },
  { id: '5k-20k-tokens', label: '5,000 to 20,000 tokens', min: 5000, max: 20000 },
  { id: 'over-20k-tokens', label: 'over 20,000 tokens', min: 20000, max: Infinity },
];
const tierOf = (t) => TIERS.find((x) => t >= x.min && t < x.max);

const curBy = new Map(cur.servers.map((s) => [key(s.url), s]));
const prevBy = new Map(prev.map((p) => [key(p.url), p]));
const used = new Set([...prev.map((p) => p.id), ...RESERVED]);
const pretty = (s) => s.split(/[-_.]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
function displayName(s) {
  const t = String(s.title || '').split(/\s+[-–—|:]\s+|:\s+/)[0].trim().replace(/[\s-]+(remote\s+)?(mcp(\s+server)?|server)$/i, '').trim();
  if (t && t.length <= 48) return t;
  const n = String(s.registryName || '').split('/').pop();
  return n ? pretty(n).slice(0, 48) : new URL(s.url).host;
}
function newSlug(s) {
  const [ns = '', n = ''] = String(s.registryName || '').split('/');
  const nsTail = slugify(ns.split('.').filter((p) => !['io', 'github', 'com', 'ai', 'app', 'dev', 'net', 'org', 'co', 'www'].includes(p)).join('-'));
  const n0 = slugify(n);
  let base = !n0 ? nsTail : nsTail && !n0.includes(nsTail) && !nsTail.includes(n0) ? slugify(`${nsTail}-${n0}`) : n0;
  base = base.replace(/-(mcp-server|mcp|server)$/, '') || base;
  if (/^(mcp|server|mcp-server|remote|api|http|app|ai)$/.test(base)) base = slugify(new URL(s.url).host);
  if (!base) base = slugify(new URL(s.url).host);
  let slug = base;
  if (used.has(slug)) slug = slugify(`${nsTail}-${base}`) || base;
  while (used.has(slug)) slug += '-2';
  used.add(slug);
  return slug;
}
const toRec = (s, extra) => ({
  url: s.url, registryName: s.registryName || null, websiteUrl: s.websiteUrl || null, transport: s.transport || null,
  description: clean(s.description) ? String(s.description).slice(0, 300) : null,
  score: s.score, authRequired: !!s.authRequired, toolCount: s.toolCount, contextTokens: s.contextTokens,
  issues: (s.issues || []).filter(NO_ORIGIN), scannedAt: s.scannedAt, ...extra,
});

// 1) Every server that already had a page keeps its URL; refreshed with the new scan when it answered.
const ALL = [];
for (const p of prev) {
  const s = curBy.get(key(p.url));
  if (s && s.ok) ALL.push(toRec(s, { id: p.id, name: p.name, legacy: true, prev: p }));
  else ALL.push({ id: p.id, name: p.name, url: p.url, legacy: true, prev: null, score: p.score, authRequired: p.authRequired, toolCount: p.toolCount, contextTokens: p.contextTokens, issues: [], scannedAt: p.scannedAt, rescanError: s ? s.error : 'not rescanned', description: null });
}
// 2) New pages: registry servers that answered tools/list without login with at least one tool.
const legacyKeys = new Set(prev.map((p) => key(p.url)));
const nsCount = {};
const candidates = cur.servers
  .filter((s) => s.ok && !s.authRequired && s.toolCount > 0 && s.registryName && !legacyKeys.has(key(s.url)))
  .filter((s) => !JUNK.test(`${s.registryName} ${s.title || ''}`))
  .filter((s) => clean(s.url) && clean(s.registryName) && clean(s.title) !== false && clean(displayName(s)))
  .sort((a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0) || (b.websiteUrl ? 1 : 0) - (a.websiteUrl ? 1 : 0)
    || (a.registryName.startsWith('io.github.') ? 1 : 0) - (b.registryName.startsWith('io.github.') ? 1 : 0) || b.toolCount - a.toolCount || a.registryName.localeCompare(b.registryName));
// Round-robin across the size groups so every hub has servers, at most PER_NAMESPACE new pages per registry publisher.
const queues = TIERS.map((t) => candidates.filter((s) => tierOf(s.contextTokens) === t));
for (let k = 0; ALL.length < MAX_PAGES && queues.some((q) => q.length); k++) {
  const q = queues[k % queues.length];
  while (q.length) {
    const s = q.shift();
    const ns = s.registryName.split('/')[0];
    if ((nsCount[ns] || 0) >= PER_NAMESPACE) continue;
    nsCount[ns] = (nsCount[ns] || 0) + 1;
    ALL.push(toRec(s, { id: newSlug(s), name: displayName(s), legacy: false, prev: null }));
    break;
  }
}
for (const r of ALL) r.issues = (r.issues || []).filter(NO_ORIGIN).filter((i) => clean(i.title));

// Unique labels: transport for same-name pairs, then the registry name.
const nameCount = ALL.reduce((a, r) => { a[r.name] = (a[r.name] || 0) + 1; return a; }, {});
function label(r) {
  if (nameCount[r.name] < 2) return r.name;
  const p = new URL(r.url).pathname.replace(/\/+$/, '');
  if (/(^|\/)sse$/i.test(p)) return `${r.name} (SSE)`;
  if (/(^|\/)mcp$/i.test(p) && r.legacy) return `${r.name} (Streamable HTTP)`;
  return `${r.name} (${r.registryName || new URL(r.url).host})`;
}
const labels = new Map(); for (const r of ALL) { let l = label(r); while ([...labels.values()].includes(l)) l += ` [${new URL(r.url).host}]`; labels.set(r.id, l); }
const L = (r) => labels.get(r.id);
const path = (r) => `/token-cost/${r.id}/`;
const open = ALL.filter((r) => !r.authRequired).sort((a, b) => (a.contextTokens ?? 0) - (b.contextTokens ?? 0) || L(a).localeCompare(L(b)));
const auth = ALL.filter((r) => r.authRequired).sort((a, b) => L(a).localeCompare(L(b)));
const rank = new Map(open.map((r, i) => [r.id, i + 1]));
const C = cur.counts;
const curDay = dateLabel(cur.recorded);

function annotations(r) {
  if (r.authRequired) return 'Not visible (tool list is behind login)';
  if (!r.toolCount) return 'Not applicable (no tools listed)';
  if (r.issues.some((i) => /No tool declares annotations/i.test(i.title))) return 'No tool declares annotations (readOnlyHint / destructiveHint)';
  const risky = r.issues.filter((i) => /has no annotations/i.test(i.title)).length;
  if (risky) return `${risky} state-changing tool${risky > 1 ? 's' : ''} without annotations`;
  return 'No missing-annotation warning reported by the scan';
}
function authStatus(r) {
  if (!r.authRequired) return 'No login needed to list tools (initialize and tools/list answered without credentials)';
  return 'Login required: the unauthenticated request was rejected, so no tool list was returned';
}
const others = (r) => r.issues.filter((i) => !/annotations/i.test(i.title));
function delta(r) {
  const p = r.prev;
  if (!p) return null;
  const was = dateLabel(p.scannedAt);
  if (p.authRequired && r.authRequired) return { text: `Still behind login, as on ${was}. No token count either time.` };
  if (p.authRequired && !r.authRequired) return { text: `On ${was} this server required login; on ${dateLabel(r.scannedAt)} it listed ${fmt(r.toolCount)} tools without login (~${fmt(r.contextTokens)} tokens).` };
  if (!p.authRequired && r.authRequired) return { text: `On ${was} it listed ${fmt(p.toolCount)} tools without login (~${fmt(p.contextTokens)} tokens); on ${dateLabel(r.scannedAt)} it required login.` };
  const d = r.contextTokens - p.contextTokens;
  const pct = p.contextTokens ? Math.round((d / p.contextTokens) * 1000) / 10 : null;
  const tools = r.toolCount - p.toolCount;
  if (d === 0 && tools === 0) return { text: `Unchanged since ${was}: ${fmt(p.toolCount)} tools, ~${fmt(p.contextTokens)} tokens.`, d: 0 };
  return { text: `${was}: ${fmt(p.toolCount)} tools, ~${fmt(p.contextTokens)} tokens. ${dateLabel(r.scannedAt)}: ${fmt(r.toolCount)} tools, ~${fmt(r.contextTokens)} tokens. Change: ${d > 0 ? '+' : ''}${fmt(d)} tokens${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}, ${tools > 0 ? '+' : ''}${tools} tool${Math.abs(tools) === 1 ? '' : 's'}.`, d };
}

const FOOT = PAGE_FOOT.replace(/<p class="contact"[\s\S]*?<\/p>/, '');
const NOTE = 'This is an automated surface check of the public MCP endpoint, not a security audit.';
const CSS = `${PAGE_CSS}main{max-width:none}.n{font-weight:800}table.data{min-width:720px}code.nw{white-space:nowrap;overflow-wrap:normal}h2{margin-top:28px}.facts td:first-child{color:var(--mut);width:38%}.note{border-left:3px solid #d29922;padding:8px 12px;background:rgba(210,153,34,.08);border-radius:6px}.delta{border-left:3px solid var(--acc);padding:8px 12px;background:rgba(124,156,255,.08);border-radius:6px}form.inline{display:inline}.hubs a{margin-right:12px}`;
const head = (title, desc, url, ld) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${ogTags(title, desc, url)}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body><div class="wrap">${PAGE_NAV}<main>`;
const tail = `</main>${FOOT}</div><script src="/t.js" defer></script></body></html>\n`;
const crumb = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
const scanCta = `<div class="actions"><a class="btn" href="/?utm_source=mcp-readiness&amp;utm_medium=token-cost&amp;utm_campaign=scan">Scan your own server free</a><a class="btn ghost" href="/#remote">Use the free scan from your agent (MCP endpoint)</a></div>
<p class="small">Free, no sign-up. Agents can call the same scan over MCP at <code>${SITE}/mcp</code> (Streamable HTTP, tool <code>scan_mcp_server</code>).</p>`;
const hubLinks = `<p class="small hubs">Browse by size: ${TIERS.map((t) => `<a href="/token-cost/${t.id}/">${esc(t.label)}</a>`).join(' ')}</p>`;

function desc(r) {
  const day = dateLabel(r.scannedAt);
  if (r.authRequired) return `${L(r)} MCP server requires login, so no tool list or token count was returned in our unauthenticated scan on ${day}. Pre-login readiness ${r.score}/100.`;
  return `${L(r)} MCP server: ${fmt(r.toolCount)} tools, about ${fmt(r.contextTokens)} tokens of tool list per agent turn (±10%), readiness ${r.score}/100. Measured ${day}.`;
}
function neighbours(r) {
  const pool = r.authRequired ? auth : open;
  const i = pool.findIndex((x) => x.id === r.id);
  return pool.filter((x, j) => x.id !== r.id && Math.abs(j - i) <= 3).slice(0, 6);
}

if (existsSync('worker/public/token-cost')) rmSync('worker/public/token-cost', { recursive: true });
mkdirSync('worker/public/token-cost', { recursive: true });
for (const r of ALL) {
  const url = `${SITE}${path(r)}`;
  const name = L(r);
  const title = `Token cost of ${name} MCP server`;
  const m = desc(r);
  const day = dateLabel(r.scannedAt);
  const tier = !r.authRequired && r.contextTokens != null ? tierOf(r.contextTokens) : null;
  const ch = delta(r);
  const rows = [
    ['Endpoint', `<code>${esc(r.url)}</code>`],
    ...(r.registryName ? [['MCP Registry name', `<code>${esc(r.registryName)}</code>`]] : []),
    ...(r.transport ? [['Transport (registry)', r.transport === 'sse' ? 'SSE' : 'Streamable HTTP']] : []),
    ['Scan date', `<time datetime="${esc(r.scannedAt)}">${esc(day)}</time>`],
    ['Tools listed', r.authRequired ? 'Not returned (login required)' : esc(fmt(r.toolCount))],
    ['Estimated tool-list tokens per turn', r.authRequired ? 'Not measured (no tool list without login)' : `~${esc(fmt(r.contextTokens))} <span class="small">(estimate, about ±10%)</span>`],
    ['Rank by tokens per turn', r.authRequired ? 'Not ranked (behind login)' : `${rank.get(r.id)} of ${open.length} servers on the ranking (1 = lightest)`],
    ...(tier ? [['Size group', `<a href="/token-cost/${tier.id}/">${esc(tier.label)} per turn</a>`]] : []),
    ['Auth / OAuth', esc(authStatus(r))],
    ['Tool annotations', esc(annotations(r))],
    ['Readiness score', `${esc(r.score)}/100${r.authRequired ? ' <span class="small">(pre-login surface only)</span>' : ''}`],
  ];
  const notes = others(r);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', name: title, description: m, url, dateModified: String(r.scannedAt).slice(0, 10) },
    crumb([['MCP Readiness', `${SITE}/`], ['MCP server token cost ranking', `${SITE}/token-cost/`], [name, url]]),
  ] };
  const summary = r.authRequired
    ? `<p>The ${esc(name)} MCP server required login. The unauthenticated scan on ${esc(day)} returned no tool list, so the number of tools and the token cost per turn were not measured. The readiness score covers only what an MCP client sees before login.</p>`
    : `<p>On ${esc(day)} the ${esc(name)} MCP server listed ${esc(fmt(r.toolCount))} tool${r.toolCount === 1 ? '' : 's'} without login. An MCP client sends that tool list to the model on every turn; we estimate it at about ${esc(fmt(r.contextTokens))} tokens per turn (±10%).</p>`;
  const deltaHtml = ch ? `<p class="delta small"><b>Token cost changed since last scan?</b> ${esc(ch.text)}</p>`
    : r.rescanError ? `<p class="delta small">The ${esc(curDay)} re-scan did not get an answer (${esc(String(r.rescanError).replace(/[{}"].*$/, '').slice(0, 90))}), so this page shows the ${esc(day)} result.</p>` : '';
  const regDesc = r.description ? `<p class="small">MCP Registry description: “${esc(r.description)}”</p>` : '';
  const site = r.websiteUrl && clean(r.websiteUrl) && /^https:\/\//.test(r.websiteUrl) ? ` · <a href="${esc(r.websiteUrl)}" rel="nofollow ugc noopener">Publisher site</a>` : '';
  const details = r.legacy && existsSync(`worker/public/mcp-servers/${r.id}/index.html`) ? ` · <a href="/mcp-servers/${esc(r.id)}/">${esc(name)} readiness details</a>` : '';
  mkdirSync(`worker/public/token-cost/${r.id}`, { recursive: true });
  writeFileSync(`worker/public/token-cost/${r.id}/index.html`, `${head(title, m, url, ld)}
<p class="small"><a href="/">MCP Readiness</a> / <a href="/token-cost/">Token cost ranking</a> / ${esc(name)}</p>
<h1>Token cost of ${esc(name)} MCP server</h1>
<p class="small">Scanned <time datetime="${esc(r.scannedAt)}">${esc(day)}</time>, unauthenticated scan of the public endpoint.</p>
${summary}
${deltaHtml}
${regDesc}
<div class="card"><h2 style="margin-top:0">Measured results</h2><div class="tablewrap"><table class="facts"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
${notes.length ? `<h3>Other notes from the scan</h3><ul class="issues">${notes.map((i) => `<li>${esc(i.title)}</li>`).join('')}</ul>` : ''}
<p class="note small">${NOTE} No tool was called. Token counts are estimates (about ±10%). Not affiliated with ${esc(r.name)}.</p></div>
<div class="card"><h2 style="margin-top:0">Check it again</h2><p class="small">Results can change when the server ships new tools. The live page shows the latest cached result and has a Rescan button (a POST request, nothing runs on page load).</p>
<div class="actions"><a class="btn" href="${esc(pageOf(r.url))}" rel="nofollow">Open the live page and rescan</a></div>${scanCta}</div>
<div class="card"><h2 style="margin-top:0">${r.authRequired ? 'Other servers that need login' : 'Servers with a similar token cost'}</h2><ul>${neighbours(r).map((x) => `<li><a href="${path(x)}">Token cost of ${esc(L(x))}</a>: ${x.authRequired ? 'login required' : `~${esc(fmt(x.contextTokens))} tokens, ${esc(fmt(x.toolCount))} tools`}</li>`).join('')}</ul>
<p class="small"><a href="/token-cost/">Full token cost ranking</a>${tier ? ` · <a href="/token-cost/${tier.id}/">More servers ${esc(tier.label)}</a>` : ''}${details}${site} · <a href="/blog/reduce-mcp-tool-list-token-cost/">How to reduce tool-list token cost</a></p></div>
${tail}`);
}

const oRow = (r) => `<tr><td class="n">${rank.get(r.id)}</td><td><a href="${path(r)}">${esc(L(r))}</a><div class="small"><code class="nw">${esc(r.url)}</code></div></td><td class="n" data-sort="${esc(r.contextTokens)}">~${esc(fmt(r.contextTokens))}</td><td data-sort="${esc(r.toolCount)}">${esc(fmt(r.toolCount))}</td><td>${r.prev && !r.prev.authRequired && !r.authRequired ? (r.contextTokens - r.prev.contextTokens === 0 ? '0' : `${r.contextTokens - r.prev.contextTokens > 0 ? '+' : ''}${esc(fmt(r.contextTokens - r.prev.contextTokens))}`) : '<span class="small">new</span>'}</td><td>${esc(r.score)}/100</td><td><time datetime="${esc(r.scannedAt)}">${esc(dateLabel(r.scannedAt))}</time></td></tr>`;
const oHead = `<thead><tr><th>#</th><th>Server</th><th>Tokens per turn ▲</th><th>Tools</th><th>Change vs 20 Nov</th><th>Readiness</th><th>Scanned</th></tr></thead>`;
const aRow = (r) => `<tr><td><a href="${path(r)}">${esc(L(r))}</a><div class="small"><code class="nw">${esc(r.url)}</code></div></td><td>Login required, no tool list returned</td><td>${esc(r.score)}/100 <span class="small">(pre-login)</span></td><td><time datetime="${esc(r.scannedAt)}">${esc(dateLabel(r.scannedAt))}</time></td></tr>`;

// Size hubs (measured tokens per turn).
for (const t of TIERS) {
  const list = open.filter((r) => tierOf(r.contextTokens) === t);
  const tTitle = `MCP servers with a tool list ${t.label} per turn`;
  const tDesc = `${list.length} public MCP servers whose tool list measured ${t.label} per agent turn in our ${curDay} scan of the official MCP Registry, lightest first.`;
  const tUrl = `${SITE}/token-cost/${t.id}/`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: tTitle, description: tDesc, url: tUrl, dateModified: cur.recorded.slice(0, 10) },
    crumb([['MCP Readiness', `${SITE}/`], ['MCP server token cost ranking', `${SITE}/token-cost/`], [tTitle, tUrl]]),
  ] };
  mkdirSync(`worker/public/token-cost/${t.id}`, { recursive: true });
  writeFileSync(`worker/public/token-cost/${t.id}/index.html`, `${head(tTitle, tDesc, tUrl, ld)}
<p class="small"><a href="/">MCP Readiness</a> / <a href="/token-cost/">Token cost ranking</a> / ${esc(t.label)}</p>
<h1>${esc(tTitle)}</h1>
<p>${esc(tDesc)} Token counts are estimates (about ±10%).</p>
${hubLinks}
<div class="tablewrap"><table class="data">${oHead}<tbody>${list.map(oRow).join('')}</tbody></table></div>
<div class="card"><h2 style="margin-top:0">Measure your own server</h2>${scanCta}</div>
<p class="small" style="margin-top:30px">${NOTE} No tool was called. Not an endorsement and not affiliated with any listed vendor.</p>
${tail}`);
}

// Ranked comparison page.
const cTitle = 'MCP server token cost ranking';
const cDesc = `Measured tool-list token cost per agent turn for ${open.length} public MCP servers from the official MCP Registry, ranked lightest to heaviest, plus ${auth.length} that need login. Scanned ${curDay}.`;
const cUrl = `${SITE}/token-cost/`;
const cLd = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', name: cTitle, description: cDesc, url: cUrl, dateModified: cur.recorded.slice(0, 10) },
  { '@type': 'ItemList', name: 'MCP servers ranked by tool-list tokens per turn (lightest first)', itemListOrder: 'https://schema.org/ItemListOrderAscending', itemListElement: open.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${L(r)} MCP server`, url: `${SITE}${path(r)}` })) },
  crumb([['MCP Readiness', `${SITE}/`], [cTitle, cUrl]]),
] };
const tot = open.reduce((s, r) => s + (r.contextTokens || 0), 0);
const changed = ALL.filter((r) => r.prev && !r.prev.authRequired && !r.authRequired);
const moved = changed.filter((r) => r.contextTokens !== r.prev.contextTokens);
writeFileSync('worker/public/token-cost/index.html', `${head(cTitle, cDesc, cUrl, cLd)}
<p class="small"><a href="/">MCP Readiness</a> / Token cost ranking</p>
<h1>MCP server token cost ranking</h1>
<p>Every MCP server you connect sends its tool list to the model on every agent turn. This table ranks ${open.length} public MCP servers by the measured size of that tool list, lightest first. Token counts are estimates (about ±10%).</p>
<p class="small">On ${esc(curDay)} we scanned ${fmt(C.targets)} unique remote endpoints${C.registryServers ? ` from the ${fmt(C.registryServers)} servers listed in the official MCP Registry` : ' listed in the official MCP Registry'} (plus the servers on the earlier ranking), without login: ${fmt(C.open)} returned a tool list with at least one tool, ${fmt(C.open0)} returned an empty tool list, ${fmt(C.auth)} required login and ${fmt(C.failed)} did not answer or failed. This page covers ${fmt(ALL.length)} of them (at most ${PER_NAMESPACE} new servers per registry publisher); the raw data has all of them. Of the ${changed.length} servers measured both on 20 November and ${esc(curDay)}, ${moved.length} changed token cost.</p>
<p class="small">Lightest: ${esc(L(open[0]))} (~${esc(fmt(open[0].contextTokens))} tokens). Heaviest: ${esc(L(open.at(-1)))} (~${esc(fmt(open.at(-1).contextTokens))} tokens). All ${open.length} together: ~${esc(fmt(tot))} tokens per turn.</p>
${hubLinks}
<h2>Ranked by tokens per turn</h2>
<div class="tablewrap"><table class="data">${oHead}<tbody>${open.map(oRow).join('')}</tbody></table></div>
<h2>Servers that need login (${auth.length})</h2>
<p class="small">These servers rejected the unauthenticated request and returned no tool list, so their token cost was not measured. The readiness score covers only the pre-login surface.</p>
<div class="tablewrap"><table class="data"><thead><tr><th>Server</th><th>Tool list</th><th>Readiness</th><th>Scanned</th></tr></thead><tbody>${auth.map(aRow).join('')}</tbody></table></div>
<div class="card"><h2 style="margin-top:0">Measure your own server</h2>${scanCta}<div class="actions"><a class="btn ghost" href="/mcp-servers/">Readiness details for popular servers</a><a class="btn ghost" href="/blog/reduce-mcp-tool-list-token-cost/">Reduce tool-list token cost</a></div></div>
<p class="small" style="margin-top:30px">${NOTE} No tool was called. Not an endorsement and not affiliated with any listed vendor. Raw data: <a href="${REPO}/blob/main/${CUR_FILE}">${esc(CUR_FILE)}</a> and <a href="${REPO}/blob/main/${PREV_FILE}">${esc(PREV_FILE)}</a>.</p>
${tail}`);

const PATHS = ['/token-cost/', ...TIERS.map((t) => `/token-cost/${t.id}/`), ...ALL.map(path)];
writeFileSync('worker/src/token-cost-paths.js', `// Generated by reports/build-token-cost-pages.mjs. Token cost pages for the sitemap.\nexport const TOKEN_COST_LASTMOD = ${JSON.stringify(cur.recorded.slice(0, 10))};\nexport const TOKEN_COST_PATHS = ${JSON.stringify(PATHS)};\n`);

const START = '<!-- token-cost:start -->';
const END = '<!-- token-cost:end -->';
const llms = readFileSync('worker/public/llms.txt', 'utf8').replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`), '\n').replace(/\n+$/, '\n');
const sec = `${START}
## Token cost pages
- [MCP server token cost ranking](${SITE}/token-cost/): ${open.length} open servers ranked by measured tool-list tokens per turn, ${auth.length} behind login. Scanned ${curDay}.
${TIERS.map((t) => `- [MCP servers with a tool list ${t.label} per turn](${SITE}/token-cost/${t.id}/)`).join('\n')}
${ALL.map((r) => `- [Token cost of ${L(r)} MCP server](${SITE}${path(r)}): ${r.authRequired ? 'login required, not measured' : `~${fmt(r.contextTokens)} tokens per turn, ${r.toolCount} tools`}`).join('\n')}
${END}
`;
writeFileSync('worker/public/llms.txt', `${llms}\n${sec}`);
console.log(`wrote ${ALL.length} token-cost pages + ranking + ${TIERS.length} hubs (${open.length} open, ${auth.length} auth, ${ALL.filter((r) => !r.legacy).length} new, ${ALL.filter((r) => r.rescanError).length} legacy kept from 20 Nov)`);
