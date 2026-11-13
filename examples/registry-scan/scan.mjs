import { readFileSync, writeFileSync } from 'node:fs';
import { probeHttp } from '/workspace/mcp-readiness-check/src/probe.js';
const all = JSON.parse(readFileSync(process.env.IN||'remotes.json', 'utf8'));
// deterministic sample: dedupe by host, take up to N
const seen = new Set(); const list = [];
for (const s of all) { const h = new URL(s.url).host; if (seen.has(h)) continue; seen.add(h); list.push(s); }
const N = Number(process.argv[2] || 600); const todo = list.slice(Number(process.argv[3]||0), N);
const res = []; let i = 0, done = 0;
const T = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms).unref())]);
async function worker() { while (i < todo.length) { const s = todo[i++]; try { const r = await T(probeHttp(s.url), 20000); res.push({ ...s, score: r.score, authRequired: !!r.authRequired, tools: r.toolCount, server: r.server, protocolVersion: r.protocolVersion, findings: r.findings.filter((f) => f.level !== 'pass').map((f) => ({ level: f.level, id: f.id, title: f.title, detail: f.detail })) }); } catch (e) { res.push({ ...s, error: String(e.message).slice(0, 120) }); } if (++done % 50 === 0) process.stderr.write(`${done}/${todo.length}\n`); } }
await Promise.all(Array.from({ length: 24 }, worker));
writeFileSync(process.env.OUT||'results.json', JSON.stringify(res, null, 1));
const ok = res.filter((r) => r.score != null);
console.log('scanned', res.length, 'ok', ok.length, 'errors', res.length - ok.length, 'public', ok.filter((r) => !r.authRequired).length, 'oauth', ok.filter((r) => r.authRequired).length);
