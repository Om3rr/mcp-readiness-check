// Talks to an MCP server over Streamable HTTP or stdio and collects observations.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { checkTools, checkHttp, checkInit, score } from './checks.js';

const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-readiness-check', version: '0.1.0' } };

async function parseBody(r) {
  const t = await r.text();
  if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    return data.length ? JSON.parse(data.at(-1)) : null;
  }
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

export async function probeHttp(url, { token } = {}) {
  let id = 0, session = null;
  const send = async (method, params, { auth = true, origin, notify = false } = {}) => {
    const h = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': INIT.protocolVersion };
    if (auth && token) h.authorization = `Bearer ${token}`;
    if (session) h['mcp-session-id'] = session;
    if (origin) h.origin = origin;
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params };
    const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
    session ??= r.headers.get('mcp-session-id');
    return { r, j: notify ? null : await parseBody(r) };
  };
  const init = await send('initialize', INIT);
  if (init.r.status === 401 && !token) throw new Error(`Server requires authentication (HTTP 401${init.r.headers.get('www-authenticate') ? ', WWW-Authenticate present' : ''}). Good sign; re-run with --token to scan the tools.`);
  if (!init.j?.result) throw new Error(`initialize failed: HTTP ${init.r.status} ${JSON.stringify(init.j)}`);
  await send('notifications/initialized', undefined, { notify: true });
  const list = await send('tools/list', {});
  const tools = list.j?.result?.tools || [];
  const unauth = await send('tools/list', {}, { auth: false });
  const evil = await send('tools/list', {}, { origin: 'https://evil.example' });
  const unknown = await send('no/such_method', {});
  const badTool = await send('tools/call', { name: '__no_such_tool__', arguments: {} });
  // Try one read-only-looking tool without auth, to see if auth is enforced on calls.
  const ro = tools.find((t) => t.annotations?.readOnlyHint || /^(get|list|search|read|inbox)/i.test(t.name) && !(t.inputSchema?.required || []).length);
  let unauthCall = null;
  if (ro && token) unauthCall = await send('tools/call', { name: ro.name, arguments: {} }, { auth: false });
  const obs = {
    url, authProvided: Boolean(token),
    acao: init.r.headers.get('access-control-allow-origin'),
    sessionHeader: session,
    unauthToolsList: Boolean(unauth.j?.result?.tools),
    evilOriginAccepted: evil.r.ok && Boolean(evil.j?.result),
    unknownMethodCode: unknown.j?.error?.code ?? null,
    badToolStatus: badTool.r.status,
    unauthToolCallOk: Boolean(unauthCall && unauthCall.r.ok && unauthCall.j?.result && !unauthCall.j.result.isError),
    unauthToolCallName: ro?.name,
    allReadOnly: tools.length > 0 && tools.every((t) => t.annotations?.readOnlyHint === true || /^(get|list|search|read|fetch|resolve|query|find|ask)[_-]?/i.test(t.name)),
  };
  return report(init.j.result, tools, checkHttp(obs));
}

export async function probeStdio(cmd, args = []) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map(); let id = 0;
  createInterface({ input: p.stdout }).on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch {} });
  const rpc = (method, params) => new Promise((ok, no) => {
    const i = ++id; waiting.set(i, ok);
    setTimeout(() => no(new Error(`timeout waiting for ${method}`)), 10000).unref();
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
  });
  try {
    const init = await rpc('initialize', INIT);
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc('tools/list', {});
    const unknown = await rpc('no/such_method', {});
    const extra = unknown.error?.code === -32601 ? [] : [{ level: 'warn', id: 'rpc.method_not_found', title: 'Unknown methods do not return JSON-RPC -32601', detail: '', fix: '' }];
    return report(init.result, list.result?.tools || [], extra);
  } finally { p.kill(); }
}

function report(init, tools, transport) {
  const findings = [...checkInit(init), ...checkTools(tools), ...transport];
  return { server: init?.serverInfo, protocolVersion: init?.protocolVersion, toolCount: tools.length, score: score(findings), findings };
}

export function toMarkdown(r, target) {
  const icon = { fail: '❌', warn: '⚠️', info: 'ℹ️', pass: '✅' };
  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  const rows = [...r.findings].sort((a, b) => order[a.level] - order[b.level]);
  return [`# MCP readiness report: ${r.server?.name || target}`, '',
    `Target: \`${target}\` · protocol ${r.protocolVersion} · ${r.toolCount} tools · **score ${r.score}/100**`, '',
    ...rows.map((x) => `- ${icon[x.level]} **${x.title}**${x.detail ? ` — ${x.detail}` : ''}${x.fix ? `\n  - Fix: ${x.fix}` : ''}`), '',
    '_Automated surface checks only. They do not replace a design review of auth, data flows, and human-approval gates._'].join('\n');
}
