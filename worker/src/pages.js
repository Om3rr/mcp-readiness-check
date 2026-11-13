// Indexable per-server pages: /s/<host>/<path> <-> https://<host>/<path>.
// Server-rendered HTML with a stable URL, title, meta description, canonical and JSON-LD.
// README badges link here. No sign-up: a visit runs a free scan when the cached one is missing or older than 24 h.
import { checkTarget } from './guard.js';

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
function notFound(msg) { return `<!doctype html><meta charset="utf-8"><title>Not found | MCP Readiness</title><meta name="robots" content="noindex"><p>${esc(msg)}</p><p><a href="/">Scan a public URL free</a></p>`; }

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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(canonical)}">${r ? '' : '\n<meta name="robots" content="noindex">'}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>body{font:16px/1.55 system-ui,sans-serif;background:#0b1020;color:#e5e7eb;margin:0}main{max-width:820px;margin:0 auto;padding:32px 20px}a{color:#93c5fd}h1{font-size:32px;line-height:1.15}.card{background:#111a33;border:1px solid #23305a;border-radius:14px;padding:20px;margin:16px 0}.score{font-size:56px;font-weight:800;color:${col}}.small{color:#94a3b8;font-size:14px}code,pre{background:#0e1530;border-radius:8px;padding:2px 6px;font-size:13px}pre{padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}.fail{color:#ef4444}.warn{color:#eab308}.info{color:#94a3b8}.btn{display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
<body><main><nav class="small"><a href="/">MCP Readiness</a> · <a href="/#pricing">Pricing</a> · <a href="/state-of-mcp-2026-11.html">State of MCP report</a></nav>
<h1>Is ${esc(name)} ready for real agents?</h1>
<p class="small">Endpoint: <code>${esc(url)}</code>${r ? ` · last scanned ${esc(r.at.replace('T', ' ').slice(0, 16))} UTC` : ''}</p>
${r ? `<div class="card"><div style="display:flex;gap:20px;align-items:center"><div class="score">${r.score}</div><div><b>${esc(name)}</b><div class="small">${r.authRequired ? 'Login required: OAuth discovery checked' : `${r.toolCount} tools · ~${(r.contextTokens || 0).toLocaleString('en-US')} tokens per agent turn`}</div></div></div>
<h2>Top issues</h2><ul>${issues}</ul>
${r.locked ? `<p>${r.locked} more issue(s) and every fix are in the full report.</p>` : ''}
${r.fix ? `<p class="small">Heavy tool list: ${esc(r.fix.why)}. Pro writes a slimmer drop-in tools.json with <a href="${esc(r.fix.url)}">ToolSlim</a>. The lossless step is free: <code>${esc(r.fix.command)}</code></p>` : ''}
<p class="small"><b>Full report: coming soon.</b> Every finding with its fix, a ToolSlim slim tools.json, a hosted report, scans behind a test token, and monitoring. Payment will never change the score.</p></div>` : `<div class="card"><p>${esc(error || 'Not scanned yet.')}</p></div>`}
<div class="card"><h2>Own this server? Add the badge</h2><pre>${esc(badgeMd)}</pre>
<h3>Gate every PR with the free GitHub Action</h3><pre>- uses: Om3rr/mcp-readiness-check@v1
  with:
    url: http://127.0.0.1:8787/mcp
    fail-under: 80
    max-context-tokens: 8000</pre></div>
<p class="small">Automated surface checks of what any MCP client sees before login: initialize, tools/list, an unknown method, a foreign Origin, a CORS preflight and OAuth discovery. No tool is called. A triage signal, not a security audit. <a href="/">Scan another server</a></p>
</main></body></html>`;
}

export async function sitemap(env, origin) {
  const urls = [`${origin}/`, `${origin}/state-of-mcp-2026-11.html`];
  let cursor;
  do {
    const l = await env.LICENSES.list({ prefix: 'page:', cursor, limit: 1000 });
    for (const k of l.keys) urls.push(origin + pagePath(k.name.slice(5)));
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor && urls.length < 45000);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
}
