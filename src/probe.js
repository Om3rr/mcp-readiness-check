// Talks to an MCP server over Streamable HTTP and collects observations.
// Runtime-neutral (Node 18+, Cloudflare Workers): uses only fetch. stdio lives in ./stdio.js.
import { checkTools, checkHttp, checkInit, checkPrompts, score } from './checks.js';
import { probeOAuth } from './oauth.js';

export const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-readiness-check', version: '0.2.0' } };

async function parseBody(r) {
  const t = await r.text();
  if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    return data.length ? JSON.parse(data.at(-1)) : null;
  }
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

export async function probeHttp(url, { token, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  let id = 0, session = null;
  const send = async (method, params, { auth = true, origin, notify = false } = {}) => {
    const h = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': INIT.protocolVersion };
    if (auth && token) h.authorization = `Bearer ${token}`;
    if (session) h['mcp-session-id'] = session;
    if (origin) h.origin = origin;
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params };
    const r = await fetchImpl(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    session ??= r.headers.get('mcp-session-id');
    return { r, j: notify ? null : await parseBody(r) };
  };
  const init = await send('initialize', INIT);
  if ((init.r.status === 401 || init.r.status === 403) && !token) {
    const { findings, oauth } = await probeOAuth(url, init.r, fetchImpl);
    const u = new URL(url);
    if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) findings.push({ level: 'fail', id: 'http.tls', title: 'Remote server is not using HTTPS', detail: '', fix: '' });
    findings.push({ level: 'info', id: 'auth.scope', title: 'Tools not scanned (needs a token)', detail: 'Re-run with --token to check tools, annotations and transport behaviour after login.', fix: '' });
    return { server: { name: u.host + u.pathname }, protocolVersion: null, toolCount: null, authRequired: true, oauth, score: score(findings), findings };
  }
  if (!init.j?.result) throw new Error(`initialize failed: HTTP ${init.r.status} ${JSON.stringify(init.j)}`);
  await send('notifications/initialized', undefined, { notify: true });
  const list = await send('tools/list', {});
  const tools = list.j?.result?.tools || [];
  const promptsRes = init.j.result.capabilities?.prompts ? await send('prompts/list', {}) : null;
  const prompts = promptsRes?.j?.result?.prompts || [];
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
    errorLeak: (() => { const s = JSON.stringify(badTool.j || {}) + JSON.stringify(unknown.j || {}); const m = s.match(/(\s+at\s+[\w$.<>]+\s+\(|\/(home|usr|var|app|srv)\/[\w./-]+\.(js|ts|py)|Traceback \(most recent call last\))/); return m ? m[0].trim().slice(0, 80) : null; })(),
    unauthToolCallOk: Boolean(unauthCall && unauthCall.r.ok && unauthCall.j?.result && !unauthCall.j.result.isError),
    unauthToolCallName: ro?.name,
    allReadOnly: tools.length > 0 && tools.every((t) => t.annotations?.readOnlyHint === true || /^(get|list|search|read|fetch|resolve|query|find|ask)[_-]?/i.test(t.name)),
  };
  return report(init.j.result, tools, [...checkPrompts(prompts), ...checkHttp(obs)]);
}

export function report(init, tools, transport) {
  const findings = [...checkInit(init), ...checkTools(tools), ...transport];
  const contextBytes = JSON.stringify(tools).length;
  return { server: init?.serverInfo, protocolVersion: init?.protocolVersion, toolCount: tools.length, contextBytes, contextTokens: Math.round(contextBytes / 4), score: score(findings), findings };
}

export function toMarkdown(r, target) {
  const icon = { fail: '❌', warn: '⚠️', info: 'ℹ️', pass: '✅' };
  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  const rows = [...r.findings].sort((a, b) => order[a.level] - order[b.level]);
  return [`# MCP readiness report: ${r.server?.name || target}`, '',
    `Target: \`${target}\` · ${r.authRequired ? 'auth required (OAuth discovery checked)' : `protocol ${r.protocolVersion} · ${r.toolCount} tools`} · **score ${r.score}/100**`, '',
    ...rows.map((x) => `- ${icon[x.level]} **${x.title}**${x.detail ? ` — ${x.detail}` : ''}${x.fix ? `\n  - Fix: ${x.fix}` : ''}`), '',
    '_Automated surface checks only. They do not replace a design review of auth, data flows, and human-approval gates._'].join('\n');
}
