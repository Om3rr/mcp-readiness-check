// Monitoring for API plans: re-scan registered servers on a cron and POST drift to a webhook.
// KV: mon:<licenseHash> = [{ url, webhook, last: { score, contextTokens, ids[] }, at }]
import { checkTarget } from './guard.js';
import { getLicense } from './license.js';

const LIMIT = { indie: 3, team: 25, org: 5 };
const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json' } });

export async function registerMonitor(req, env, key) {
  const lic = await getLicense(env, key);
  if (!lic || lic.status !== 'active') return json({ error: 'invalid_license' }, 401);
  const max = LIMIT[lic.plan] || 0;
  if (!max) return json({ error: 'plan_has_no_monitoring' }, 402);
  const body = await req.json().catch(() => ({}));
  const t = checkTarget(body.url);
  if (!t.ok) return json({ error: t.error }, 400);
  const hook = body.webhook ? checkTarget(body.webhook) : { ok: true, url: null };
  if (!hook.ok) return json({ error: `webhook_${hook.error}` }, 400);
  const k = `mon:${lic.hash}`;
  const list = JSON.parse((await env.LICENSES.get(k)) || '[]').filter((m) => m.url !== t.url);
  if (body.remove) { await env.LICENSES.put(k, JSON.stringify(list)); return json({ ok: true, monitors: list.length }); }
  if (list.length >= max) return json({ error: 'monitor_limit', max }, 402);
  list.push({ url: t.url, webhook: hook.url, last: null, at: null });
  await env.LICENSES.put(k, JSON.stringify(list));
  await env.LICENSES.put(`monidx:${lic.hash}`, '1');
  return json({ ok: true, monitors: list.length, max });
}

export function drift(prev, r) {
  if (!prev) return null;
  const ids = r.findings.filter((f) => f.level === 'fail' || f.level === 'warn').map((f) => `${f.id}:${f.title}`);
  const added = ids.filter((x) => !prev.ids.includes(x));
  const fixed = prev.ids.filter((x) => !ids.includes(x));
  const ctxDelta = (r.contextTokens ?? 0) - (prev.contextTokens ?? 0);
  if (r.score === prev.score && !added.length && !fixed.length && Math.abs(ctxDelta) < 500) return null;
  return { scoreFrom: prev.score, scoreTo: r.score, added, fixed, contextTokensDelta: ctxDelta };
}

export async function runMonitors(env, scan, fetchImpl = fetch) {
  let cursor; let checked = 0, alerts = 0;
  do {
    const page = await env.LICENSES.list({ prefix: 'monidx:', cursor });
    for (const { name } of page.keys) {
      const hash = name.slice('monidx:'.length);
      const k = `mon:${hash}`;
      const list = JSON.parse((await env.LICENSES.get(k)) || '[]');
      for (const m of list) {
        let r; try { r = await scan(env, m.url); } catch (e) { r = { score: 0, contextTokens: null, findings: [{ level: 'fail', id: 'monitor.unreachable', title: String(e.message).slice(0, 120) }] }; }
        checked++;
        const d = drift(m.last, r);
        if (d && m.webhook) { alerts++; await fetchImpl(m.webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'mcp_readiness.drift', url: m.url, ...d, at: new Date().toISOString() }) }).catch(() => {}); }
        m.last = { score: r.score, contextTokens: r.contextTokens ?? null, ids: r.findings.filter((f) => f.level === 'fail' || f.level === 'warn').map((f) => `${f.id}:${f.title}`) };
        m.at = new Date().toISOString();
      }
      await env.LICENSES.put(k, JSON.stringify(list));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return { checked, alerts };
}
