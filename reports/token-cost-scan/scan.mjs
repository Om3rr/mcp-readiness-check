import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { probeHttp } from '../repo/src/probe.js';
const targets = JSON.parse(readFileSync(process.argv[2] || 'targets.json', 'utf8'));
const OUT = process.argv[3] || 'scan-results.jsonl';
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url) : []);
const todo = targets.filter((t) => !done.has(t.url));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`timeout after ${ms / 1000}s`)), ms).unref())]);
let i = 0, n = 0;
process.on('unhandledRejection', () => {});
async function worker() {
  while (i < todo.length) {
    const t = todo[i++];
    const rec = { ...t, scannedAt: null };
    try {
      const r = await withTimeout(probeHttp(t.url, { timeoutMs: 12000 }), 25000);
      Object.assign(rec, { ok: true, server: r.server, protocolVersion: r.protocolVersion, score: r.score, authRequired: !!r.authRequired, toolCount: r.toolCount, contextTokens: r.contextTokens ?? null,
        issues: (r.findings || []).filter((f) => f.level !== 'info' && f.level !== 'pass').map((f) => ({ level: f.level, id: f.id, title: f.title })),
        info: (r.findings || []).filter((f) => f.level === 'info' || f.level === 'pass').map((f) => f.id) });
    } catch (e) { Object.assign(rec, { ok: false, error: String(e?.message || e).slice(0, 200) }); }
    rec.scannedAt = new Date().toISOString();
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
    if (++n % 200 === 0) console.log(new Date().toISOString(), n, '/', todo.length);
  }
}
await Promise.all(Array.from({ length: 64 }, worker));
console.log('done', n);
process.exit(0);
