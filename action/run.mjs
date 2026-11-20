// GitHub Action entry point. Scans locally (works for localhost servers started in the job),
// then asks the hosted API whether this run is free, capped or full (licensed).
import { appendFileSync, writeFileSync } from 'node:fs';
import { probeHttp, withTools } from '../src/probe.js';
import { toHtml } from '../src/html.js';
import { toSarif, summaryMarkdown } from './format.mjs';

const I = (k, d = '') => (process.env[`INPUT_${k}`] ?? d).trim();
const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const summary = (md) => (process.env.GITHUB_STEP_SUMMARY ? appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n') : console.log(md));

async function meter(apiUrl, apiKey) {
  try {
    const r = await fetch(`${apiUrl.replace(/\/$/, '')}/api/ci/run`, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ repo: process.env.GITHUB_REPOSITORY || 'local' }),
    });
    if (!r.ok) return { mode: 'free', note: `metering HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { mode: 'free', note: 'metering unavailable' }; // fail open: never break a build because our API is down
  }
}

const url = I('URL');
if (!url) { console.error('::error::input "url" is required'); process.exit(1); }
const failUnder = Number(I('FAIL_UNDER', '70'));
const maxTokens = Number(I('MAX_CONTEXT_TOKENS', '0'));

let r;
try { r = await probeHttp(url, { token: I('TOKEN') || undefined, timeoutMs: 20000 }); }
catch (e) { console.error(`::error::Could not scan ${url}: ${e.message}`); process.exit(1); }

const m = await meter(I('API_URL', 'https://mcp-readiness.example.workers.dev'), I('API_KEY'));
if (m.error) console.log(`::warning::License: ${m.error}. Running in free mode.`);
const mode = m.mode === 'full' ? 'full' : m.mode === 'capped' ? 'capped' : 'free';
const issues = r.findings.filter((f) => f.level === 'fail' || f.level === 'warn');

summary(summaryMarkdown(r, url, mode, m));
// JSON report with the raw tool list, for the ToolSlim fix step (or your own tooling).
if (I('JSON_PATH')) writeFileSync(I('JSON_PATH'), JSON.stringify(withTools(r, url), null, 1));
if (mode === 'full') {
  writeFileSync(I('REPORT_PATH', 'mcp-readiness-report.html'), toHtml(r, url));
  if (I('SARIF_PATH')) writeFileSync(I('SARIF_PATH'), JSON.stringify(toSarif(r, url), null, 1));
}
for (const f of mode === 'capped' ? [] : issues.slice(0, mode === 'full' ? 50 : 3))
  console.log(`::${f.level === 'fail' ? 'error' : 'warning'} title=MCP ${f.id}::${f.title}`);

out('score', r.score); out('context-tokens', r.contextTokens ?? ''); out('findings', issues.length); out('mode', mode);
let failed = false;
if (failUnder > 0 && r.score < failUnder) { console.error(`::error::MCP readiness score ${r.score} is below fail-under ${failUnder}`); failed = true; }
if (maxTokens > 0 && (r.contextTokens ?? 0) > maxTokens) { console.error(`::error::Tool list costs ~${r.contextTokens} tokens per turn (limit ${maxTokens})`); failed = true; }
process.exit(failed ? 1 : 0);
