import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { bucketRoute, isBot, visitorHash, handleEvent, handleWaitlist, isOutsideScan, isBoxIpv6, ipv6InPrefix, parseIpv6Hextets, scanLogPayload, parseUtm, fillUnattributedSources } from '../worker/src/metrics.js';

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
  assert.equal(json.totals.page_refresh, 0);
  assert.equal(json.totals.badge_refresh, 0);
  assert.ok('outside_scan_sources' in json.totals);
  assert.equal(json.totals.outside_scan_sources.api, 0);
  assert.equal(json.totals.outside_scan_sources.mcp, 0);
  assert.ok('mcp_requests' in json.totals);
  assert.ok('api_scan_requests' in json.totals);
  assert.ok(Array.isArray(json.totals.landing_views_by_utm));
  assert.ok(Array.isArray(json.totals.outside_scans_by_utm));
  assert.ok(Array.isArray(json.top_landing_referrers));
  assert.ok(Array.isArray(json.top_scan_referrers));
  assert.equal(JSON.stringify(json).includes('@'), false);
  const html = await call(env, '/stats.html');
  assert.equal(html.status, 200);
  const body = await html.text();
  assert.match(body, /MCP Readiness/);
  assert.match(body, /Page refreshes/);
  assert.match(body, /Badge refreshes/);
  assert.match(body, /Outside scans/);
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

test('metrics: box IPv6 /64 is excluded from outside scans', async () => {
  assert.deepEqual(parseIpv6Hextets('2a09:bac5:3a98:166e::1'), [0x2a09, 0xbac5, 0x3a98, 0x166e, 0, 0, 0, 1]);
  assert.equal(isBoxIpv6('2a09:bac5:3a98:166e::1'), true);
  assert.equal(isBoxIpv6('2A09:BAC5:3A98:166E:0:0:0:ffff'), true);
  assert.equal(isBoxIpv6('[2a09:bac5:3a98:166e::]'), true);
  assert.equal(ipv6InPrefix('2a09:bac5:3a98:166f::1', '2a09:bac5:3a98:166e::', 64), false);
  assert.equal(isBoxIpv6('2a09:bac5:3a98:166f::1'), false);
  assert.equal(isBoxIpv6('203.0.113.9'), false);
  const headers = { 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': '2a09:bac5:3a98:166e::8', referer: 'https://news.ycombinator.com/' };
  assert.equal(await isOutsideScan(new Request('https://w.test/', { headers }), 'https://mcp.athena.example/mcp'), false);
  assert.equal(await isOutsideScan(new Request('https://w.test/', { headers: { ...headers, 'cf-connecting-ip': '2a09:bac5:3a98:166f::8' } }), 'https://mcp.athena.example/mcp'), true);
});

test('metrics: scan log payload is host, UA class and ASN only', () => {
  const req = new Request('https://w.test/', {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'cf-connecting-ip': '203.0.113.9' },
  });
  req.cf = { asn: 13335, colo: 'TLV' };
  const payload = scanLogPayload(req, 'https://mcp.athena.example/mcp');
  assert.deepEqual(Object.keys(payload).sort(), ['asn', 'target_host', 'ua_class']);
  assert.equal(payload.target_host, 'mcp.athena.example');
  assert.equal(payload.ua_class, 'bot');
  assert.equal(payload.asn, 13335);
  const raw = JSON.stringify(payload);
  assert.doesNotMatch(raw, /203\.0\.113\.9/);
  assert.doesNotMatch(raw, /Googlebot/i);
  assert.doesNotMatch(raw, /Mozilla/);
});

test('metrics: parseUtm and unattributed source gap', () => {
  assert.deepEqual(parseUtm({ utm_source: 'glama', utm_medium: 'directory', utm_campaign: 'mcp-readiness-14d' }), { utm_source: 'glama', utm_medium: 'directory', utm_campaign: 'mcp-readiness-14d' });
  assert.deepEqual(parseUtm({ ref: 'utm:pulsemcp/directory/mcp-readiness-14d' }), { utm_source: 'pulsemcp', utm_medium: 'directory', utm_campaign: 'mcp-readiness-14d' });
  assert.equal(parseUtm({ utm_medium: 'directory' }), null);
  const filled = fillUnattributedSources(5, { api: 1, mcp: 1 });
  assert.equal(filled.api, 1);
  assert.equal(filled.mcp, 1);
  assert.equal(filled.unattributed, 3);
});
