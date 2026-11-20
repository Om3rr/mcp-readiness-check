// Indexable per-server pages: /s/<host>/<path> <-> https://<host>/<path>.
// Server-rendered HTML with a stable URL, title, meta description, canonical and JSON-LD.
// README badges link here. No sign-up: a visit runs a free scan when the cached one is missing or older than 24 h.
import { checkTarget } from './guard.js';

// Shared look for server-rendered pages (matches worker/public/index.html).
export const PAGE_CSS = `:root{--bg:#0b1020;--card:#121a33;--ink:#e6e9f5;--mut:#a7b0cc;--acc:#7c9cff;--line:#24305a;--code:#070b18}*{box-sizing:border-box}body{margin:0;overflow-wrap:break-word;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}a{color:var(--acc)}.wrap{max-width:1040px;margin:auto;padding:0 20px}main{max-width:860px}nav{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0}nav .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;color:var(--ink);text-decoration:none;white-space:nowrap}nav .brand img{width:26px;height:26px}nav .links{display:flex;gap:18px}nav .links a{text-decoration:none;color:var(--mut);white-space:nowrap;font-size:15px}h1{font-size:34px;line-height:1.15;margin:18px 0 8px;overflow-wrap:anywhere}h2{font-size:22px;margin:0 0 10px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0;min-width:0}.small{color:var(--mut);font-size:14px}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}pre{margin:0;background:var(--code);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfd6f6}.codebox{position:relative;min-width:0}.codebox pre{padding-right:96px}.codebox .copy{position:absolute;top:8px;right:8px}.issues{padding-left:20px}.issues li{margin:6px 0}.fail{color:#f0706a}.warn{color:#d29922}.info{color:var(--mut)}button,.btn{padding:12px 18px;border-radius:10px;border:1px solid transparent;background:var(--acc);color:#0b1020;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;display:inline-block;line-height:1.2}.ghost{background:transparent;border-color:#3a4a80;color:var(--ink)}.sm{padding:8px 12px;font-size:14px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.badgebox{margin:10px 0}.badgebox img{height:20px}.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px;background:var(--card)}table{width:100%;border-collapse:collapse}td,th{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:15px}th{color:var(--mut);font-weight:600}footer{padding:30px 0 50px;color:var(--mut);font-size:14px;border-top:1px solid var(--line);margin-top:30px}footer a{color:var(--mut)}@media(max-width:640px){nav{flex-direction:column;align-items:flex-start;gap:10px}nav .links{width:100%;flex-wrap:wrap;column-gap:16px;row-gap:6px}h1{font-size:28px}.codebox pre{padding-right:14px;padding-top:44px}}`;
export const PAGE_NAV = `<nav aria-label="Main"><a class="brand" href="/"><img src="/favicon.svg" alt="" width="26" height="26">MCP Readiness</a><div class="links"><a href="/#action">GitHub Action</a><a href="/mcp-servers/">Popular servers</a><a href="/state-of-mcp-2026-11.html">State of MCP report</a><a href="/#pricing">Pricing</a><a href="/#faq">FAQ</a></div></nav>`;
export const PAGE_FOOT = `<footer>MCP Readiness · <a href="https://github.com/Om3rr/mcp-readiness-check">Source (MIT)</a> · <a href="https://github.com/Om3rr/mcp-readiness-cli">CLI</a> · <a href="/mcp-servers/">Popular servers</a> · <a href="/llms.txt">llms.txt</a> · <a href="/stats.html">Public traffic stats</a> · Scores are automated surface checks, not a security audit.<p class="contact" style="margin:10px 0 0">Contact: <a href="mailto:omer20sh@gmail.com">omer20sh@gmail.com</a></p></footer>`;

const TTL_MS = 24 * 3600 * 1000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function pagePath(target) {
  const u = new URL(target);
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  return `/s/${u.host}${path}${u.search}`;
}
export function targetFromPath(pathname, search = '') {
  const rest = pathname.replace(/^\/s\//, '');
  if (!rest || rest.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  return `https://${rest}${search}`;
}

export async function savePage(env, url, view) {
  const rec = { ...view, url, at: new Date().toISOString() };
  await env.LICENSES.put(`page:${url}`, JSON.stringify(rec));
  return rec;
}
export async function loadPage(env, url) {
  const raw = await env.LICENSES.get(`page:${url}`);
  return raw ? JSON.parse(raw) : null;
}

export async function serverPage(req, env, { scanLimited, canScan }) {
  const u = new URL(req.url);
  const t = checkTarget(targetFromPath(decodeURI(u.pathname), u.search));
  if (!t.ok) return html(notFound('That is not a public https MCP endpoint.'), 404);
  const base = env.PUBLIC_URL || u.origin;
  const canonical = `${base}${pagePath(t.url)}`;
  if (decodeURI(u.pathname) + u.search !== pagePath(t.url)) return Response.redirect(canonical, 301);
  let rec = await loadPage(env, t.url);
  let error = null;
  const stale = !rec || Date.now() - Date.parse(rec.at) > TTL_MS;
  if (stale && (await canScan())) {
    try { rec = await savePage(env, t.url, await scanLimited(t.url)); } catch (e) { error = `Could not reach the server: ${String(e.message || e).slice(0, 160)}`; }
  }
  if (!rec) return html(render(env, canonical, t.url, null, error || 'The free scan limit is reached for now. Refresh in a few minutes.'), 200);
  return html(render(env, canonical, t.url, rec), 200, 'public, max-age=3600');
}

function html(body, status, cache = 'no-store') {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache } });
}
function notFound(msg) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found | MCP Readiness</title><meta name="robots" content="noindex"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>${PAGE_CSS}</style></head><body><div class="wrap">${PAGE_NAV}<main><h1>Not found</h1><p>${esc(msg)}</p><p><a class="btn" href="/">Scan a public URL free</a></p></main>${PAGE_FOOT}</div></body></html>`; }

export function render(env, canonical, url, r, error) {
  const origin = new URL(canonical).origin;
  const name = r?.server || new URL(url).host;
  const day = r?.at?.slice(0, 10);
  const title = r ? `${name} MCP server readiness: ${r.score}/100 | MCP Readiness` : `${name} MCP server readiness | MCP Readiness`;
  const desc = !r ? `Live MCP readiness scan of ${url}.`
    : r.authRequired ? `${name} (${url}) requires login. Live check of OAuth discovery, Origin/CORS and JSON-RPC: score ${r.score}/100, scanned ${day}.`
    : `${name} (${url}): ${r.toolCount} tools, about ${(r.contextTokens || 0).toLocaleString('en-US')} tokens per agent turn, readiness ${r.score}/100. Live scan ${day}: OAuth, annotations, Origin/CORS, schemas.`;
  const col = !r ? '#94a3b8' : r.score >= 90 ? '#22c55e' : r.score >= 70 ? '#eab308' : '#ef4444';
  const badgeMd = `[![MCP readiness](${origin}/badge.svg?url=${encodeURIComponent(url)})](${canonical})`;
  const ld = r && { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url: canonical, dateModified: r.at, about: { '@type': 'SoftwareApplication', name, applicationCategory: 'DeveloperApplication', url } };
  const issues = r ? (r.top || []).map((f) => `<li><b class="${esc(f.level)}">${esc(f.level)}</b> ${esc(f.title)}</li>`).join('') || '<li>No issues found in the free checks.</li>' : '';
  const timeLabel = r ? `${r.at.replace('T', ' ').slice(0, 16)} UTC` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(canonical)}">${r ? '' : '\n<meta name="robots" content="noindex">'}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${PAGE_CSS}.score{font-size:56px;font-weight:800;line-height:1;color:${col}}</style></head>
<body><div class="wrap">${PAGE_NAV}<main>
<h1>Is ${esc(name)} ready for real agents?</h1>
<p class="small">Endpoint: <code>${esc(url)}</code>${r ? ` · last scanned ${esc(timeLabel)}` : ''}</p>
${r ? `<div class="card"><div style="display:flex;gap:20px;align-items:center"><div class="score">${esc(r.score)}</div><div style="min-width:0"><b style="overflow-wrap:anywhere">${esc(name)}</b><div class="small">${r.authRequired ? 'Login required: OAuth discovery checked' : `${esc(r.toolCount)} tools · ~${(r.contextTokens || 0).toLocaleString('en-US')} tokens per agent turn`}</div></div></div>
<h2>Top issues</h2><ul class="issues">${issues}</ul>
${r.locked ? `<p class="small">${esc(r.locked)} more issue(s) and every fix will be in the full report.</p>` : ''}
${r.fix ? `<p class="small">Heavy tool list: ${esc(r.fix.why)}. Pro (coming soon) writes a slimmer drop-in tools.json with ToolSlim.</p>` : ''}
<p class="small"><b>Full report: coming soon.</b> Every finding with its fix, a ToolSlim slim tools.json, a hosted report, scans behind a test token, and monitoring. Payment will never change the score.</p></div>` : `<div class="card"><p>${esc(error || 'Not scanned yet.')}</p></div>`}
<div class="card"><h2>Own this server? Add the badge</h2>
<div class="badgebox"><img src="${esc(`${origin}/badge.svg?url=${encodeURIComponent(url)}`)}" alt="MCP readiness badge" height="20"></div>
<div class="codebox"><pre id="badge-md">${esc(badgeMd)}</pre><button type="button" class="ghost sm copy" data-copy="badge-md" data-event="badge_copied">Copy badge</button></div>
<h3 style="margin-top:18px">Gate every PR with the free GitHub Action</h3>
<div class="codebox"><pre id="yaml">- uses: Om3rr/mcp-readiness-check@v1
  with:
    url: http://127.0.0.1:8787/mcp
    fail-under: 80
    max-context-tokens: 8000</pre><button type="button" class="ghost sm copy" data-copy="yaml" data-event="action_install_click">Copy</button></div>
<div class="actions"><a class="btn" data-event="action_install_click" href="https://github.com/Om3rr/mcp-readiness-check?utm_source=mcp-readiness&amp;utm_medium=server-page&amp;utm_campaign=action#readme">Add the GitHub Action</a><a class="btn ghost" href="/">Scan another server</a></div></div>
<p class="small">Automated surface checks of what any MCP client sees before login: initialize, tools/list, an unknown method, a foreign Origin, a CORS preflight and OAuth discovery. No tool is called. A triage signal, not a security audit.</p>
</main>${PAGE_FOOT}</div><script src="/t.js" defer></script></body></html>`;
}

export async function sitemap(env, origin) {
  const urls = [`${origin}/`, `${origin}/mcp-servers/`, `${origin}/state-of-mcp-2026-11.html`];
  let cursor;
  do {
    const l = await env.LICENSES.list({ prefix: 'page:', cursor, limit: 1000 });
    for (const k of l.keys) urls.push(origin + pagePath(k.name.slice(5)));
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor && urls.length < 45000);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
}
