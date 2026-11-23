#!/usr/bin/env node
// Builds worker/public/mcp-servers/index.html and worker/public/llms.txt from recorded scans (real results only).
// Usage: node reports/build-seo-pages.mjs reports/popular-remote-servers-2026-11-20.json
// Re-scan: for each URL, `npx mcp-readiness-cli --json <url>` (or bin/mcp-readiness-check.js --json) and rebuild the JSON.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { PAGE_CSS, PAGE_NAV, PAGE_FOOT , ogTags } from '../worker/src/pages.js';
import { BLOG_POSTS } from '../worker/src/blog-paths.js';

const SITE = process.env.SITE_URL || 'https://mcp.pacerai.fit';
const REPO = 'https://github.com/Om3rr/mcp-readiness-check';
// The Marketplace listing is not published yet, so Action links go to the repo README.
const ACTION = (medium) => `${REPO}?utm_source=mcp-readiness&amp;utm_medium=${medium}&amp;utm_campaign=action#readme`;
const file = process.argv[2] || 'reports/popular-remote-servers-2026-11-20.json';
const d = JSON.parse(readFileSync(file, 'utf8'));
const st = JSON.parse(readFileSync('reports/state-of-mcp-2026-11.stats.json', 'utf8'));
const day = d.recorded.slice(0, 10);
const dayLabel = new Date(d.recorded).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pageOf = (u) => { const x = new URL(u); return `/s/${x.host}${x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '')}`; };
// Expansion set from the CMO (data/mcp-servers.json, plain-text fields). Merged with the recorded 23, deduplicated by URL (recorded wins).
const EXP_FILE = 'data/mcp-servers.json';
const expRaw = existsSync(EXP_FILE) ? JSON.parse(readFileSync(EXP_FILE, 'utf8')) : [];
const seen = new Set([...d.results.map((r) => r.url), ...(d.failed || []).map((f) => f.url)]);
const usedSlugs = new Set(d.results.map((r) => r.id));
const expFailed = [];
const expansion = [];
for (const x of expRaw) {
  if (!x || !x.url || seen.has(x.url)) continue;
  seen.add(x.url);
  if (x.score == null) { expFailed.push({ name: x.name, url: x.url }); continue; }
  let slug = String(x.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'server';
  while (usedSlugs.has(slug)) slug += '-2';
  usedSlugs.add(slug);
  expansion.push({ id: slug, name: x.name, url: x.url, score: x.score, authRequired: x.tools == null, toolCount: x.tools, contextTokens: x.tokens_per_turn,
    issues: (x.warnings || []).map((t) => ({ level: 'warn', title: String(t) })), info: [], scannedAt: x.scanned_at, summary: x.summary, faqs: x.faqs || [], expansion: true });
}
const NO_ORIGIN = (i) => !/origin|cors/i.test(`${i.id || ''} ${i.title || ''}`);
const ALL = [...d.results.map((r) => ({ ...r, scannedAt: d.recorded })), ...expansion].map((r) => ({ ...r, issues: (r.issues || []).filter(NO_ORIGIN) }));
const open = d.results.filter((r) => !r.authRequired);
const auth = d.results.filter((r) => r.authRequired);
const openAll = ALL.filter((r) => !r.authRequired).sort((a, b) => (a.contextTokens ?? 0) - (b.contextTokens ?? 0));
const authAll = ALL.filter((r) => r.authRequired);
const expOpen = expansion.filter((r) => !r.authRequired).sort((a, b) => (b.contextTokens ?? 0) - (a.contextTokens ?? 0));
const slugPage = (r) => `/mcp-servers/${r.id}/`;
const byTok = [...open].sort((a, b) => (a.contextTokens ?? 0) - (b.contextTokens ?? 0));
const anyOrigin = open.filter((r) => r.info.includes('http.origin')).length;
const noAnnot = open.filter((r) => r.issues.some((i) => i.id === 'annotations.none')).length;
const longDesc = open.filter((r) => r.issues.some((i) => i.id === 'tools.description_long')).length;
const authClean = auth.filter((r) => !r.issues.length).length;
const authIssues = auth.filter((r) => r.issues.length).map((r) => `${r.name} (${r.issues.map((i) => i.title).join('; ')})`);
const STATS = [
  `${d.results.length} popular remote MCP servers scanned unauthenticated on ${dayLabel}: ${open.length} answer tools/list without login, ${auth.length} require OAuth.`,
  `${authClean} of ${auth.length} OAuth-protected servers had no pre-login readiness notes (401, WWW-Authenticate, OAuth protected-resource discovery)${authIssues.length ? `; spec notes: ${authIssues.join(', ')}` : ''}.`,
  `Tool-list cost per agent turn ranges from ~${byTok[0].contextTokens.toLocaleString('en-US')} tokens (${byTok[0].name}) to ~${byTok.at(-1).contextTokens.toLocaleString('en-US')} tokens (${byTok.at(-1).name}) among the open servers.`,
  `${noAnnot} of ${open.length} open servers declare no tool annotations (readOnlyHint / destructiveHint); ${longDesc} of ${open.length} have at least one tool description that is too long.`,
  ...(expansion.length ? [`${expansion.length} more remote servers scanned on ${dayLabel}: ${expOpen.length} open, ${expansion.length - expOpen.length} require login. Heaviest open tool lists: ${expOpen.slice(0, 3).map((r) => `${r.name} ~${r.contextTokens.toLocaleString('en-US')} tokens (${r.toolCount} tools)`).join(', ')}.`] : []),
  `The long tail is different: see the State of public MCP servers report (official registry scan, 13 Nov 2026), where the longest single tool description was ${st.d_max.toLocaleString('en-US')} characters.`,
];
const faq = [
  ['Which popular MCP servers are ready for production?', `On ${dayLabel}, ${ALL.filter((r) => r.score >= 90).length} of the ${ALL.length} servers in this list scored 90 or more on the live surface checks. Big vendors mostly get the basics right, but heavy tool lists are common (Gmail, Google Docs and Google Slides each cost about 9,000 to 11,300 tokens per turn); the problems we see are in the long tail of the registry (see the State of MCP report). Scores are automated surface checks, not a security audit.`],
  ['How many tokens does an MCP server add to every request?', `Its tool list is sent to the model on every turn. Among the open servers here it ranged from about ${byTok[0].contextTokens} to about ${byTok.at(-1).contextTokens.toLocaleString('en-US')} tokens. Install fewer, smaller servers, or slim long descriptions.`],
  ['Why do OAuth servers show no token cost?', 'Without a login we can only see the pre-login surface: the 401, the WWW-Authenticate header and the OAuth protected-resource metadata. Pro (coming soon) scans behind a test token.'],
  ['How do I get my server listed or re-scanned?', `Scan it on ${SITE}/ and it gets a public page at /s/<host>/<path>. Add the README badge and the free GitHub Action to keep it from drifting.`],
];
const row = (r) => `<tr><td><a href="${slugPage(r)}">${esc(r.name)}</a><div class="small"><code class="nw">${esc(r.url)}</code></div></td><td class="n">${esc(r.score)}</td><td>${r.authRequired ? 'Login required' : `${esc(r.toolCount)} tools`}</td><td>${r.authRequired ? 'n/a (behind login)' : `~${(r.contextTokens ?? 0).toLocaleString('en-US')}`}</td><td class="small iss">${esc(r.issues.filter(NO_ORIGIN).map((i) => i.title).join('; ') || 'none')}</td></tr>`;
const ld = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'Dataset', name: `Readiness and context cost of ${d.results.length} popular remote MCP servers (${dayLabel})`, description: STATS.join(' '), url: `${SITE}/mcp-servers/`, dateModified: day, license: 'https://opensource.org/licenses/MIT', creator: { '@type': 'Person', name: 'Omer Shacham' }, distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${REPO}/blob/main/${file}` } },
  { '@type': 'ItemList', itemListElement: ALL.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${r.name} MCP server: ${r.score}/100`, url: `${SITE}${slugPage(r)}` })) },
  { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
] };
const title = `Popular MCP servers: readiness scores and token cost (${dayLabel})`;
const desc = `Live readiness scores and tool-list token cost for ${ALL.length} popular remote MCP servers (Context7, Hugging Face, Notion, Linear, GitHub, Stripe and more), scanned ${dayLabel}.`;
mkdirSync('worker/public/mcp-servers', { recursive: true });
const CSS = `${PAGE_CSS}main{max-width:none}.n{font-weight:800}table.data{min-width:760px}code.nw{white-space:nowrap;overflow-wrap:normal}td.iss{min-width:220px}h2{margin-top:28px}ul.key li{margin:6px 0}`;
writeFileSync('worker/public/mcp-servers/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}/mcp-servers/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="llms.txt">
${ogTags(title, desc, `${SITE}/mcp-servers/`)}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>${CSS}</style></head><body><div class="wrap">${PAGE_NAV}<main>
<h1>Popular remote MCP servers: readiness and token cost</h1>
<p class="small">Live, unauthenticated scans of ${ALL.length} well-known remote MCP servers on ${esc(dayLabel)} with the open-source scanner. Click a server for its public page and badge.</p>
<div class="card"><h2 style="margin-top:0">Key numbers</h2><ul class="key">${STATS.map((s) => `<li>${esc(s)}</li>`).join('')}</ul><p class="small">Cite as: “MCP Readiness, popular remote MCP servers, ${esc(dayLabel)}, ${SITE}/mcp-servers/”. Raw data: <a href="${REPO}/blob/main/${file}">${file}</a>.</p></div>
<h2>Open servers (tool list visible without login)</h2>
<div class="tablewrap"><table class="data"><thead><tr><th>Server</th><th>Score</th><th>Tools</th><th>Tokens per turn</th><th>Readiness notes</th></tr></thead><tbody>${openAll.map(row).join('')}</tbody></table></div>
<h2>Login-protected servers (pre-login surface only)</h2>
<div class="tablewrap"><table class="data"><thead><tr><th>Server</th><th>Score</th><th>Auth</th><th>Tokens per turn</th><th>Readiness notes</th></tr></thead><tbody>${authAll.map(row).join('')}</tbody></table></div>
${[...(d.failed || []), ...expFailed].length ? `<p class="small">Not scored this run: ${[...new Set([...(d.failed || []), ...expFailed].map((f) => f.name))].map(esc).join(', ')} (connection timed out or the endpoint has moved).</p>` : ''}
<div class="card"><h2 style="margin-top:0">Scan your own server</h2><p class="small">Free, no sign-up. You get a public page, a README badge, and a CI gate.</p><div class="actions"><a class="btn" href="/?utm_source=mcp-readiness&amp;utm_medium=leaderboard&amp;utm_campaign=scan">Scan my MCP server</a><a class="btn ghost" href="${ACTION('leaderboard')}" data-event="action_install_click">Add the GitHub Action</a></div></div>
<h2>FAQ</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p class="small">${esc(a)}</p>`).join('')}
<p class="small" style="margin-top:36px">Automated surface checks of what any MCP client sees before login: initialize, tools/list, an unknown method, a foreign Origin, a CORS preflight and OAuth discovery. No tool is called. Not a security audit, not an endorsement, and not affiliated with any listed vendor. Token counts are estimates (about ±10%).</p>
</main>${PAGE_FOOT}</div><script src="/t.js" defer></script></body></html>
`);

// Per-server pages: /mcp-servers/<slug>/ (CMO spec 20 Nov 2026). Plain-text data, every field escaped.
const fmt = (n) => Number(n).toLocaleString('en-US');
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
function related(r) {
  const pool = ALL.filter((x) => x.id !== r.id && x.authRequired === r.authRequired);
  return pool.sort((a, b) => Math.abs((a.contextTokens ?? a.score) - (r.contextTokens ?? r.score)) - Math.abs((b.contextTokens ?? b.score) - (r.contextTokens ?? r.score))).slice(0, 3);
}
function serverFaqs(r) {
  const pick = (re) => (r.faqs || []).find((f) => re.test(f.q || ''))?.a;
  const tokA = pick(/^How many tokens/i) || (r.authRequired
    ? `Not visible without login. The ${r.name} tool list sits behind authentication, so this unauthenticated scan could not count tools or tokens.`
    : `About ${fmt(r.contextTokens)} tokens per agent turn for ${r.toolCount} tools, measured by a live unauthenticated scan on ${dateLabel(r.scannedAt)}. The tool list is sent to the model on every turn.`);
  const oauthA = pick(/OAuth/i) || (r.authRequired
    ? (r.issues.length ? `It requires login. The pre-login scan left these readiness notes: ${r.issues.map((i) => i.title).join('; ')}.` : `Yes. The scan reached a login wall (401) and found no open pre-login OAuth discovery issue.`)
    : `It does not need OAuth to list tools: tools/list answers without login, which is common for public read-only servers.`);
  return [
    [`How many tokens does ${r.name} MCP server add?`, tokA],
    [`Does ${r.name} support OAuth discovery?`, oauthA],
    [`How do I test my own MCP server like ${r.name}?`, `Paste its URL into the free scan at ${SITE}/ for a score, token cost and top issues, then add the free GitHub Action (Om3rr/mcp-readiness-check@v1) to fail PRs under a score or over a token budget. Local servers work too: start the server in CI and scan http://127.0.0.1.`],
  ];
}
for (const r of ALL) {
  const url = `${SITE}${slugPage(r)}`;
  const t = `${r.name} MCP server: token cost, tools & readiness score`;
  const m = r.authRequired
    ? `${r.name} MCP server requires login, so tools and token cost are not public. Pre-login readiness ${r.score}/100. Free live scan and GitHub Action.`
    : `${r.name} adds ~${fmt(r.contextTokens)} tokens per turn with ${r.toolCount} tools. Readiness ${r.score}/100. Free live scan and GitHub Action.`;
  const faqs = serverFaqs(r);
  const day2 = dateLabel(r.scannedAt);
  const badgeMd = `[![MCP readiness](${SITE}/badge.svg?url=${encodeURIComponent(r.url)})](${SITE}${pageOf(r.url)})`;
  const sld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', name: t, description: m, url, dateModified: String(r.scannedAt).slice(0, 10), about: { '@type': 'SoftwareApplication', name: `${r.name} MCP server`, applicationCategory: 'DeveloperApplication', url: r.url } },
    { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'MCP Readiness', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Popular MCP servers', item: `${SITE}/mcp-servers/` }, { '@type': 'ListItem', position: 3, name: r.name, item: url }] },
  ] };
  const checks = r.issues.length ? r.issues.map((i) => `<tr><td>Readiness note</td><td>${esc(i.title)}</td></tr>`).join('') : `<tr><td>Pass</td><td>No readiness notes in the ${r.authRequired ? 'pre-login ' : ''}checks</td></tr>`;
  const base = r.authRequired
    ? `<tr><td>Pass</td><td>Unauthenticated requests are rejected (login required)</td></tr>`
    : `<tr><td>Pass</td><td>initialize and tools/list answer without login (${esc(r.toolCount)} tools)</td></tr>`;
  mkdirSync(`worker/public/mcp-servers/${r.id}`, { recursive: true });
  writeFileSync(`worker/public/mcp-servers/${r.id}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title><meta name="description" content="${esc(m)}"><link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${ogTags(t, m, url)}
<script type="application/ld+json">${JSON.stringify(sld).replace(/</g, '\\u003c')}</script>
<style>${PAGE_CSS}.tldr{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0}.tldr div{background:var(--code);border:1px solid var(--line);border-radius:10px;padding:12px}.tldr b{display:block;font-size:22px}.tldr span{color:var(--mut);font-size:13px}.note{border-left:3px solid #d29922;padding:8px 12px;background:rgba(210,153,34,.08);border-radius:6px}</style></head><body><div class="wrap">${PAGE_NAV}<main>
<p class="small"><a href="/mcp-servers/">Popular MCP servers</a> / ${esc(r.name)}</p>
<h1>${esc(r.name)} MCP server: token cost, tools and readiness</h1>
<p class="small">Endpoint: <code>${esc(r.url)}</code></p>
<p class="small"><time datetime="${esc(r.scannedAt)}">Scanned ${esc(day2)}</time>, unauthenticated surface scan</p>
<div class="card"><h2>TL;DR</h2><div class="tldr">
<div><b>${r.authRequired ? 'Behind login' : `~${esc(fmt(r.contextTokens))}`}</b><span>Tokens per turn</span></div>
<div><b>${r.authRequired ? 'Behind login' : esc(r.toolCount)}</b><span>Tools</span></div>
<div><b>${r.authRequired ? 'Login required' : 'None to list tools'}</b><span>Auth</span></div>
<div><b>${esc(r.score)}/100</b><span>Readiness${r.authRequired ? ' (public surface)' : ''}</span></div>
<div><b>${esc(day2)}</b><span>Scan date</span></div></div>
${r.authRequired ? `<p class="note small" style="margin-top:14px">This server needs a login. The score covers only the public surface an MCP client sees before login (the 401, WWW-Authenticate and OAuth discovery). Tools and token cost behind the login were not scanned.</p>` : ''}
${r.summary ? `<p style="margin-top:14px">${esc(r.summary)}</p>` : ''}</div>
<div class="card"><h2>Checks</h2><div class="tablewrap"><table><thead><tr><th>Result</th><th>Check</th></tr></thead><tbody>${base}${checks}</tbody></table></div>
<p class="small">Live, unauthenticated surface checks on ${esc(day2)}. No tool was called. Not a security audit and not affiliated with ${esc(r.name)}. <a href="${pageOf(r.url)}">Live page with a fresh scan</a>.</p></div>
<div class="card"><h2>Scan your own server</h2><p class="small">Free, no sign-up: a score, the token cost of your tool list and the top issues. Then keep it from slipping in CI.</p>
<div class="actions"><a class="btn" href="/?utm_source=mcp-readiness&amp;utm_medium=server-seo&amp;utm_campaign=scan">Scan my MCP server</a><a class="btn ghost" data-event="action_install_click" href="${ACTION('server-seo')}">Add the GitHub Action</a><a class="btn ghost" href="/docs/ci/">CI setup guide</a></div></div>
<div class="card"><h2>${esc(r.name)} readiness badge</h2><div class="badgebox"><img src="${esc(`${SITE}/badge.svg?url=${encodeURIComponent(r.url)}`)}" alt="MCP readiness badge for ${esc(r.name)}" height="20" loading="lazy"></div>
<div class="codebox"><pre id="badge-md">${esc(badgeMd)}</pre><button type="button" class="ghost sm copy" data-copy="badge-md" data-event="badge_copied">Copy badge</button></div></div>
<h2>FAQ</h2>${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p class="small">${esc(a)}</p>`).join('')}
<div class="card"><h2>Related servers</h2><ul>${related(r).map((x) => `<li><a href="${slugPage(x)}">${esc(x.name)}</a>: ${x.authRequired ? `login required, ${esc(x.score)}/100 pre-login` : `~${esc(fmt(x.contextTokens))} tokens, ${esc(x.toolCount)} tools, ${esc(x.score)}/100`}</li>`).join('')}</ul><p class="small"><a href="/mcp-servers/">All ${ALL.length} servers</a></p></div>
</main>${PAGE_FOOT}</div><script src="/t.js" defer></script></body></html>
`);
}
writeFileSync('worker/src/seo-paths.js', `// Generated by reports/build-seo-pages.mjs. Static SEO pages for the sitemap.\nexport const SEO_PATHS = ${JSON.stringify(['/docs/ci/', '/mcp-servers/', ...ALL.map(slugPage)], null, 0)};\n`);

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
- [CI setup guide](${SITE}/docs/ci/): badge and GitHub Action in 3 steps, local servers in CI, troubleshooting.
${STATS.map((s) => `- ${s}`).join('\n')}

## Server pages
${ALL.map((r) => `- [${r.name} MCP server](${SITE}${slugPage(r)}): ${r.authRequired ? `login required, pre-login readiness ${r.score}/100` : `~${fmt(r.contextTokens)} tokens per turn, ${r.toolCount} tools, readiness ${r.score}/100`}`).join('\n')}

## Blog
- [Blog](${SITE}/blog/): guides for shipping MCP servers.
${BLOG_POSTS.map((p) => `- [${p.title}](${SITE}${p.path}): ${p.description}`).join('\n')}

## Reports
- State of public MCP servers (official registry scan, 13 Nov 2026): ${st.ok.toLocaleString('en-US')} live servers reached; ${st.pub_origin}% of public servers accept a foreign Origin.
- [State of public MCP servers, Nov 2026](${SITE}/state-of-mcp-2026-11.html): the full registry scan and a checklist for server owners.

## Optional
- [Public traffic stats](${SITE}/stats.html)
`);
console.log('wrote mcp-servers/index.html and llms.txt');
