import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { bucketRoute, isBot, visitorHash, handleEvent, handleWaitlist, isOutsideScan } from '../worker/src/metrics.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const call = (env, path, init = {}) => worker.fetch(new Request(`https://w.test${path}`, init), env, { waitUntil() {} });

test('metrics: /stats and /stats.html are public and empty without D1', async () => {
  const env = { LICENSES: kv() };
  const json = await (await call(env, '/stats')).json();
  assert.equal(json.ok, true);
  assert.equal(json.worker, 'mcp-readiness');
  assert.equal(json.totals.requests, 0);
  assert.equal(json.totals.waitlist_signups, 0);
  assert.equal(json.totals.outside_scans, 0);
  assert.equal(JSON.stringify(json).includes('@'), false);
  const html = await call(env, '/stats.html');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /MCP Readiness/);
});

test('metrics: /api/event rejects unknown names', async () => {
  const env = { LICENSES: kv() };
  const r = await call(env, '/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'nope' }) });
  assert.equal(r.status, 400);
});

test('metrics: visitor hash and outside-scan filter hide raw IPs and test targets', async () => {
  const h = await visitorHash('salt', '203.0.113.9', 'Mozilla/5.0');
  assert.equal(h.length, 64);
  assert.doesNotMatch(h, /203\.0\.113\.9/);
  assert.equal(await isOutsideScan(new Request('https://w.test/', { headers: { 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': '203.0.113.9' } }), 'https://mcp.context7.com/mcp'), false);
  assert.equal(await isOutsideScan(new Request('https://w.test/', { headers: { 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': '203.0.113.9', referer: 'https://news.ycombinator.com/' } }), 'https://mcp.athena.example/mcp'), true);
});

test('metrics: /api/health is unchanged', async () => {
  const env = { LICENSES: kv() };
  const r = await (await call(env, '/api/health')).json();
  assert.equal(r.ok, true);
});

test('metrics: /api/event accepts price_click', async () => {
  const env = { LICENSES: kv() };
  const r = await call(env, '/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({ event: 'price_click', props: { tier: 'pro' }, ref: 'utm:twitter/social/launch' }),
  });
  assert.ok([200, 202, 204].includes(r.status));
  const bad = await call(env, '/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'price_click_unknown' }) });
  assert.equal(bad.status, 400);
});
