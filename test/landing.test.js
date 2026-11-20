import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import worker from '../worker/src/index.js';
import { ALLOWED_EVENTS } from '../worker/src/metrics.js';

const pub = new URL('../worker/public/', import.meta.url).pathname;
const read = (f) => readFileSync(join(pub, f), 'utf8');
const htmlFiles = (dir = pub) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : []; });
const call = (path) => worker.fetch(new Request(`https://w.test${path}`), { LICENSES: { get: async () => null, put: async () => {}, list: async () => ({ keys: [], list_complete: true }) } }, { waitUntil() {} });

test('landing: no placeholders, no prices, no checkout, contact is a real mailto', () => {
  const html = read('index.html');
  assert.ok(!html.includes('YOUR-DOMAIN'));
  assert.ok(!html.includes('[email]'));
  assert.match(html, /Contact: <a href="mailto:omer20sh@gmail\.com">omer20sh@gmail\.com<\/a>/);
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /lemonsqueezy|buy\.stripe|checkout\.|Buy \d|Cancel anytime/i);
  assert.match(html, /https:\/\/mcp-readiness\.omer20sh\.workers\.dev\/badge\.svg\?url=/);
});

test('landing: hero numbers match the stats file', () => {
  const html = read('index.html');
  const st = JSON.parse(readFileSync(new URL('../reports/state-of-mcp-2026-11.stats.json', import.meta.url), 'utf8'));
  assert.match(html, new RegExp(`<b>${st.ok.toLocaleString('en-US')}</b>`));
  assert.match(html, new RegExp(`<b>${st.pub_origin}%</b>`));
  assert.match(html, new RegExp(`<b>${st.d_max.toLocaleString('en-US')}</b>`));
  assert.ok(!html.includes('12,926'));
});

test('landing: paid tiers are coming soon and log price_click with a tier', () => {
  const html = read('index.html');
  const tiers = [...html.matchAll(/data-event="price_click" data-tier="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(tiers)].sort(), ['credits', 'pack', 'pro', 'team', 'verified']);
  assert.match(html, /We store your email only to tell you once when Pro opens/);
  assert.match(html, /id="waitlist"/);
});

test('every page only fires allowed events, and FAQPage JSON-LD is valid', () => {
  for (const f of htmlFiles()) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(/data-event="([^"]+)"/g)) assert.ok(ALLOWED_EVENTS.includes(m[1]), `${f}: ${m[1]}`);
    assert.ok(!/data-track=/.test(html), `${f} uses old data-track names`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
  }
  assert.match(read('index.html'), /"@type":"FAQPage"/);
  assert.match(read('mcp-servers/index.html'), /"@type":"FAQPage"/);
  const t = read('t.js');
  for (const m of t.matchAll(/ping\('([a-z_]+)'/g)) assert.ok(ALLOWED_EVENTS.includes(m[1]));
});

test('SEO files: robots lets AI crawlers in, sitemap lists the comparison page, llms.txt exists', async () => {
  const robots = await (await call('/robots.txt')).text();
  for (const ua of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot']) assert.match(robots, new RegExp(`User-agent: ${ua}`));
  assert.match(robots, /Disallow: \/api\//);
  const sm = await (await call('/sitemap.xml')).text();
  assert.match(sm, /\/mcp-servers\/<\/loc>/);
  assert.match(read('llms.txt'), /^# MCP Readiness/);
  assert.match(read('index.html'), /href="\/mcp-servers\/"/);
  assert.match(read('favicon.svg'), /<svg/);
});

test('scan result page: next steps with badge, prefilled Action and Pro CTA, score copy, escaped', async () => {
  const { render, scoreCopy } = await import('../worker/src/pages.js');
  const evil = 'https://evil.example/mcp?a="><script>x</script>';
  const low = render({}, 'https://w.test/s/evil.example/mcp', evil, { score: 40, server: '<b>x</b>', toolCount: 2, contextTokens: 100, top: [], at: '2026-11-20T10:00:00Z' });
  assert.match(low, /Fix these first/);
  assert.match(low, /Keep this score: add the badge/);
  assert.match(low, /Fail CI if it drops: add the Action/);
  assert.match(low, /Get auto-fix for token bloat: Pro, coming soon/);
  assert.match(low, /data-event="badge_copied"/);
  assert.match(low, /data-event="action_install_click"/);
  assert.match(low, /data-event="price_click" data-tier="pro"/);
  assert.match(low, /url: https:\/\/evil\.example\/mcp\?a=&quot;&gt;&lt;script&gt;/);
  assert.ok(!low.includes('<script>x</script>'));
  assert.ok(!low.includes('<b>x</b>'));
  assert.match(scoreCopy(95), /^Show it off/);
  assert.match(scoreCopy(80), /^Close/);
});

test('OG/meta: every public page has title, description, canonical, og:* and a large twitter card', () => {
  for (const f of htmlFiles()) {
    const html = readFileSync(f, 'utf8');
    for (const re of [/<title>[^<]+<\/title>/, /<meta name="description" content="[^"]+"/, /<link rel="canonical" href="https:\/\/mcp-readiness\.omer20sh\.workers\.dev\//, /property="og:title"/, /property="og:description"/, /property="og:url"/, /property="og:image" content="https:\/\/mcp-readiness\.omer20sh\.workers\.dev\/og\.png"/, /name="twitter:card" content="summary_large_image"/]) assert.match(html, re, `${f} missing ${re}`);
  }
  const png = readFileSync(join(pub, 'og.png'));
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
});

test('OG/meta: scan pages get a dynamic, escaped og:title with server name and score', async () => {
  const { render } = await import('../worker/src/pages.js');
  const h = render({}, 'https://w.test/s/a.example/mcp', 'https://a.example/mcp', { score: 88, server: 'Acme "<x>"', toolCount: 3, contextTokens: 500, top: [], at: '2026-11-20T10:00:00Z' });
  assert.match(h, /<meta property="og:title" content="Acme &quot;&lt;x&gt;&quot; MCP server readiness: 88\/100/);
  assert.match(h, /name="twitter:card" content="summary_large_image"/);
  assert.match(h, /property="og:image" content="https:\/\/w\.test\/og\.png"/);
});
