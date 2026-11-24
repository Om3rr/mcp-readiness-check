import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { limited } from '../worker/src/index.js';
import { checkTarget, resolvePublicTarget, isPrivateOrMetadataIp } from '../worker/src/guard.js';
import { handleMcp, MCP_TOOLS, MCP_TOOL_NAME, MCP_RATE_PER_MINUTE, rateLimitHashed } from '../worker/src/mcp.js';
import { recordVisit, readStats, isInternalRequest } from '../worker/src/metrics.js';
import { readFileSync } from 'node:fs';

const kv = () => {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
};

function memD1() {
  const tables = new Map();
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  const keyOf = (binds) => binds.map((x) => String(x)).join('\x1f');
  const api = {
    tables,
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      const binds = [];
      const stmt = {
        bind(...args) { binds.push(...args); return stmt; },
        async run() {
          if (/^CREATE TABLE/i.test(s)) return { meta: { changes: 0 } };
          if (/INSERT OR IGNORE INTO daily_salts/.test(s)) {
            const t = table('daily_salts');
            if (!t.has(binds[0])) t.set(binds[0], { day: binds[0], salt: binds[1] });
            return { meta: { changes: t.has(binds[0]) ? 0 : 1 } };
          }
          if (/INSERT OR IGNORE INTO visitor_hashes/.test(s)) {
            const t = table('visitor_hashes');
            const k = keyOf(binds);
            const fresh = !t.has(k);
            if (fresh) t.set(k, binds);
            return { meta: { changes: fresh ? 1 : 0 } };
          }
          const bump = (name, keyBinds, extra) => {
            const t = table(name);
            const k = keyOf(keyBinds);
            const row = t.get(k) || { count: 0, ...extra };
            row.count = (row.count || 0) + 1;
            const { count: _ignore, ...rest } = extra || {};
            Object.assign(row, rest, { count: row.count });
            t.set(k, row);
            return { meta: { changes: 1 } };
          };
          if (/INSERT INTO requests_daily/.test(s)) return bump('requests_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], route: binds[2], count: 0 });
          if (/INSERT INTO uniques_daily/.test(s)) return bump('uniques_daily', binds.slice(0, 2), { worker: binds[0], day: binds[1] });
          if (/INSERT INTO scans_daily/.test(s)) {
            const t = table('scans_daily');
            const k = keyOf(binds.slice(0, 2));
            const existing = t.get(k);
            if (existing) {
              if (/SET success = success \+ 1/.test(s)) existing.success += 1;
              if (/SET fail = fail \+ 1/.test(s)) existing.fail += 1;
              t.set(k, existing);
            } else {
              t.set(k, { worker: binds[0], day: binds[1], success: Number(binds[2] || 0), fail: Number(binds[3] || 0) });
            }
            return { meta: { changes: 1 } };
          }
          if (/INSERT INTO badges_daily/.test(s)) return bump('badges_daily', binds.slice(0, 2), { worker: binds[0], day: binds[1] });
          if (/INSERT INTO page_refresh_daily/.test(s)) return bump('page_refresh_daily', binds.slice(0, 2), { worker: binds[0], day: binds[1] });
          if (/INSERT INTO badge_refresh_daily/.test(s)) return bump('badge_refresh_daily', binds.slice(0, 2), { worker: binds[0], day: binds[1] });
          if (/INSERT INTO referrers_daily/.test(s)) return bump('referrers_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], host: binds[2] });
          if (/INSERT INTO events_daily/.test(s)) return bump('events_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], event: binds[2] });
          if (/INSERT INTO outside_scans_daily/.test(s)) return bump('outside_scans_daily', binds.slice(0, 2), { worker: binds[0], day: binds[1] });
          if (/INSERT INTO outside_scan_sources_daily/.test(s)) return bump('outside_scan_sources_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], source: binds[2] });
          if (/INSERT INTO mcp_requests_by_method_daily/.test(s)) return bump('mcp_requests_by_method_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], method: binds[2] });
          if (/INSERT INTO mcp_requests_by_client_daily/.test(s)) return bump('mcp_requests_by_client_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], client: binds[2] });
          if (/INSERT OR IGNORE INTO outside_scan_seen/.test(s)) {
            const t = table('outside_scan_seen');
            const k = keyOf(binds);
            const fresh = !t.has(k);
            if (fresh) t.set(k, binds);
            return { meta: { changes: fresh ? 1 : 0 } };
          }
          if (/INSERT INTO internal_daily/.test(s)) return bump('internal_daily', binds.slice(0, 2), { worker: binds[0], day: binds[1] });
          if (/INSERT INTO crawlers_daily/.test(s)) return bump('crawlers_daily', binds.slice(0, 3), { worker: binds[0], day: binds[1], crawler: binds[2] });
          if (/INSERT INTO utm_daily/.test(s)) {
            const t = table('utm_daily');
            const k = keyOf(binds.slice(0, 6));
            const row = t.get(k) || { worker: binds[0], day: binds[1], kind: binds[2], utm_source: binds[3], utm_medium: binds[4], utm_campaign: binds[5], count: 0 };
            row.count += 1;
            t.set(k, row);
            return { meta: { changes: 1 } };
          }
          if (/INSERT INTO referrers_by_kind_daily/.test(s)) {
            const t = table('referrers_by_kind_daily');
            const k = keyOf(binds.slice(0, 4));
            const row = t.get(k) || { worker: binds[0], day: binds[1], kind: binds[2], host: binds[3], count: 0 };
            row.count += 1;
            t.set(k, row);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (/SELECT salt FROM daily_salts/.test(s)) {
            const row = table('daily_salts').get(binds[0]);
            return row ? { salt: row.salt } : null;
          }
          if (/SELECT 1 AS ok FROM outside_scan_seen/.test(s)) {
            const t = table('outside_scan_seen');
            return t.has(keyOf(binds)) ? { ok: 1 } : null;
          }
          if (/SELECT COUNT\(\*\) AS count FROM waitlist/.test(s)) return { count: 0 };
          if (/SELECT count FROM internal_daily/.test(s) || /FROM internal_daily/.test(s)) {
            let n = 0;
            for (const row of table('internal_daily').values()) {
              if (row.worker === binds[0] && row.day >= binds[1]) n += row.count;
            }
            return { count: n };
          }
          return null;
        },
        async all() {
          const results = [];
          if (/FROM \(SELECT day, SUM\(count\) AS requests FROM requests_daily/.test(s)) {
            const days = new Map();
            for (const row of table('requests_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              days.set(row.day, (days.get(row.day) || 0) + row.count);
            }
            const find = (tbl, day, field, def = 0) => {
              for (const row of table(tbl).values()) {
                if (row.worker === binds[0] && row.day === day) return Number(row[field] ?? row.count ?? def);
              }
              return def;
            };
            for (const [day, requests] of [...days.entries()].sort()) {
              results.push({
                day,
                requests,
                unique_visitors: find('uniques_daily', day, 'count'),
                scans_success: find('scans_daily', day, 'success'),
                scans_fail: find('scans_daily', day, 'fail'),
                badge_hits: find('badges_daily', day, 'count'),
                outside_scans: find('outside_scans_daily', day, 'count'),
                page_refresh: find('page_refresh_daily', day, 'count'),
                badge_refresh: find('badge_refresh_daily', day, 'count'),
              });
            }
          } else if (/FROM requests_daily/.test(s) && /route IN/.test(s)) {
            for (const row of table('requests_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              if (row.route === '/mcp' || row.route === '/api/scan') results.push({ day: row.day, route: row.route, count: row.count });
            }
          } else if (/FROM requests_daily/.test(s) && /GROUP BY route/.test(s)) {
            const acc = new Map();
            for (const row of table('requests_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              acc.set(row.route, (acc.get(row.route) || 0) + row.count);
            }
            for (const [route, count] of acc) results.push({ route, count });
          } else if (/FROM referrers_daily/.test(s)) {
            const acc = new Map();
            for (const row of table('referrers_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              acc.set(row.host, (acc.get(row.host) || 0) + row.count);
            }
            for (const [host, count] of acc) results.push({ host, count });
          } else if (/FROM events_daily/.test(s)) {
            const acc = new Map();
            for (const row of table('events_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              acc.set(row.event, (acc.get(row.event) || 0) + row.count);
            }
            for (const [event, count] of acc) results.push({ event, count });
          } else if (/FROM mcp_requests_by_method_daily/.test(s)) {
            for (const row of table('mcp_requests_by_method_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              results.push({ day: row.day, method: row.method, count: row.count });
            }
          } else if (/FROM mcp_requests_by_client_daily/.test(s)) {
            for (const row of table('mcp_requests_by_client_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              results.push({ day: row.day, client: row.client, count: row.count });
            }
          } else if (/FROM outside_scan_sources_daily/.test(s) && /GROUP BY day, source/.test(s)) {
            for (const row of table('outside_scan_sources_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              results.push({ day: row.day, source: row.source, count: row.count });
            }
          } else if (/FROM outside_scan_sources_daily/.test(s)) {
            const acc = new Map();
            for (const row of table('outside_scan_sources_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              acc.set(row.source, (acc.get(row.source) || 0) + row.count);
            }
            for (const [source, count] of acc) results.push({ source, count });
          } else if (/FROM crawlers_daily/.test(s)) {
            /* none */
          } else if (/FROM event_props_daily/.test(s)) {
            /* none */
          } else if (/FROM utm_daily/.test(s)) {
            const acc = new Map();
            for (const row of table('utm_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              if (s.includes("kind = 'landing_view'") && row.kind !== 'landing_view') continue;
              if (s.includes("kind = 'outside_scan'") && row.kind !== 'outside_scan') continue;
              const k = [row.kind, row.utm_source, row.utm_medium, row.utm_campaign].join('\x1f');
              const cur = acc.get(k) || { utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, count: 0 };
              cur.count += row.count;
              acc.set(k, cur);
            }
            results.push(...acc.values());
          } else if (/FROM referrers_by_kind_daily/.test(s)) {
            const acc = new Map();
            for (const row of table('referrers_by_kind_daily').values()) {
              if (row.worker !== binds[0] || row.day < binds[1]) continue;
              if (s.includes("kind = 'landing_view'") && row.kind !== 'landing_view') continue;
              if (s.includes("kind = 'outside_scan'") && row.kind !== 'outside_scan') continue;
              acc.set(row.host, (acc.get(row.host) || 0) + row.count);
            }
            for (const [host, count] of acc) results.push({ host, count });
          }
          return { results };
        },
      };
      return stmt;
    },
  };
  return api;
}

const pending = [];
const ctx = () => ({ waitUntil(p) { pending.push(Promise.resolve(p)); } });
const call = (env, path, init = {}, c = ctx()) => worker.fetch(new Request(`https://w.test${path}`, init), env, c);
const rpcBody = (o) => JSON.stringify({ jsonrpc: '2.0', id: 1, ...o });

function mockFetch({ dns = {}, handler }) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === 'cloudflare-dns.com') {
      const name = u.searchParams.get('name');
      const type = u.searchParams.get('type');
      const recs = dns[name] || [];
      const wantV6 = type === 'AAAA';
      const Answer = recs
        .filter((ip) => (wantV6 ? ip.includes(':') : !ip.includes(':')))
        .map((data) => ({ type: wantV6 ? 28 : 1, data }));
      return new Response(JSON.stringify({ Status: 0, Answer }), { headers: { 'content-type': 'application/dns-json' } });
    }
    if (handler) return handler(u, init);
    return new Response('no', { status: 404 });
  };
  return () => { globalThis.fetch = orig; };
}

function mockTargetServer(u, init) {
  const body = JSON.parse(init.body || '{}');
  const headers = { 'content-type': 'application/json' };
  if (body.method === 'initialize') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id: body.id,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'demo', version: '1' }, instructions: 'ok' },
    }), { headers });
  }
  if (body.method === 'notifications/initialized') return new Response(null, { status: 202, headers });
  if (body.method === 'tools/list') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id: body.id,
      result: { tools: [{ name: 'get_status', title: 'Status', description: 'Read-only status check for the service.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } }] },
    }), { headers });
  }
  if (body.method === 'no/such_method') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }), { headers });
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unknown tool' } }), { headers });
}

test('mcp handshake: initialize and protocol version', async () => {
  const env = { LICENSES: kv(), PUBLIC_URL: 'https://mcp.pacerai.fit' };
  const r = await (await call(env, '/mcp', { method: 'POST', body: rpcBody({ method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) })).json();
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.equal(r.result.serverInfo.name, 'mcp-readiness');
  assert.ok(r.result.capabilities.tools);
  assert.match(r.result.instructions, /scan_mcp_server/);
  assert.doesNotMatch(r.result.instructions, /needs a license|buy credits/i);
});

test('mcp tools/list schema is scan_mcp_server({url})', async () => {
  const env = { LICENSES: kv() };
  const r = await (await call(env, '/mcp', { method: 'POST', body: rpcBody({ method: 'tools/list' }) })).json();
  assert.equal(r.result.tools.length, 1);
  const tool = r.result.tools[0];
  assert.equal(tool.name, 'scan_mcp_server');
  assert.equal(tool.inputSchema.type, 'object');
  assert.deepEqual(tool.inputSchema.required, ['url']);
  assert.equal(tool.inputSchema.properties.url.type, 'string');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(MCP_TOOLS[0].name, MCP_TOOL_NAME);
});

test('mcp unknown method is -32601', async () => {
  const env = { LICENSES: kv() };
  const r = await (await call(env, '/mcp', { method: 'POST', body: rpcBody({ method: 'nope' }) })).json();
  assert.equal(r.error.code, -32601);
});

test('mcp tools/call succeeds with a mocked fetch', async () => {
  const restore = mockFetch({
    dns: { 'mcp.athena.example': ['1.1.1.1'] },
    handler: mockTargetServer,
  });
  const env = { LICENSES: kv(), PUBLIC_URL: 'https://mcp.pacerai.fit', SCAN_TIMEOUT_MS: '5000' };
  try {
    const r = await (await call(env, '/mcp', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Mozilla/5.0' },
      body: rpcBody({ method: 'tools/call', params: { name: 'scan_mcp_server', arguments: { url: 'https://mcp.athena.example/mcp' } } }),
    })).json();
    assert.equal(r.result.isError, undefined);
    const text = r.result.content[0].text;
    const payload = JSON.parse(text);
    assert.equal(payload.score, r.result.structuredContent.score);
    assert.equal(typeof payload.score, 'number');
    assert.ok('tokensPerTurn' in payload);
    assert.ok(Array.isArray(payload.keyFindings));
    assert.equal(payload.resultsUrl, 'https://mcp.pacerai.fit/s/mcp.athena.example/mcp');
    assert.match(payload.note, /Surface scan only/);
    assert.doesNotMatch(text, /</); // escaped, no raw markup from findings
  } finally { restore(); }
});

test('mcp SSRF: checkTarget rejects private, loopback, metadata, non-https, odd ports', () => {
  const blocked = [
    'http://x.com/mcp',
    'https://localhost/mcp',
    'https://127.0.0.1/mcp',
    'https://10.0.0.5/mcp',
    'https://192.168.1.2/',
    'https://a.internal/mcp',
    'https://u:p@x.com/',
    'https://x.com:8443/',
    'nonsense',
    'https://1.2.3.4/mcp',
    'https://[::1]/mcp',
    'https://[fe80::1]/mcp',
    'https://[fc00::1]/mcp',
    'https://2130706433/mcp',
    'https://metadata.google.internal/mcp',
    'https://metadata/mcp',
    'https://instance-data/mcp',
    'ftp://example.com/mcp',
  ];
  for (const u of blocked) assert.equal(checkTarget(u).ok, false, u);
  assert.equal(checkTarget('https://mcp.example.com/mcp').ok, true);
  assert.equal(isPrivateOrMetadataIp('169.254.169.254'), true);
  assert.equal(isPrivateOrMetadataIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrMetadataIp('8.8.8.8'), false);
});

test('mcp SSRF: resolvePublicTarget rejects private and metadata DNS answers', async () => {
  const cases = [
    ['localhost.example', ['127.0.0.1']],
    ['meta.example', ['169.254.169.254']],
    ['priv.example', ['10.1.2.3']],
    ['link.example', ['fe80::1']],
    ['cgnat.example', ['100.64.0.1']],
  ];
  for (const [host, ips] of cases) {
    const restore = mockFetch({ dns: { [host]: ips } });
    try {
      const r = await resolvePublicTarget(`https://${host}/mcp`);
      assert.equal(r.ok, false, host);
      assert.equal(r.error, 'private_address');
    } finally { restore(); }
  }
  const restore = mockFetch({ dns: { 'missing.example': [] } });
  try {
    const r = await resolvePublicTarget('https://missing.example/mcp');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'dns_resolution_failed');
  } finally { restore(); }
});

test('mcp tools/call rejects SSRF targets without fetching them', async () => {
  let fetchedTarget = false;
  const restore = mockFetch({
    dns: { 'evil.internal': ['1.1.1.1'] },
    handler: async () => { fetchedTarget = true; return new Response('no'); },
  });
  const env = { LICENSES: kv() };
  try {
    const r = await (await call(env, '/mcp', {
      method: 'POST',
      body: rpcBody({ method: 'tools/call', params: { name: 'scan_mcp_server', arguments: { url: 'https://127.0.0.1/mcp' } } }),
    })).json();
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /Rejected URL/);
    assert.equal(fetchedTarget, false);
  } finally { restore(); }
});

test('mcp rate limit is 10/min per IP hash', async () => {
  const restore = mockFetch({
    dns: { 'mcp.athena.example': ['1.1.1.1'] },
    handler: mockTargetServer,
  });
  const env = { LICENSES: kv(), PUBLIC_URL: 'https://mcp.pacerai.fit' };
  const init = {
    method: 'POST',
    headers: { 'cf-connecting-ip': '198.51.100.20', 'user-agent': 'Mozilla/5.0' },
    body: rpcBody({ method: 'tools/call', params: { name: 'scan_mcp_server', arguments: { url: 'https://mcp.athena.example/mcp' } } }),
  };
  try {
    for (let i = 0; i < MCP_RATE_PER_MINUTE; i++) {
      const r = await (await call(env, '/mcp', init)).json();
      assert.equal(r.result.isError, undefined, `call ${i} should succeed`);
    }
    const limited = await (await call(env, '/mcp', init)).json();
    assert.equal(limited.result.isError, true);
    assert.match(limited.result.content[0].text, /Rate limited/i);
    // a different IP still goes through
    const other = await (await call(env, '/mcp', { ...init, headers: { 'cf-connecting-ip': '198.51.100.21', 'user-agent': 'Mozilla/5.0' } })).json();
    assert.equal(other.result.isError, undefined);
  } finally { restore(); }
});

test('stats tag successful mcp tools/call as outside scan source mcp', async () => {
  const env = { LICENSES: kv(), METRICS: memD1(), PUBLIC_URL: 'https://mcp.pacerai.fit' };
  const restore = mockFetch({
    dns: { 'mcp.athena.example': ['1.1.1.1'] },
    handler: mockTargetServer,
  });
  pending.length = 0;
  try {
    const res = await call(env, '/mcp', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Mozilla/5.0' },
      body: rpcBody({ method: 'tools/call', params: { name: 'scan_mcp_server', arguments: { url: 'https://mcp.athena.example/mcp' } } }),
    });
    assert.equal((await res.json()).result.isError, undefined);
    await Promise.all(pending);
    const stats = await readStats(env, 'mcp-readiness');
    assert.equal(stats.totals.outside_scans, 1);
    assert.equal(stats.totals.outside_scan_sources.mcp, 1);
    assert.equal(stats.totals.scans.success, 1);
    assert.ok('requests' in stats.totals);
    assert.ok('waitlist_signups' in stats.totals);
  } finally { restore(); }
});

test('stats: internal MCP calls are excluded as now', async () => {
  const env = { LICENSES: kv(), METRICS: memD1(), PUBLIC_URL: 'https://mcp.pacerai.fit' };
  const restore = mockFetch({
    dns: { 'mcp.athena.example': ['1.1.1.1'] },
    handler: mockTargetServer,
  });
  pending.length = 0;
  try {
    assert.equal(isInternalRequest(new Request('https://w.test/mcp', { headers: { 'x-studio-internal': '1' } })), true);
    const res = await call(env, '/mcp', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'studio-agent', 'x-studio-internal': '1' },
      body: rpcBody({ method: 'tools/call', params: { name: 'scan_mcp_server', arguments: { url: 'https://mcp.athena.example/mcp' } } }),
    });
    assert.equal((await res.json()).result.isError, undefined);
    await Promise.all(pending);
    const stats = await readStats(env, 'mcp-readiness');
    assert.equal(stats.totals.outside_scans, 0);
    assert.equal(stats.totals.outside_scan_sources.api || 0, 0);
    assert.equal(stats.totals.outside_scan_sources.mcp || 0, 0);
    assert.equal(stats.totals.outside_scans, 0);
    assert.ok(stats.totals.internal_hits >= 1);
  } finally { restore(); }
});

test('server.json describes the streamable-http remote', () => {
  const raw = readFileSync(new URL('../server.json', import.meta.url), 'utf8');
  const j = JSON.parse(raw);
  assert.equal(j.name, 'io.github.Om3rr/mcp-readiness');
  assert.ok(j.description.length <= 100);
  assert.ok(j.version);
  assert.equal(j.repository.source, 'github');
  assert.equal(j.remotes[0].type, 'streamable-http');
  assert.equal(j.remotes[0].url, 'https://mcp.pacerai.fit/mcp');
});

test('stats: page and badge refreshes are not outside; api/mcp are, once per IP and target per day', async () => {
  const { recordVisit, readStats } = await import('../worker/src/metrics.js');
  const env = { METRICS: memD1() };
  const human = (ip = '203.0.113.40') => new Request('https://w.test/', { headers: { 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': ip } });
  const target = 'https://mcp.athena.example/mcp';

  await recordVisit(env, human(), { worker: 'mcp-readiness', route: '/s/*', scan: 'success', source: 'page', refresh: 'page', targetUrl: target });
  await recordVisit(env, human(), { worker: 'mcp-readiness', route: '/badge', scan: 'success', source: 'badge', refresh: 'badge', targetUrl: target, badge: true });
  let stats = await readStats(env, 'mcp-readiness');
  assert.equal(stats.totals.scans.success, 2);
  assert.equal(stats.totals.page_refresh, 1);
  assert.equal(stats.totals.badge_refresh, 1);
  assert.equal(stats.totals.outside_scans, 0);
  assert.equal(stats.totals.outside_scan_sources.api || 0, 0);
  assert.equal(stats.totals.outside_scan_sources.mcp || 0, 0);
  assert.ok(!stats.totals.outside_scan_sources.unattributed);
  assert.ok('outside_scans' in stats.totals);
  assert.ok('requests' in stats.totals);

  await recordVisit(env, human(), { worker: 'mcp-readiness', route: '/api/scan', scan: 'success', source: 'api', targetUrl: target });
  await recordVisit(env, human(), { worker: 'mcp-readiness', route: '/api/scan', scan: 'success', source: 'api', targetUrl: target });
  stats = await readStats(env, 'mcp-readiness');
  assert.equal(stats.totals.outside_scans, 1);
  assert.equal(stats.totals.outside_scan_sources.api, 1);
  assert.equal(stats.totals.scans.success, 4);

  await recordVisit(env, human('203.0.113.41'), { worker: 'mcp-readiness', route: '/mcp', scan: 'success', source: 'mcp', targetUrl: target });
  stats = await readStats(env, 'mcp-readiness');
  assert.equal(stats.totals.outside_scans, 2);
  assert.equal(stats.totals.outside_scan_sources.mcp, 1);
  assert.equal(stats.daily[0].page_refresh, 1);
  assert.equal(stats.daily[0].badge_refresh, 1);
});

test('mcp Origin policy: no Origin and allowlisted origins work with CORS; foreign Origin is 403', async () => {
  const env = { LICENSES: kv(), PUBLIC_URL: 'https://mcp.pacerai.fit' };
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
  const post = (headers = {}) => call(env, '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(init) });

  const none = await post();
  assert.equal(none.status, 200);
  assert.equal(none.headers.get('access-control-allow-origin'), null);
  assert.equal((await none.json()).result.serverInfo.name, 'mcp-readiness');

  const site = await post({ origin: 'https://mcp.pacerai.fit' });
  assert.equal(site.status, 200);
  assert.equal(site.headers.get('access-control-allow-origin'), 'https://mcp.pacerai.fit');
  assert.equal(site.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.match(site.headers.get('access-control-allow-headers') || '', /mcp-protocol-version/);
  assert.match(site.headers.get('vary') || '', /Origin/i);

  const local = await post({ origin: 'http://localhost:6274' });
  assert.equal(local.status, 200);
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:6274');

  const foreign = await post({ origin: 'https://example.com' });
  assert.equal(foreign.status, 403);
  const err = await foreign.json();
  assert.equal(err.error.code, -32000);
  assert.match(err.error.message, /Origin not allowed/i);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);

  const preflight = await call(env, '/mcp', { method: 'OPTIONS', headers: { origin: 'https://mcp.pacerai.fit' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://mcp.pacerai.fit');

  const get = await call(env, '/mcp', { method: 'GET' });
  assert.equal(get.status, 405);
});


test('stats: daily outside sources, utm and split referrers, daily mcp/api request counts', async () => {
  const { recordVisit, handleEvent, readStats, israelDay } = await import('../worker/src/metrics.js');
  const env = { METRICS: memD1() };
  const targetA = 'https://mcp.athena.example/mcp';
  const targetB = 'https://mcp.other-athena.example/mcp';
  const req = (ip, referer) => new Request('https://w.test/', { headers: { 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': ip, ...(referer ? { referer } : {}) } });

  await recordVisit(env, req('203.0.113.50', 'https://glama.ai/x'), {
    worker: 'mcp-readiness', route: '/mcp', scan: 'success', source: 'mcp', targetUrl: targetA,
    utm: { utm_source: 'glama', utm_medium: 'directory', utm_campaign: 'mcp-readiness-14d' },
  });
  await recordVisit(env, req('203.0.113.51'), {
    worker: 'mcp-readiness', route: '/api/scan', scan: 'success', source: 'api', targetUrl: targetB,
    utm: { utm_source: 'pulsemcp', utm_medium: 'directory', utm_campaign: 'mcp-readiness-14d' },
  });
  const ev = await handleEvent(new Request('https://w.test/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', 'cf-connecting-ip': '203.0.113.52' },
    body: JSON.stringify({ event: 'landing_view', ref: 'utm:glama/directory/mcp-readiness-14d' }),
  }), env, 'mcp-readiness');
  assert.ok([200, 204].includes(ev.status));

  // Simulate a historical outside count with no source row (pre-source-tracking days).
  const day = israelDay();
  await env.METRICS.prepare('INSERT INTO outside_scans_daily (worker, day, count) VALUES (?, ?, 1) ON CONFLICT(worker, day) DO UPDATE SET count = count + 1').bind('mcp-readiness', day, 1).run();

  const stats = await readStats(env, 'mcp-readiness');
  assert.equal(stats.totals.outside_scans, 2);
  assert.equal(stats.totals.outside_scans_since_fix, 2);
  assert.equal(stats.totals.legacy_unattributed_scans, 1);
  assert.ok(stats.totals.outside_scans_note.includes('legacy_unattributed_scans'));
  assert.equal(stats.totals.outside_scan_sources.mcp, 1);
  assert.equal(stats.totals.outside_scan_sources.api, 1);
  assert.equal(stats.totals.outside_scan_sources.unattributed || 0, 0);
  assert.ok(stats.totals.mcp_requests >= 1);
  assert.ok(stats.totals.api_scan_requests >= 1);
  assert.equal(stats.daily[0].outside_scans, 2);
  assert.equal(stats.daily[0].legacy_unattributed_scans, 1);
  assert.equal(stats.daily[0].outside_scan_sources.mcp, 1);
  assert.equal(stats.daily[0].outside_scan_sources.api, 1);
  assert.equal(stats.daily[0].outside_scan_sources.unattributed || 0, 0);
  assert.ok(stats.daily[0].mcp_requests >= 1);
  assert.ok(stats.daily[0].api_scan_requests >= 1);
  assert.equal(stats.totals.landing_views_by_utm[0].utm_source, 'glama');
  assert.equal(stats.totals.landing_views_by_utm[0].utm_medium, 'directory');
  assert.equal(stats.totals.landing_views_by_utm[0].utm_campaign, 'mcp-readiness-14d');
  const scanSources = stats.totals.outside_scans_by_utm.map((r) => r.utm_source).sort();
  assert.deepEqual(scanSources, ['glama', 'pulsemcp']);
  assert.ok(stats.top_scan_referrers.some((r) => r.host === 'glama.ai'));
  assert.ok(stats.top_landing_referrers.some((r) => r.host.startsWith('utm:glama')));
  assert.ok('outside_scans' in stats.totals);
  assert.ok('top_referrers' in stats);
});

test('stats: /mcp method and client breakdown records non-internal health checks', async () => {
  const { recordVisit, readStats } = await import('../worker/src/metrics.js');
  const env = { METRICS: memD1() };
  const hit = (ua, method, ip = '203.0.113.60') => recordVisit(env, new Request('https://w.test/mcp', {
    method: 'POST',
    headers: { 'user-agent': ua, 'cf-connecting-ip': ip },
  }), { worker: 'mcp-readiness', route: '/mcp', mcp_method: method });

  await hit('GlamaBot/1.0 (+https://glama.ai)', 'initialize');
  await hit('GlamaBot/1.0 (+https://glama.ai)', 'tools/list', '203.0.113.61');
  await hit('SentinelOracle/0.1 (+https://glimind.com/opt-out; liveness-only, never invokes tools)', 'initialize', '203.0.113.62');
  await hit('curl/8.14.1', 'initialize', '203.0.113.63'); // internal: excluded from breakdown

  const stats = await readStats(env, 'mcp-readiness');
  assert.equal(stats.totals.mcp_requests_by_client.glama, 2);
  assert.equal(stats.totals.mcp_requests_by_client.unknown_bot, 1);
  assert.ok(!stats.totals.mcp_requests_by_client.internal);
  assert.equal(stats.totals.mcp_requests_by_method.initialize, 2);
  assert.equal(stats.totals.mcp_requests_by_method['tools/list'], 1);
  assert.equal(stats.daily[0].mcp_requests_by_client.glama, 2);
});
