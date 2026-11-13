#!/usr/bin/env node
// Usage:
//   mcp-readiness-check https://host/mcp [--token T] [--json]
//   mcp-readiness-check --stdio node server.js [--json]
import { probeHttp, probeStdio, toMarkdown } from '../src/probe.js';
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const ti = argv.indexOf('--token');
const token = ti >= 0 ? argv[ti + 1] : process.env.MCP_TOKEN;
try {
  let r, target;
  if (argv[0] === '--stdio') { const cmd = argv.slice(1).filter((a) => a !== '--json'); target = cmd.join(' '); r = await probeStdio(cmd[0], cmd.slice(1)); }
  else { target = argv.find((a) => /^https?:/.test(a)); if (!target) throw new Error('usage: mcp-readiness-check <url> | --stdio <cmd...>'); r = await probeHttp(target, { token }); }
  console.log(json ? JSON.stringify(r, null, 2) : toMarkdown(r, target));
  process.exitCode = r.findings.some((f) => f.level === 'fail') ? 1 : 0;
} catch (e) { console.error(String(e.message || e)); process.exitCode = 2; }
