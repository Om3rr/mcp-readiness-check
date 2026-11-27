import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const d = JSON.parse(readFileSync('reports/popular-remote-servers-2026-11-20.json', 'utf8'));
const expRaw = JSON.parse(readFileSync('data/mcp-servers.json', 'utf8'));
const seen = new Set([...d.results.map((r) => r.url), ...(d.failed || []).map((f) => f.url)]);
const usedSlugs = new Set(d.results.map((r) => r.id));
const out = d.results.map((r) => ({ id: r.id, name: r.name, url: r.url, score: r.score, authRequired: r.authRequired, toolCount: r.toolCount, contextTokens: r.contextTokens, scannedAt: d.recorded }));
for (const x of expRaw) {
  if (!x || !x.url || seen.has(x.url)) continue;
  seen.add(x.url);
  if (x.score == null) continue;
  let slug = String(x.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'server';
  while (usedSlugs.has(slug)) slug += '-2';
  usedSlugs.add(slug);
  out.push({ id: slug, name: x.name, url: x.url, score: x.score, authRequired: x.tools == null, toolCount: x.tools, contextTokens: x.tokens_per_turn, scannedAt: x.scanned_at });
}
for (const o of out) if (!existsSync(`worker/public/token-cost/${o.id}/index.html`)) console.error('missing', o.id);
writeFileSync('reports/token-cost-2026-11-20.json', JSON.stringify({ note: 'Token-cost scan results behind the /token-cost/ pages as of 20 November 2026 (from popular-remote-servers-2026-11-20.json and data/mcp-servers.json).', servers: out }, null, 1));
console.log(out.length);
