import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import worker from '../worker/src/index.js';
import { TOKEN_COST_PATHS } from '../worker/src/token-cost-paths.js';

const pub = new URL('../worker/public/', import.meta.url).pathname;
const read = (f) => readFileSync(join(pub, f), 'utf8');
const env = { LICENSES: { get: async () => null, put: async () => {}, list: async () => ({ keys: [], list_complete: true }) } };
const call = (path) => worker.fetch(new Request(`https://w.test${path}`), env, { waitUntil() {} });
const TIERS = ['under-1k-tokens', '1k-5k-tokens', '5k-20k-tokens', 'over-20k-tokens'];
const servers = readdirSync(join(pub, 'token-cost'), { withFileTypes: true }).filter((d) => d.isDirectory() && !TIERS.includes(d.name)).map((d) => d.name);
const prev = JSON.parse(readFileSync(new URL('../reports/token-cost-2026-11-20.json', import.meta.url), 'utf8')).servers;
const cur = JSON.parse(gunzipSync(readFileSync(new URL('../reports/registry-token-cost-2026-11-27.json.gz', import.meta.url))).toString('utf8'));
const titleOf = (h) => h.match(/<title>([^<]+)<\/title>/)[1];
const descOf = (h) => h.match(/<meta name="description" content="([^"]+)"/)[1];

test('token-cost: one page per scored server, all in the sitemap paths', () => {
  assert.ok(servers.length >= 400 && servers.length <= 500, `${servers.length} pages`);
  assert.equal(TOKEN_COST_PATHS[0], '/token-cost/');
  assert.deepEqual(TOKEN_COST_PATHS.slice(1).sort(), [...TIERS, ...servers].map((s) => `/token-cost/${s}/`).sort());
  // Every page from the 20 Nov ranking keeps its URL.
  for (const p of prev) assert.ok(servers.includes(p.id), p.id);
});

test('token-cost: server pages have title, unique description, canonical, og, scan date, honest note', () => {
  const descs = new Set();
  const titles = new Set();
  for (const s of servers) {
    const h = read(`token-cost/${s}/index.html`);
    assert.match(titleOf(h), /^Token cost of .+ MCP server$/, s);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://mcp.pacerai.fit/token-cost/${s}/">`), s);
    assert.match(h, /property="og:title" content="Token cost of /, s);
    assert.match(h, /property="og:description"/, s);
    assert.match(h, /Scanned <time datetime="\d{4}-\d{2}-\d{2}T[^"]+">\d+ \w+ \d{4}<\/time>/, s);
    assert.match(h, /This is an automated surface check of the public MCP endpoint, not a security audit\./, s);
    assert.equal((h.match(/<h1>/g) || []).length, 1, s);
    assert.match(h, /<a href="\/token-cost\/">/, s);
    assert.match(h, /<a href="\/">/, s);
    assert.match(h, /href="\/#remote"/, s);
    assert.match(h, /https:\/\/mcp\.pacerai\.fit\/mcp</, s);
    assert.doesNotMatch(h, /toolslim/i, s);
    // Rescan goes through the /s/ page (POST rescan), always nofollow, never an auto-scan URL.
    for (const m of h.matchAll(/<a [^>]*href="\/s\/[^"]*"[^>]*>/g)) assert.match(m[0], /rel="nofollow"/, s);
    assert.doesNotMatch(h, /\/scan\?url=|\/api\/scan/, s);
    assert.doesNotMatch(h, /omer|wonderful|\bvia\b|origin|cors/i, s);
    assert.doesNotMatch(h.replace(/https:\/\/mcp\.pacerai\.fit/g, ''), /pacer/i, s);
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
    descs.add(descOf(h));
    titles.add(titleOf(h));
  }
  assert.equal(descs.size, servers.length, 'descriptions must be unique');
  assert.equal(titles.size, servers.length, 'titles must be unique');
});

test('token-cost: measured numbers for open servers, no invented numbers behind login', () => {
  const gmail = read('token-cost/gmail/index.html');
  assert.equal(titleOf(gmail), 'Token cost of Gmail MCP server');
  const g = cur.servers.find((x) => x.url === 'https://gmailmcp.googleapis.com/mcp/v1');
  assert.ok(g && g.ok && !g.authRequired, 'gmail in the 27 Nov scan');
  assert.match(gmail, new RegExp(`~${g.contextTokens.toLocaleString('en-US')} <span class="small">\\(estimate, about ±10%\\)</span>`));
  assert.match(gmail, new RegExp(`<td>Tools listed</td><td>${g.toolCount}</td>`));
  // Delta vs the previous scan uses both recorded numbers.
  const gp = prev.find((x) => x.id === 'gmail');
  assert.match(gmail, new RegExp(`20 November 2026: ${gp.toolCount} tools, ~${gp.contextTokens.toLocaleString('en-US')} tokens\\. 27 November 2026: ${g.toolCount} tools`));
  const air = read('token-cost/airtable/index.html');
  assert.match(air, /required login\. The unauthenticated scan on [^.]+ returned no tool list/);
  assert.match(air, /Not measured \(no tool list without login\)/);
  assert.doesNotMatch(air.replace(/<div class="card"><h2 style="margin-top:0">Other servers[\s\S]*$/, ''), /~\d|tokens per turn \(|\d+ tools/);
  assert.match(read('token-cost/square/index.html'), /<title>Token cost of Square \(SSE\) MCP server<\/title>/);
  assert.match(read('token-cost/square-http/index.html'), /<title>Token cost of Square \(Streamable HTTP\) MCP server<\/title>/);
});

test('token-cost: ranking page sorted by tokens, auth list separate, links every server', () => {
  const h = read('token-cost/index.html');
  assert.equal(titleOf(h), 'MCP server token cost ranking');
  assert.match(h, /<link rel="canonical" href="https:\/\/mcp.pacerai.fit\/token-cost\/">/);
  const ranked = h.split('<h2>Servers that need login')[0];
  const toks = [...ranked.matchAll(/data-sort="(\d+)">~/g)].map((m) => Number(m[1]));
  assert.ok(toks.length >= 20);
  assert.deepEqual(toks, [...toks].sort((a, b) => a - b));
  assert.match(h, /Servers that need login \(\d+\)/);
  for (const s of servers) assert.match(h, new RegExp(`href="/token-cost/${s}/"`), s);
  assert.match(h, /not a security audit/);
  assert.match(read('index.html'), /href="\/token-cost\/"/);
});

test('token-cost: size hub pages list only servers in their measured range', () => {
  const bounds = { 'under-1k-tokens': [0, 1000], '1k-5k-tokens': [1000, 5000], '5k-20k-tokens': [5000, 20000], 'over-20k-tokens': [20000, Infinity] };
  let total = 0;
  for (const t of TIERS) {
    const h = read(`token-cost/${t}/index.html`);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://mcp.pacerai.fit/token-cost/${t}/">`));
    assert.match(h, /not a security audit/);
    const toks = [...h.matchAll(/data-sort="(\d+)">~/g)].map((m) => Number(m[1]));
    for (const n of toks) assert.ok(n >= bounds[t][0] && n < bounds[t][1], `${t}: ${n}`);
    total += toks.length;
  }
  const ranked = read('token-cost/index.html').split('<h2>Servers that need login')[0];
  assert.equal(total, [...ranked.matchAll(/data-sort="(\d+)">~/g)].length);
});

test('token-cost: routes served from assets, sitemap and llms.txt list them, robots still blocks /s/', async () => {
  const assetEnv = { ...env, ASSETS: { fetch: async (req) => {
    const p = new URL(req.url).pathname;
    const f = join(pub, p.endsWith('/') ? `${p}index.html` : p);
    return existsSync(f) ? new Response(readFileSync(f, 'utf8'), { headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404 });
  } } };
  for (const p of ['/token-cost/', '/token-cost/gmail/', '/token-cost/airtable/']) {
    const r = await worker.fetch(new Request(`https://w.test${p}`), assetEnv, { waitUntil() {} });
    assert.equal(r.status, 200, p);
    assert.match(await r.text(), /<title>(Token cost of|MCP server token cost ranking)/, p);
  }
  const sm = await (await call('/sitemap.xml')).text();
  for (const p of TOKEN_COST_PATHS) assert.ok(sm.includes(`<loc>https://w.test${p}</loc>`), p);
  const llms = read('llms.txt');
  assert.match(llms, /\/token-cost\/\)/);
  assert.match(llms, /\/token-cost\/gmail\//);
  assert.match(await (await call('/robots.txt')).text(), /Disallow: \/s\//);
});
