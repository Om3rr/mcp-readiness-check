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
  assert.deepEqual(tiers.sort(), ['credits', 'pack', 'pro', 'team', 'verified']);
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
