// MCP Readiness: hosted scan API + landing page (Cloudflare Worker).
// Free: score + top 3 issues (rate-limited). Paid (license key): full JSON/HTML/PDF report, CI usage.
import { probeHttp } from '../../src/probe.js';
import { toHtml } from '../../src/html.js';
import { checkTarget } from './guard.js';
import { consume, getLicense, PLANS } from './license.js';
import { handleStripe, handleLemon } from './webhooks.js';
import { badge } from './badge.js';

const VERSION = '0.3.0';
const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra } });
const bearer = (req, url) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';

async function rateLimit(env, req, bucket, limit) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const k = `rl:${bucket}:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const n = Number((await env.LICENSES.get(k)) || 0);
  if (n >= limit) return false;
  await env.LICENSES.put(k, String(n + 1), { expirationTtl: 3700 });
  return true;
}

async function scan(env, target, opts = {}) {
  const r = await probeHttp(target, { timeoutMs: Number(env.SCAN_TIMEOUT_MS || 12000), token: opts.token });
  r.findings.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return r;
}

export function limited(r, env) {
  const issues = r.findings.filter((f) => f.level === 'fail' || f.level === 'warn');
  const counts = Object.fromEntries(['fail', 'warn', 'info', 'pass'].map((k) => [k, r.findings.filter((f) => f.level === k).length]));
  return {
    score: r.score, server: r.server?.name || null, toolCount: r.toolCount, contextTokens: r.contextTokens ?? null, authRequired: Boolean(r.authRequired), counts,
    top: issues.slice(0, 3).map(({ level, id, title }) => ({ level, id, title })),
    locked: Math.max(0, issues.length - 3),
    upgrade: { fixes: 'Full report includes every finding with its fix, PDF export and CI use.', pricing: `${env.PUBLIC_URL || ''}/#pricing` },
  };
}

async function pdfFromHtml(env, html) {
  if (!env.CF_ACCOUNT_ID || !env.CF_BROWSER_TOKEN) return null;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`, {
    method: 'POST', headers: { authorization: `Bearer ${env.CF_BROWSER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ html, pdfOptions: { format: 'a4', printBackground: true } }),
  });
  return r.ok ? r : null;
}

function thanksPage(key, env) {
  const body = key
    ? `<h1>You're in.</h1><p>Your license key (shown once, so copy it now):</p><pre id="k">${key}</pre>
<p>Use it in the web app, the API (<code>Authorization: Bearer …</code>) or the GitHub Action (<code>api-key: \${{ secrets.MCP_READINESS_KEY }}</code>).</p>`
    : `<h1>Payment received</h1><p>Your key is being issued. Refresh in a few seconds. If it has been more than an hour, reply to your receipt email.</p>`;
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Thanks | MCP Readiness</title><style>body{font:16px/1.5 system-ui;max-width:640px;margin:60px auto;padding:0 20px}pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto}</style>${body}<p><a href="/">Back to MCP Readiness</a></p>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

const MCP_TOOLS = [{
  name: 'scan_mcp', title: 'Scan an MCP server',
  description: 'Live readiness + context-cost scan of a public Streamable HTTP MCP server. Returns score, every finding with its fix, and the token cost of its tool list. Uses 1 credit.',
  inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'https URL of the MCP endpoint' } }, required: ['url'] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}];
async function mcpEndpoint(req, env, url) {
  const origin = req.headers.get('origin');
  const allowed = String(env.MCP_ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return new Response('Forbidden origin', { status: 403 });
  const msg = await req.json().catch(() => null);
  const reply = (result, error) => new Response(JSON.stringify(error ? { jsonrpc: '2.0', id: msg?.id ?? null, error } : { jsonrpc: '2.0', id: msg?.id ?? null, result }), { headers: { 'content-type': 'application/json' } });
  if (!msg || msg.jsonrpc !== '2.0') return reply(null, { code: -32600, message: 'Invalid Request' });
  if (msg.id === undefined) return new Response(null, { status: 202 });
  switch (msg.method) {
    case 'initialize': return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mcp-readiness', version: VERSION }, instructions: 'Call scan_mcp with a public MCP URL. Needs a license key (Authorization: Bearer mrc_live_...).' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: MCP_TOOLS });
    case 'tools/call': {
      if (msg.params?.name !== 'scan_mcp') return reply(null, { code: -32602, message: 'Unknown tool' });
      const t = checkTarget(msg.params?.arguments?.url);
      if (!t.ok) return reply({ isError: true, content: [{ type: 'text', text: `Rejected URL: ${t.error}` }] });
      const c = await consume(env, bearer(req, url));
      if (!c.ok) return reply({ isError: true, content: [{ type: 'text', text: `License problem: ${c.error}. Buy credits at ${env.PUBLIC_URL || ''}/#pricing` }] });
      const r = await scan(env, t.url);
      return reply({ content: [{ type: 'text', text: JSON.stringify({ url: t.url, ...r, remaining: c.lic.remaining }) }], structuredContent: { url: t.url, score: r.score, contextTokens: r.contextTokens, findings: r.findings } });
    }
    default: return reply(null, { code: -32601, message: 'Method not found' });
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' } });
      if (p === '/api/health') return json({ ok: true, version: VERSION, payments: { stripe: Boolean(env.STRIPE_WEBHOOK_SECRET), lemonsqueezy: Boolean(env.LEMON_WEBHOOK_SECRET) }, pdf: Boolean(env.CF_BROWSER_TOKEN) });
      if (p === '/api/pricing') return json({ plans: PLANS, checkout: Object.fromEntries(['org', 'indie', 'team', 'pack', 'credits'].map((k) => [k, env[`CHECKOUT_URL_${k.toUpperCase()}`] || null])) });

      if (p === '/api/scan' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const t = checkTarget(body.url);
        if (!t.ok) return json({ error: t.error }, 400);
        const key = bearer(req, url);
        if (key) {
          const c = await consume(env, key);
          if (!c.ok) return json({ error: c.error }, c.error === 'invalid_license' ? 401 : 402);
          const r = await scan(env, t.url, { token: body.token });
          return json({ ...r, url: t.url, plan: c.lic.plan, remaining: c.lic.remaining });
        }
        if (body.token) return json({ error: 'token_scans_need_a_license' }, 402);
        if (!(await rateLimit(env, req, 'scan', Number(env.FREE_SCANS_PER_HOUR || 10)))) return json({ error: 'rate_limited', detail: 'Free scans are limited per hour. A license removes the limit.' }, 429);
        const r = await scan(env, t.url);
        return json({ url: t.url, ...limited(r, env) });
      }

      if (p === '/api/report') {
        const t = checkTarget(url.searchParams.get('url'));
        if (!t.ok) return json({ error: t.error }, 400);
        const c = await consume(env, bearer(req, url));
        if (!c.ok) return json({ error: c.error, pricing: '/#pricing' }, c.error === 'invalid_license' ? 401 : 402);
        const html = toHtml(await scan(env, t.url), t.url);
        if (url.searchParams.get('format') === 'pdf') {
          const pdf = await pdfFromHtml(env, html);
          if (pdf) return new Response(pdf.body, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="mcp-readiness-report.pdf"' } });
        }
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }

      // GitHub Action metering. Free: FREE_ACTION_RUNS_PER_DAY per repo (full local scan, top-3 summary).
      // With a license: one unit per run, full summary + report + SARIF.
      if (p === '/api/ci/run' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const key = bearer(req, url);
        if (key) {
          const c = await consume(env, key);
          if (!c.ok) return json({ mode: 'free', error: c.error }, 200);
          return json({ mode: 'full', plan: c.lic.plan, remaining: c.lic.remaining });
        }
        const repo = String(body.repo || 'unknown').slice(0, 140);
        const k = `ci:${repo}:${new Date().toISOString().slice(0, 10)}`;
        const n = Number((await env.LICENSES.get(k)) || 0);
        const cap = Number(env.FREE_ACTION_RUNS_PER_DAY || 50);
        if (n >= cap) return json({ mode: 'capped', cap, detail: 'Free daily cap reached for this repo. Score still reported; findings hidden until tomorrow or with an Org key.' });
        await env.LICENSES.put(k, String(n + 1), { expirationTtl: 60 * 60 * 26 });
        return json({ mode: 'free', remaining: cap - n - 1, cap });
      }

      // Remote MCP server exposing one paid tool, scan_mcp (pay-per-scan credits via license key).
      if (p === '/mcp' && req.method === 'POST') return mcpEndpoint(req, env, url);

      if (p === '/api/license') {
        const lic = await getLicense(env, bearer(req, url));
        if (!lic) return json({ error: 'invalid_license' }, 401);
        return json({ plan: lic.plan, status: lic.status, remaining: lic.remaining, quota: lic.quota, period: lic.period });
      }

      if (p === '/badge.svg' || p === '/badge') {
        const t = checkTarget(url.searchParams.get('url'));
        const cache = caches.default;
        const ck = new Request(`https://badge.cache/${encodeURIComponent(t.url || 'invalid')}`);
        const hit = await cache.match(ck);
        if (hit) return hit;
        let score = null;
        if (t.ok && (await rateLimit(env, req, 'badge', Number(env.BADGE_MISSES_PER_HOUR || 30)))) { try { score = (await scan(env, t.url)).score; } catch {} }
        const res = new Response(badge(score), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=21600' } });
        ctx?.waitUntil?.(cache.put(ck, res.clone()));
        return res;
      }

      if (p === '/api/subscribe' && req.method === 'POST') {
        const { email } = await req.json().catch(() => ({}));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) return json({ error: 'invalid_email' }, 400);
        if (!(await rateLimit(env, req, 'sub', 5))) return json({ error: 'rate_limited' }, 429);
        await env.LICENSES.put(`lead:${email.toLowerCase()}`, JSON.stringify({ at: new Date().toISOString(), source: 'state-of-mcp-2026-11' }));
        return json({ ok: true, report: '/state-of-mcp-2026-11.html' });
      }

      if (p === '/webhooks/stripe' && req.method === 'POST') return handleStripe(req, env);
      if (p === '/webhooks/lemonsqueezy' && req.method === 'POST') return handleLemon(req, env);
      if (p === '/thanks') {
        const sid = url.searchParams.get('session_id') || (url.searchParams.get('ls_order') ? `ls_${url.searchParams.get('ls_order')}` : '');
        const key = sid ? await env.LICENSES.get(`claim:${sid}`) : null;
        if (key) await env.LICENSES.delete(`claim:${sid}`);
        return thanksPage(key, env);
      }
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'scan_failed', detail: String(e?.message || e).slice(0, 200) }, 502);
    }
  },
};
