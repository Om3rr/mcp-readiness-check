const ICON = { fail: '❌', warn: '⚠️', info: 'ℹ️', pass: '✅' };
const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };

export function summaryMarkdown(r, url, mode, meter = {}) {
  const issues = [...r.findings].filter((f) => f.level === 'fail' || f.level === 'warn').sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const ctx = r.contextTokens != null ? `~${r.contextTokens.toLocaleString('en-US')} tokens per agent turn (${r.toolCount} tools)` : 'n/a (auth required; pass `token`)';
  const lines = [`## MCP readiness: **${r.score}/100**`, '', `| | |`, `|---|---|`, `| Endpoint | \`${url}\` |`, `| Server | ${r.server?.name || '—'} ${r.server?.version || ''} |`, `| Context cost | ${ctx} |`, `| Issues | ${issues.length} (fail ${issues.filter((f) => f.level === 'fail').length}, warn ${issues.filter((f) => f.level === 'warn').length}) |`, ''];
  if (mode === 'capped') lines.push(`> Free daily cap reached for this repo. The score is still enforced; findings are hidden until tomorrow. An Org key lifts the cap.`);
  else {
    const shown = mode === 'full' ? issues : issues.slice(0, 3);
    for (const f of shown) lines.push(`- ${ICON[f.level]} **${f.title}**${mode === 'full' && f.fix ? `<br>Fix: ${f.fix}` : ''}`);
    if (mode !== 'full' && issues.length > 3) lines.push('', `> ${issues.length - 3} more finding(s), plus fixes, the HTML report and SARIF, are on the Org plan ($29/mo).`);
  }
  lines.push('', `<sub>mcp-readiness-check · mode: ${mode}${meter.remaining != null ? ` · ${meter.remaining} runs left` : ''} · live protocol scan, no tools with side effects were called</sub>`);
  return lines.join('\n');
}

export function toSarif(r, url, anchor = 'README.md') {
  const rules = new Map();
  const results = r.findings.filter((f) => f.level === 'fail' || f.level === 'warn').map((f) => {
    rules.set(f.id, { id: f.id, shortDescription: { text: f.title.replace(/"[^"]*"/g, '…').slice(0, 120) }, help: { text: f.fix || f.detail || f.title } });
    return { ruleId: f.id, level: f.level === 'fail' ? 'error' : 'warning', message: { text: `${f.title}${f.fix ? ` Fix: ${f.fix}` : ''} (${url})` }, locations: [{ physicalLocation: { artifactLocation: { uri: anchor }, region: { startLine: 1 } } }] };
  });
  return { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [{ tool: { driver: { name: 'mcp-readiness-check', informationUri: 'https://github.com/Om3rr/mcp-readiness-check', rules: [...rules.values()] } }, results }] };
}
