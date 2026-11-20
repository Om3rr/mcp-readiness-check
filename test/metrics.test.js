import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { bucketRoute, isBot, visitorHash } from '../worker/src/metrics.js';

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const call = (env, path, init = {}) => worker.fetch(new Request(`https://w.test${path}`, init), env, { waitUntil() {} });

test('metrics: buckets and bot filter', () => {
  assert.equal(bucketRoute('/badge.svg'), '/badge');
  assert.equal(isBot(new Request('https://w.test/', { headers: { 'user-agent': 'Googlebot/2.1' } })), true);
});

test('metrics: visitor hash does not contain the raw IP', async () => {
  const h = await visitorHash('salt', '203.0.113.9', 'Mozilla/5.0');
  assert.equal(h.length, 64);
  assert.doesNotMatch(h, /203\.0\.113\.9/);
});

test('metrics: /stats and /stats.html are public and empty without D1', async () => {
  const env = { LICENSES: kv() };
  const json = await (await call(env, '/stats')).json();
  assert.equal(json.ok, true);
  assert.equal(json.worker, 'mcp-readiness');
  assert.equal(json.totals.requests, 0);
  assert.equal(JSON.stringify(json).includes('203.0.113'), false);
  const html = await call(env, '/stats.html');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /MCP Readiness/);
});

test('metrics: /api/health is unchanged and not required for stats', async () => {
  const env = { LICENSES: kv() };
  const r = await (await call(env, '/api/health')).json();
  assert.equal(r.ok, true);
});
