#!/usr/bin/env node
// Builds worker/public/mcp-servers/index.html and worker/public/llms.txt from recorded scans (real results only).
// Usage: node reports/build-seo-pages.mjs reports/popular-remote-servers-2026-11-20.json
// Re-scan: for each URL, `npx mcp-readiness-cli --json <url>` (or bin/mcp-readiness-check.js --json) and rebuild the JSON.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PAGE_CSS, PAGE_NAV, PAGE_FOOT } from '../worker/src/pages.js';

const SITE = process.env.SITE_URL || 'https://mcp-readiness.omer20sh.workers.dev';
const REPO = 'https://github.com/Om3rr/mcp-readiness-check';
// The Marketplace listing is not published yet, so Action links go to the repo README.
const ACTION = (medium) => `${REPO}?utm_source=mcp-readiness&amp;utm_medium=${medium}&amp;utm_campaign=action#readme`;
const file = process.argv[2] || 'reports/popular-remote-servers-2026-11-20.json';
const d = JSON.parse(readFileSync(file, 'utf8'));
const st = JSON.parse(readFileSync('reports/state-of-mcp-2026-11.stats.json', 'utf8'));
const day = d.recorded.slice(0, 10);
const dayLabel = new Date(d.recorded).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pageOf = (u) => { const x = new URL(u); return `/s/${x.host}${x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '')}`; };
const open = d.results.filter((r) => !r.authRequired);
const auth = d.results.filter((r) => r.authRequired);
const byTok = [...open].sort((a, b) => (a.contextTokens ?? 0) - (b.contextTokens ?? 0));
const anyOrigin = open.filter((r) => r.info.includes('http.origin')).length;
const noAnnot = open.filter((r) => r.issues.some((i) => i.id === 'annotations.none')).length;
const longDesc = open.filter((r) => r.issues.some((i) => i.id === 'tools.description_long')).length;
const authClean = auth.filter((r) => !r.issues.length).length;
const authIssues = auth.filter((r) => r.issues.length).map((r) => `${r.name} (${r.issues.map((i) => i.title).join('; ')})`);
const STATS = [
  `${d.results.length} popular remote MCP servers scanned unauthenticated on ${dayLabel}: ${open.length} answer tools/list without login, ${auth.length} require OAuth.`,
  `${authClean} of ${auth.length} OAuth-protected servers had no open pre-login issue (401, WWW-Authenticate, OAuth protected-resource discovery)${authIssues.length ? `; open issues: ${authIssues.join(', ')}` : ''}.`,
  `Tool-list cost per agent turn ranges from ~${byTok[0].contextTokens.toLocaleString('en-US')} tokens (${byTok[0].name}) to ~${byTok.at(-1).contextTokens.toLocaleString('en-US')} tokens (${byTok.at(-1).name}) among the open servers.`,
  `${anyOrigin} of ${open.length} open servers accept requests with a foreign Origin header; the spec says servers MUST validate Origin (this matters most for localhost servers).`,
  `${noAnnot} of ${open.length} open servers declare no tool annotations (readOnlyHint / destructiveHint); ${longDesc} of ${open.length} have at least one tool description that is too long.`,
  `The long tail is different: see the State of public MCP servers report (official registry scan, 13 Nov 2026), where the longest single tool description was ${st.d_max.toLocaleString('en-US')} characters.`,
];
const faq = [
  ['Which popular MCP servers are ready for production?', `On ${dayLabel} every server in this list scored 90 or more on the live surface checks. Big vendors mostly get the basics right; the problems we see are in the long tail of the registry (see the State of MCP report). Scores are automated surface checks, not a security audit.`],
  ['How many tokens does an MCP server add to every request?', `Its tool list is sent to the model on every turn. Among the open servers here it ranged from about ${byTok[0].contextTokens} to about ${byTok.at(-1).contextTokens.toLocaleString('en-US')} tokens. Install fewer, smaller servers, or slim long descriptions.`],
  ['Why do OAuth servers show no token cost?', 'Without a login we can only see the pre-login surface: the 401, the WWW-Authenticate header and the OAuth protected-resource metadata. Pro (coming soon) scans behind a test token.'],
  ['How do I get my server listed or re-scanned?', `Scan it on ${SITE}/ and it gets a public page at /s/<host>/<path>. Add the README badge and the free GitHub Action to keep it from drifting.`],
];
const row = (r) => `<tr><td><a href="${pageOf(r.url)}">${esc(r.name)}</a><div class="small"><code class="nw">${esc(r.url)}</code></div></td><td class="n">${r.score}</td><td>${r.authRequired ? 'OAuth required' : `${r.toolCount} tools`}</td><td>${r.authRequired ? 'n/a (behind login)' : `~${(r.contextTokens ?? 0).toLocaleString('en-US')}`}</td><td class="small iss">${esc(r.issues.map((i) => i.title).join('; ') || 'none')}</td></tr>`;
const ld = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'Dataset', name: `Readiness and context cost of ${d.results.length} popular remote MCP servers (${dayLabel})`, description: STATS.join(' '), url: `${SITE}/mcp-servers/`, dateModified: day, license: 'https://opensource.org/licenses/MIT', creator: { '@type': 'Person', name: 'Omer Shacham' }, distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${REPO}/blob/main/${file}` } },
  { '@type': 'ItemList', itemListElement: d.results.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${r.name} MCP server: ${r.score}/100`, url: `${SITE}${pageOf(r.url)}` })) },
  { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
] };
const title = `Popular MCP servers: readiness scores and token cost (${dayLabel})`;
const desc = `Live readiness scores and tool-list token cost for ${d.results.length} popular remote MCP servers (Context7, Hugging Face, Notion, Linear, GitHub, Stripe and more), scanned ${dayLabel}.`;
mkdirSync('worker/public/mcp-servers', { recursive: true });
const CSS = `${PAGE_CSS}main{max-width:none}.n{font-weight:800}table.data{min-width:760px}code.nw{white-space:nowrap;overflow-wrap:normal}td.iss{min-width:220px}h2{margin-top:28px}ul.key li{margin:6px 0}`;
writeFileSync('worker/public/mcp-servers/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}/mcp-servers/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="llms.txt">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}/mcp-servers/">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>${CSS}</style></head><body><div class="wrap">${PAGE_NAV}<main>
<h1>Popular remote MCP servers: readiness and token cost</h1>
<p class="small">Live, unauthenticated scans of ${d.results.length} well-known remote MCP servers on ${esc(dayLabel)} with the open-source scanner. Click a server for its public page and badge.</p>
<div class="card"><h2 style="margin-top:0">Key numbers</h2><ul class="key">${STATS.map((s) => `<li>${esc(s)}</li>`).join('')}</ul><p class="small">Cite as: “MCP Readiness, popular remote MCP servers, ${esc(dayLabel)}, ${SITE}/mcp-servers/”. Raw data: <a href="${REPO}/blob/main/${file}">${file}</a>.</p></div>
<h2>Open servers (tool list visible without login)</h2>
<div class="tablewrap"><table class="data"><thead><tr><th>Server</th><th>Score</th><th>Tools</th><th>Tokens per turn</th><th>Open issues</th></tr></thead><tbody>${byTok.map(row).join('')}</tbody></table></div>
<h2>OAuth-protected servers (pre-login surface)</h2>
<div class="tablewrap"><table class="data"><thead><tr><th>Server</th><th>Score</th><th>Auth</th><th>Tokens per turn</th><th>Open issues</th></tr></thead><tbody>${auth.map(row).join('')}</tbody></table></div>
${d.failed?.length ? `<p class="small">Not scored this run: ${d.failed.map((f) => esc(f.name)).join(', ')} (connection timed out or the endpoint has moved).</p>` : ''}
<div class="card"><h2 style="margin-top:0">Scan your own server</h2><p class="small">Free, no sign-up. You get a public page, a README badge, and a CI gate.</p><div class="actions"><a class="btn" href="/?utm_source=mcp-readiness&amp;utm_medium=leaderboard&amp;utm_campaign=scan">Scan my MCP server</a><a class="btn ghost" href="${ACTION('leaderboard')}" data-event="action_install_click">Add the GitHub Action</a></div></div>
<h2>FAQ</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p class="small">${esc(a)}</p>`).join('')}
<p class="small" style="margin-top:36px">Automated surface checks of what any MCP client sees before login: initialize, tools/list, an unknown method, a foreign Origin, a CORS preflight and OAuth discovery. No tool is called. Not a security audit, not an endorsement, and not affiliated with any listed vendor. Token counts are estimates (about ±10%).</p>
</main>${PAGE_FOOT}</div><script src="/t.js" defer></script></body></html>
`);
writeFileSync('worker/public/llms.txt', `# MCP Readiness

> Free, open-source live scanner for Model Context Protocol (MCP) servers. It connects like Claude, ChatGPT and Cursor do and scores OAuth discovery (RFC 9728), tool annotations, Origin/CORS, JSON-RPC conformance, schemas, and the token cost of the tool list on every agent turn. Web scan, public page per server, README badge, CLI and a GitHub Action. Paid plans are coming soon; there is no checkout today.

## Use it
- [Scan a public MCP server](${SITE}/): paste an https URL, no sign-up, 10 scans/hour.
- [Server pages](${SITE}/s/mcp.context7.com/mcp): /s/<host>/<path> shows the latest score, token cost, top issues and the badge.
- [GitHub Action](${REPO}#readme): fail a PR under a score or over a token budget; works on localhost in CI.
- [CLI](https://github.com/Om3rr/mcp-readiness-cli): scan a remote or stdio MCP server from the terminal.
- [Source (MIT)](${REPO})

## Data
- [Popular remote MCP servers, ${dayLabel}](${SITE}/mcp-servers/): scores and tokens per turn.
${STATS.map((s) => `- ${s}`).join('\n')}
- State of public MCP servers (official registry scan, 13 Nov 2026): ${st.ok.toLocaleString('en-US')} live servers reached; ${st.pub_origin}% of public servers accept a foreign Origin.
- [State of public MCP servers, Nov 2026](${SITE}/state-of-mcp-2026-11.html): the full registry scan and a checklist for server owners.

## Optional
- [Public traffic stats](${SITE}/stats.html)
`);
console.log('wrote mcp-servers/index.html and llms.txt');
