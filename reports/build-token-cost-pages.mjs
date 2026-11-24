#!/usr/bin/env node
// Builds the programmatic token-cost pages from recorded scans (real results only, nothing invented):
//   worker/public/token-cost/index.html          ranked comparison
//   worker/public/token-cost/<slug>/index.html   one page per scanned server
//   worker/src/token-cost-paths.js                paths for the sitemap
// and appends a "Token cost pages" section to worker/public/llms.txt (between markers, idempotent).
// Run after reports/build-seo-pages.mjs (which rewrites llms.txt):
//   node reports/build-seo-pages.mjs && node reports/build-token-cost-pages.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { PAGE_CSS, PAGE_NAV, PAGE_FOOT, ogTags } from '../worker/src/pages.js';

const SITE = process.env.SITE_URL || 'https://mcp.pacerai.fit';
const REPO = 'https://github.com/Om3rr/mcp-readiness-check';
const file = process.argv[2] || 'reports/popular-remote-servers-2026-11-20.json';
const d = JSON.parse(readFileSync(file, 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const pageOf = (u) => { const x = new URL(u); return `/s/${x.host}${x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '')}`; };
const NO_ORIGIN = (i) => !/origin|cors/i.test(`${i.id || ''} ${i.title || ''}`);

// Same merge as build-seo-pages.mjs: recorded results first, then data/mcp-servers.json, deduplicated by URL.
const EXP_FILE = 'data/mcp-servers.json';
const expRaw = existsSync(EXP_FILE) ? JSON.parse(readFileSync(EXP_FILE, 'utf8')) : [];
const seen = new Set([...d.results.map((r) => r.url), ...(d.failed || []).map((f) => f.url)]);
const usedSlugs = new Set(d.results.map((r) => r.id));
const expansion = [];
for (const x of expRaw) {
  if (!x || !x.url || seen.has(x.url)) continue;
  seen.add(x.url);
  if (x.score == null) continue; // not scored: no page
  let slug = String(x.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'server';
  while (usedSlugs.has(slug)) slug += '-2';
  usedSlugs.add(slug);
  expansion.push({ id: slug, name: x.name, url: x.url, score: x.score, authRequired: x.tools == null, toolCount: x.tools, contextTokens: x.tokens_per_turn,
    issues: (x.warnings || []).map((t) => ({ level: 'warn', title: String(t) })), info: [], scannedAt: x.scanned_at });
}
export const ALL = [...d.results.map((r) => ({ ...r, scannedAt: d.recorded })), ...expansion]
  .map((r) => ({ ...r, issues: (r.issues || []).filter(NO_ORIGIN) }));

// Two pages for one provider (Square SSE vs Streamable HTTP): put the transport in the name.
const nameCount = ALL.reduce((a, r) => { a[r.name] = (a[r.name] || 0) + 1; return a; }, {});
function label(r) {
  if (nameCount[r.name] < 2) return r.name;
  const p = new URL(r.url).pathname.replace(/\/+$/, '');
  if (/(^|\/)sse$/i.test(p)) return `${r.name} (SSE)`;
  if (/(^|\/)mcp$/i.test(p)) return `${r.name} (Streamable HTTP)`;
  return r.name;
}
const path = (r) => `/token-cost/${r.id}/`;
const open = ALL.filter((r) => !r.authRequired).sort((a, b) => (a.contextTokens ?? 0) - (b.contextTokens ?? 0) || a.name.localeCompare(b.name));
const auth = ALL.filter((r) => r.authRequired).sort((a, b) => a.name.localeCompare(b.name));
const rank = new Map(open.map((r, i) => [r.id, i + 1]));

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

const FOOT = PAGE_FOOT.replace(/<p class="contact"[\s\S]*?<\/p>/, '');
const NOTE = 'This is an automated surface check of the public MCP endpoint, not a security audit.';
const CSS = `${PAGE_CSS}main{max-width:none}.n{font-weight:800}table.data{min-width:720px}code.nw{white-space:nowrap;overflow-wrap:normal}h2{margin-top:28px}.facts td:first-child{color:var(--mut);width:38%}.note{border-left:3px solid #d29922;padding:8px 12px;background:rgba(210,153,34,.08);border-radius:6px}form.inline{display:inline}`;
const head = (title, desc, url, ld) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${ogTags(title, desc, url)}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body><div class="wrap">${PAGE_NAV}<main>`;
const tail = `</main>${FOOT}</div><script src="/t.js" defer></script></body></html>\n`;
const crumb = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });

function desc(r) {
  const day = dateLabel(r.scannedAt);
  if (r.authRequired) return `${label(r)} MCP server requires login, so no tool list or token count was returned in our unauthenticated scan on ${day}. Pre-login readiness ${r.score}/100.`;
  return `${label(r)} MCP server: ${fmt(r.toolCount)} tools, about ${fmt(r.contextTokens)} tokens of tool list per agent turn (±10%), readiness ${r.score}/100. Measured ${day}.`;
}
function neighbours(r) {
  const pool = r.authRequired ? auth : open;
  const i = pool.findIndex((x) => x.id === r.id);
  return pool.filter((x, j) => x.id !== r.id && Math.abs(j - i) <= 2).slice(0, 4);
}

if (existsSync('worker/public/token-cost')) rmSync('worker/public/token-cost', { recursive: true });
mkdirSync('worker/public/token-cost', { recursive: true });
for (const r of ALL) {
  const url = `${SITE}${path(r)}`;
  const name = label(r);
  const title = `Token cost of ${name} MCP server`;
  const m = desc(r);
  const day = dateLabel(r.scannedAt);
  const rows = [
    ['Endpoint', `<code>${esc(r.url)}</code>`],
    ['Scan date', `<time datetime="${esc(r.scannedAt)}">${esc(day)}</time>`],
    ['Tools listed', r.authRequired ? 'Not returned (login required)' : esc(fmt(r.toolCount))],
    ['Estimated tool-list tokens per turn', r.authRequired ? 'Not measured (no tool list without login)' : `~${esc(fmt(r.contextTokens))} <span class="small">(estimate, about ±10%)</span>`],
    ['Rank by tokens per turn', r.authRequired ? 'Not ranked (behind login)' : `${rank.get(r.id)} of ${open.length} open servers (1 = lightest)`],
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
  mkdirSync(`worker/public/token-cost/${r.id}`, { recursive: true });
  writeFileSync(`worker/public/token-cost/${r.id}/index.html`, `${head(title, m, url, ld)}
<p class="small"><a href="/">MCP Readiness</a> / <a href="/token-cost/">Token cost ranking</a> / ${esc(name)}</p>
<h1>Token cost of ${esc(name)} MCP server</h1>
<p class="small">Scanned <time datetime="${esc(r.scannedAt)}">${esc(day)}</time>, unauthenticated scan of the public endpoint.</p>
${summary}
<div class="card"><h2 style="margin-top:0">Measured results</h2><div class="tablewrap"><table class="facts"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
${notes.length ? `<h3>Other notes from the scan</h3><ul class="issues">${notes.map((i) => `<li>${esc(i.title)}</li>`).join('')}</ul>` : ''}
<p class="note small">${NOTE} No tool was called. Token counts are estimates (about ±10%). Not affiliated with ${esc(r.name)}.</p></div>
<div class="card"><h2 style="margin-top:0">Check it again</h2><p class="small">Results can change when the server ships new tools. The live page shows the latest cached result and has a Rescan button (a POST request, nothing runs on page load).</p>
<div class="actions"><a class="btn" href="${esc(pageOf(r.url))}" rel="nofollow">Open the live page and rescan</a><a class="btn ghost" href="/?utm_source=mcp-readiness&amp;utm_medium=token-cost&amp;utm_campaign=scan">Scan your own server</a></div></div>
<div class="card"><h2 style="margin-top:0">${r.authRequired ? 'Other servers that need login' : 'Servers with a similar token cost'}</h2><ul>${neighbours(r).map((x) => `<li><a href="${path(x)}">Token cost of ${esc(label(x))}</a>: ${x.authRequired ? 'login required' : `~${esc(fmt(x.contextTokens))} tokens, ${esc(fmt(x.toolCount))} tools`}</li>`).join('')}</ul>
<p class="small"><a href="/token-cost/">Full token cost ranking</a> · <a href="/mcp-servers/${esc(r.id)}/">${esc(name)} readiness details</a> · <a href="/blog/reduce-mcp-tool-list-token-cost/">How to reduce tool-list token cost</a></p></div>
${tail}`);
}

// Ranked comparison page.
const days = [...new Set(ALL.map((r) => String(r.scannedAt).slice(0, 10)))].sort();
const dayRange = days.length === 1 ? dateLabel(days[0]) : `${dateLabel(days[0])} to ${dateLabel(days.at(-1))}`;
const cTitle = 'MCP server token cost ranking';
const cDesc = `Measured tool-list token cost per agent turn for ${open.length} public MCP servers, ranked lightest to heaviest, plus ${auth.length} servers that need login. Scanned ${dayRange}.`;
const cUrl = `${SITE}/token-cost/`;
const cLd = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', name: cTitle, description: cDesc, url: cUrl, dateModified: days.at(-1) },
  { '@type': 'ItemList', name: 'MCP servers ranked by tool-list tokens per turn (lightest first)', itemListOrder: 'https://schema.org/ItemListOrderAscending', itemListElement: open.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${label(r)} MCP server`, url: `${SITE}${path(r)}` })) },
  crumb([['MCP Readiness', `${SITE}/`], [cTitle, cUrl]]),
] };
const oRow = (r) => `<tr><td class="n">${rank.get(r.id)}</td><td><a href="${path(r)}">${esc(label(r))}</a><div class="small"><code class="nw">${esc(r.url)}</code></div></td><td class="n" data-sort="${esc(r.contextTokens)}">~${esc(fmt(r.contextTokens))}</td><td data-sort="${esc(r.toolCount)}">${esc(fmt(r.toolCount))}</td><td>${esc(r.score)}/100</td><td><time datetime="${esc(r.scannedAt)}">${esc(dateLabel(r.scannedAt))}</time></td></tr>`;
const aRow = (r) => `<tr><td><a href="${path(r)}">${esc(label(r))}</a><div class="small"><code class="nw">${esc(r.url)}</code></div></td><td>Login required, no tool list returned</td><td>${esc(r.score)}/100 <span class="small">(pre-login)</span></td><td><time datetime="${esc(r.scannedAt)}">${esc(dateLabel(r.scannedAt))}</time></td></tr>`;
const tot = open.reduce((s, r) => s + (r.contextTokens || 0), 0);
writeFileSync('worker/public/token-cost/index.html', `${head(cTitle, cDesc, cUrl, cLd)}
<p class="small"><a href="/">MCP Readiness</a> / Token cost ranking</p>
<h1>MCP server token cost ranking</h1>
<p>Every MCP server you connect sends its tool list to the model on every agent turn. This table ranks ${open.length} public MCP servers by the measured size of that tool list, lightest first. The scans ran ${esc(dayRange)} without login. Token counts are estimates (about ±10%).</p>
<p class="small">Lightest: ${esc(label(open[0]))} (~${esc(fmt(open[0].contextTokens))} tokens). Heaviest: ${esc(label(open.at(-1)))} (~${esc(fmt(open.at(-1).contextTokens))} tokens). All ${open.length} together: ~${esc(fmt(tot))} tokens per turn.</p>
<h2>Ranked by tokens per turn</h2>
<div class="tablewrap"><table class="data"><thead><tr><th>#</th><th>Server</th><th>Tokens per turn ▲</th><th>Tools</th><th>Readiness</th><th>Scanned</th></tr></thead><tbody>${open.map(oRow).join('')}</tbody></table></div>
<h2>Servers that need login (${auth.length})</h2>
<p class="small">These servers rejected the unauthenticated request and returned no tool list, so their token cost was not measured. The readiness score covers only the pre-login surface.</p>
<div class="tablewrap"><table class="data"><thead><tr><th>Server</th><th>Tool list</th><th>Readiness</th><th>Scanned</th></tr></thead><tbody>${auth.map(aRow).join('')}</tbody></table></div>
<div class="card"><h2 style="margin-top:0">Measure your own server</h2><p class="small">Free, no sign-up: tools, token cost per turn and readiness notes for any public MCP endpoint.</p><div class="actions"><a class="btn" href="/?utm_source=mcp-readiness&amp;utm_medium=token-cost&amp;utm_campaign=scan">Scan an MCP server</a><a class="btn ghost" href="/mcp-servers/">Readiness details for these servers</a><a class="btn ghost" href="/blog/reduce-mcp-tool-list-token-cost/">Reduce tool-list token cost</a></div></div>
<p class="small" style="margin-top:30px">${NOTE} No tool was called. Not an endorsement and not affiliated with any listed vendor. Raw data: <a href="${REPO}/blob/main/${file}">${esc(file)}</a> and <a href="${REPO}/blob/main/${EXP_FILE}">${EXP_FILE}</a>.</p>
${tail}`);

const PATHS = ['/token-cost/', ...ALL.map(path)];
writeFileSync('worker/src/token-cost-paths.js', `// Generated by reports/build-token-cost-pages.mjs. Token cost pages for the sitemap.\nexport const TOKEN_COST_LASTMOD = ${JSON.stringify(days.at(-1))};\nexport const TOKEN_COST_PATHS = ${JSON.stringify(PATHS)};\n`);

// llms.txt section between markers (build-seo-pages.mjs rewrites the file, so re-run this after it).
const START = '<!-- token-cost:start -->';
const END = '<!-- token-cost:end -->';
const llms = readFileSync('worker/public/llms.txt', 'utf8').replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`), '\n').replace(/\n+$/, '\n');
const sec = `${START}
## Token cost pages
- [MCP server token cost ranking](${SITE}/token-cost/): ${open.length} open servers ranked by measured tool-list tokens per turn, ${auth.length} behind login.
${ALL.map((r) => `- [Token cost of ${label(r)} MCP server](${SITE}${path(r)}): ${r.authRequired ? 'login required, not measured' : `~${fmt(r.contextTokens)} tokens per turn, ${r.toolCount} tools`}`).join('\n')}
${END}
`;
writeFileSync('worker/public/llms.txt', `${llms}\n${sec}`);
console.log(`wrote ${ALL.length} token-cost pages + ranking (${open.length} open, ${auth.length} auth)`);
