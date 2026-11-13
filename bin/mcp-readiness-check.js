#!/usr/bin/env node
// Usage:
//   mcp-readiness-check https://host/mcp [--token T] [--json] [--html report.html]
//   mcp-readiness-check --stdio node server.js [--json] [--html report.html]
//   mcp-readiness-check --batch servers.txt --out reports/     (one URL per line, "# comments" ok)
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { probeHttp, toMarkdown } from '../src/probe.js';
import { probeStdio } from '../src/stdio.js';
import { toHtml, toSummaryHtml } from '../src/html.js';
const argv = process.argv.slice(2);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const json = argv.includes('--json');
const token = opt('--token') ?? process.env.MCP_TOKEN;
const withTimeout = (p, ms = 30000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`timeout after ${ms / 1000}s`)), ms).unref())]);
const slug = (u) => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const top = (r) => { const f = r.findings.find((x) => x.level === 'fail') || r.findings.find((x) => x.level === 'warn'); return f ? f.title : r.authRequired ? 'OAuth discovery complete' : 'No warnings'; };

try {
  if (argv.includes('--batch')) {
    const urls = readFileSync(opt('--batch'), 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
    const out = opt('--out') || 'reports'; mkdirSync(out, { recursive: true });
    const rows = [];
    for (const url of urls) {
      process.stderr.write(`scanning ${url} … `);
      try {
        const r = await withTimeout(probeHttp(url));
        const file = `${slug(url)}.html`;
        writeFileSync(`${out}/${file}`, toHtml(r, url)); writeFileSync(`${out}/${slug(url)}.json`, JSON.stringify(r, null, 2));
        rows.push({ url, file, name: r.server?.title || r.server?.name || url, kind: r.authRequired ? 'OAuth' : 'Public', tools: r.toolCount, score: r.score, top: top(r), findings: r.findings });
        process.stderr.write(`${r.score}\n`);
      } catch (e) { rows.push({ url, file: '#', name: new URL(url).host, kind: 'Error', tools: null, score: null, top: String(e.message).slice(0, 90) }); process.stderr.write(`error: ${e.message}\n`); }
    }
    rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    writeFileSync(`${out}/index.html`, toSummaryHtml(rows));
    writeFileSync(`${out}/summary.json`, JSON.stringify(rows.map(({ findings, ...x }) => ({ ...x, fails: findings?.filter((f) => f.level === 'fail').map((f) => f.id), warns: findings?.filter((f) => f.level === 'warn').map((f) => f.id) })), null, 2));
    console.log(`wrote ${out}/index.html (${rows.length} servers)`);
  } else {
    let r, target;
    if (argv[0] === '--stdio') { const cmd = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--html'); target = cmd.join(' '); r = await probeStdio(cmd[0], cmd.slice(1)); }
    else { target = argv.find((a) => /^https?:/.test(a)); if (!target) throw new Error('usage: mcp-readiness-check <url> | --stdio <cmd...> | --batch <file>'); r = await probeHttp(target, { token }); }
    if (opt('--html')) { writeFileSync(opt('--html'), toHtml(r, target)); console.error(`wrote ${opt('--html')}`); }
    console.log(json ? JSON.stringify(r, null, 2) : toMarkdown(r, target));
    process.exitCode = r.findings.some((f) => f.level === 'fail') ? 1 : 0;
  }
} catch (e) { console.error(String(e.message || e)); process.exitCode = 2; }
