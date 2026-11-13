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
