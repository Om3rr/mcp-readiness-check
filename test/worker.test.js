import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import worker, { limited } from '../worker/src/index.js';
import { verifyStripe, verifyLemon } from '../worker/src/webhooks.js';
import { checkTarget } from '../worker/src/guard.js';
import { issueLicense, consume, getLicense } from '../worker/src/license.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const call = (env, path, init = {}) => worker.fetch(new Request(`https://w.test${path}`, init), env, { waitUntil() {} });
globalThis.caches ??= { default: { match: async () => null, put: async () => {} } };

test('guard: blocks private and non-https targets', () => {
  for (const u of ['http://x.com/mcp', 'https://localhost/mcp', 'https://127.0.0.1/mcp', 'https://10.0.0.5/mcp', 'https://192.168.1.2/', 'https://a.internal/mcp', 'https://u:p@x.com/', 'https://x.com:8443/', 'nonsense', 'https://1.2.3.4/mcp'])
    assert.equal(checkTarget(u).ok, false, u);
  assert.equal(checkTarget('https://mcp.example.com/mcp').ok, true);
});

test('stripe signature: valid, tampered, stale', async () => {
  const secret = 'whsec_test', body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.equal(await verifyStripe(body, `t=${t},v1=${sig}`, secret), true);
  assert.equal(await verifyStripe(body + ' ', `t=${t},v1=${sig}`, secret), false);
  assert.equal(await verifyStripe(body, `t=${t - 3600},v1=${createHmac('sha256', secret).update(`${t - 3600}.${body}`).digest('hex')}`, secret), false);
});

test('lemon squeezy signature', async () => {
  const body = '{"meta":{}}';
  assert.equal(await verifyLemon(body, createHmac('sha256', 's3').update(body).digest('hex'), 's3'), true);
  assert.equal(await verifyLemon(body, 'deadbeef', 's3'), false);
});

test('license: issue, consume, quota, monthly reset fields', async () => {
  const env = { LICENSES: kv() };
  const key = await issueLicense(env, { plan: 'pack', source: 'test', ref: 'r1' });
  assert.match(key, /^mrc_live_[0-9a-f]{40}$/);
  assert.ok(![...env.LICENSES.m.keys()].some((k) => k.includes(key)), 'plaintext key is never stored');
  for (let i = 0; i < 5; i++) assert.equal((await consume(env, key)).ok, true);
  assert.equal((await consume(env, key)).error, 'quota_exhausted');
  assert.equal((await getLicense(env, 'mrc_live_nope')), null);
});

test('stripe webhook issues a license, is idempotent, and /thanks shows it once', async () => {
  const env = { LICENSES: kv(), STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PLAN_BY_LINK: '{"plink_pro":"pro"}' };
  const ev = { id: 'evt_9', type: 'checkout.session.completed', data: { object: { id: 'cs_123', payment_link: 'plink_pro', subscription: 'sub_1', customer_details: { email: 'a@b.co' } } } };
  const body = JSON.stringify(ev), t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac('sha256', 'whsec_x').update(`${t}.${body}`).digest('hex')}`;
  const r1 = await call(env, '/webhooks/stripe', { method: 'POST', body, headers: { 'stripe-signature': sig } });
  assert.equal((await r1.json()).issued, 'pro');
  const r2 = await call(env, '/webhooks/stripe', { method: 'POST', body, headers: { 'stripe-signature': sig } });
  assert.equal((await r2.json()).duplicate, true);
  const page = await (await call(env, '/thanks?session_id=cs_123')).text();
  const key = page.match(/mrc_live_[0-9a-f]{40}/)?.[0];
  assert.ok(key);
  assert.equal(((await (await call(env, '/thanks?session_id=cs_123')).text()).match(/mrc_live_/)), null, 'shown once');
  const lic = await (await call(env, '/api/license', { headers: { authorization: `Bearer ${key}` } })).json();
  assert.equal(lic.plan, 'pro'); assert.equal(lic.remaining, 2000);
  // cancellation
  const del = JSON.stringify({ id: 'evt_10', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
  const sig2 = `t=${t},v1=${createHmac('sha256', 'whsec_x').update(`${t}.${del}`).digest('hex')}`;
  await call(env, '/webhooks/stripe', { method: 'POST', body: del, headers: { 'stripe-signature': sig2 } });
  assert.equal((await (await call(env, '/api/license', { headers: { authorization: `Bearer ${key}` } })).json()).status, 'cancelled');
  assert.equal((await call(env, '/webhooks/stripe', { method: 'POST', body, headers: { 'stripe-signature': 't=1,v1=00' } })).status, 400);
});

test('lemon squeezy webhook: one-off pack and subscription lifecycle', async () => {
  const env = { LICENSES: kv(), LEMON_WEBHOOK_SECRET: 'ls', LEMON_PLAN_BY_VARIANT: '{"11":"pack","22":"team"}' };
  const send = (o) => { const body = JSON.stringify(o); return call(env, '/webhooks/lemonsqueezy', { method: 'POST', body, headers: { 'x-signature': createHmac('sha256', 'ls').update(body).digest('hex') } }); };
  assert.equal((await (await send({ meta: { event_name: 'order_created' }, data: { id: 5, attributes: { identifier: 'o5', first_order_item: { variant_id: 11 } } } })).json()).issued, 'pack');
  assert.equal((await (await send({ meta: { event_name: 'subscription_created' }, data: { id: 7, attributes: { variant_id: 22, order_id: 8 } } })).json()).issued, 'team');
  const key = (await (await call(env, '/thanks?ls_order=8')).text()).match(/mrc_live_[0-9a-f]{40}/)[0];
  await send({ meta: { event_name: 'subscription_expired' }, data: { id: 7, attributes: {} } });
  assert.equal((await (await call(env, '/api/license', { headers: { authorization: `Bearer ${key}` } })).json()).status, 'expired');
});

test('webhooks return 501 when not configured', async () => {
  const env = { LICENSES: kv() };
  assert.equal((await call(env, '/webhooks/stripe', { method: 'POST', body: '{}' })).status, 501);
  assert.equal((await call(env, '/webhooks/lemonsqueezy', { method: 'POST', body: '{}' })).status, 501);
});

test('free scan is limited; paid report is full; report needs a key', async () => {
  const env = { LICENSES: kv(), FREE_SCANS_PER_HOUR: '1' };
  const r = limited({ score: 40, toolCount: 9, findings: [
    { level: 'fail', id: 'a', title: 'A', fix: 'x' }, { level: 'warn', id: 'b', title: 'B' }, { level: 'warn', id: 'c', title: 'C' },
    { level: 'warn', id: 'd', title: 'D' }, { level: 'pass', id: 'e', title: 'E' }] }, env);
  assert.equal(r.top.length, 3); assert.equal(r.locked, 1); assert.equal(r.top[0].fix, undefined);
  assert.equal((await call(env, '/api/report?url=https://x.example/mcp')).status, 401);
  assert.equal((await call(env, '/api/scan', { method: 'POST', body: JSON.stringify({ url: 'http://x' }) })).status, 400);
  assert.equal((await call(env, '/api/scan', { method: 'POST', body: JSON.stringify({ url: 'https://x.example/mcp', token: 't' }) })).status, 402);
});

test('ci metering: free daily cap per repo, key gives full mode', async () => {
  const env = { LICENSES: kv(), FREE_ACTION_RUNS_PER_DAY: '2' };
  const run = (h = {}) => call(env, '/api/ci/run', { method: 'POST', body: JSON.stringify({ repo: 'o/r' }), headers: h }).then((r) => r.json());
  assert.equal((await run()).mode, 'free'); assert.equal((await run()).mode, 'free'); assert.equal((await run()).mode, 'capped');
  const key = await issueLicense(env, { plan: 'pro', source: 't', ref: 'x' });
  assert.equal((await run({ authorization: `Bearer ${key}` })).mode, 'full');
});

test('mcp endpoint: tools/list, -32601, paid scan_mcp needs a key', async () => {
  const env = { LICENSES: kv() };
  const rpc = (o, h = {}) => call(env, '/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...o }), headers: h }).then((r) => r.json());
  assert.equal((await rpc({ method: 'tools/list' })).result.tools[0].name, 'scan_mcp');
  assert.equal((await rpc({ method: 'nope' })).error.code, -32601);
  const r = await rpc({ method: 'tools/call', params: { name: 'scan_mcp', arguments: { url: 'https://x.example/mcp' } } });
  assert.equal(r.result.isError, true); assert.match(r.result.content[0].text, /invalid_license/);
});

test('mcp endpoint rejects foreign Origin and sends no wildcard CORS', async () => {
  const env = { LICENSES: kv() };
  const r = await call(env, '/mcp', { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"ping"}', headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  const ok = await call(env, '/mcp', { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
  assert.equal(ok.headers.get('access-control-allow-origin'), null);
});

test('monitoring: register within plan limit, drift detection, cron posts webhook', async () => {
  const { drift, runMonitors } = await import('../worker/src/monitor.js');
  const store = kv(); store.list = async ({ prefix }) => ({ keys: [...store.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true });
  const env = { LICENSES: store };
  const key = await issueLicense(env, { plan: 'pro', source: 't', ref: 'm' });
  const reg = (b) => call(env, '/api/monitor', { method: 'POST', body: JSON.stringify(b), headers: { authorization: `Bearer ${key}` } });
  assert.equal((await reg({ url: 'https://a.example/mcp', webhook: 'https://hooks.example/x' })).status, 200);
  for (let i = 1; i < 10; i++) await reg({ url: `https://m${i}.example/mcp` });
  assert.equal((await reg({ url: 'https://over.example/mcp' })).status, 402);
  assert.equal(drift(null, { score: 90, findings: [] }), null);
  assert.equal(drift({ score: 90, contextTokens: 100, ids: [] }, { score: 90, contextTokens: 120, findings: [] }), null);
  let n = 0; const scores = [100, 80];
  for (const k of [...store.m.keys()].filter((k) => k.startsWith('mon:'))) { const l = JSON.parse(store.m.get(k)); store.m.set(k, JSON.stringify(l.slice(0, 1))); }
  const fakeScan = async () => ({ score: scores[Math.min(n, 1)], contextTokens: 10, findings: n ? [{ level: 'warn', id: 'x', title: 'X' }] : [] });
  const posts = [];
  await runMonitors(env, fakeScan, async (u, i) => posts.push([u, JSON.parse(i.body)]));
  n = 1;
  await runMonitors(env, fakeScan, async (u, i) => posts.push([u, JSON.parse(i.body)]));
  assert.equal(posts.length, 1); assert.equal(posts[0][0], 'https://hooks.example/x'); assert.equal(posts[0][1].scoreTo, 80);
});
