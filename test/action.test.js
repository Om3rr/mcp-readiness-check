import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryMarkdown, toSarif } from '../action/format.mjs';

const r = { score: 55, toolCount: 12, contextTokens: 9100, server: { name: 's', version: '1' }, findings: [
  { level: 'fail', id: 'a', title: 'A', fix: 'fix a' }, { level: 'warn', id: 'b', title: 'B' }, { level: 'warn', id: 'c', title: 'C' }, { level: 'warn', id: 'd', title: 'D', fix: 'fix d' }, { level: 'pass', id: 'p', title: 'P' }] };

test('free summary shows top 3 without fixes; full shows all with fixes; capped hides findings', () => {
  const free = summaryMarkdown(r, 'https://x/mcp', 'free');
  assert.match(free, /55\/100/); assert.match(free, /9,100 tokens/); assert.ok(!free.includes('fix a')); assert.ok(!free.includes('**D**')); assert.match(free, /1 more finding/);
  const full = summaryMarkdown(r, 'https://x/mcp', 'full');
  assert.ok(full.includes('fix d')); assert.ok(full.includes('**D**'));
  assert.ok(!summaryMarkdown(r, 'https://x/mcp', 'capped').includes('**A**'));
});

test('sarif has one result per fail/warn and valid levels', () => {
  const s = toSarif(r, 'https://x/mcp');
  assert.equal(s.version, '2.1.0'); assert.equal(s.runs[0].results.length, 4);
  assert.equal(s.runs[0].results[0].level, 'error');
});

test('toolslim hook appears only for heavy tool lists', () => {
  assert.match(summaryMarkdown({ ...r, contextTokens: 9100 }, 'u', 'free'), /toolslim/);
  assert.ok(!summaryMarkdown({ ...r, contextTokens: 300 }, 'u', 'free').includes('toolslim'));
});

test('JSON report for ToolSlim carries target and raw tools; default serialisation does not', async () => {
  const { report, withTools } = await import('../src/probe.js');
  const rr = report({ serverInfo: { name: 's' }, protocolVersion: '2025-06-18' }, [{ name: 'list_x', description: 'd', inputSchema: { type: 'object' } }], []);
  assert.ok(!('tools' in JSON.parse(JSON.stringify(rr))));
  const j = JSON.parse(JSON.stringify(withTools(rr, 'http://127.0.0.1:8787/mcp')));
  assert.equal(j.target, 'http://127.0.0.1:8787/mcp'); assert.equal(j.tools[0].name, 'list_x'); assert.equal(j.toolCount, 1);
});
