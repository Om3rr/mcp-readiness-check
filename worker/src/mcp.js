// Read-only Streamable HTTP MCP endpoint at POST /mcp.
// Stateless JSON-RPC (no sessions, no SSE). One tool: scan_mcp_server({url}).
import { checkTarget, resolvePublicTarget } from './guard.js';
import { escapeHtml } from './escape.js';
import { pagePath, savePage } from './pages.js';
import { pepperedIpHash } from './metrics.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_TOOL_NAME = 'scan_mcp_server';
export const MCP_RATE_PER_MINUTE = 10;
export const MCP_RATE_PER_DAY = 100;
const MAX_REQUEST_BYTES = 8192;
const MAX_RESPONSE_BYTES = 16384;
const MAX_FINDINGS = 8;

export const MCP_TOOLS = [{
  name: MCP_TOOL_NAME,
  title: 'Scan an MCP server',
  description: 'Read-only readiness scan of a public Streamable HTTP MCP server you are authorized to test. Returns a score, estimated tokens per turn, key findings, and a link to the full results page. Rate-limited. Surface checks only, not a security audit.',
  inputSchema: {
    type: 'object',
    properties: { url: { type: 'string', description: 'https URL of the MCP endpoint to scan' } },
    required: ['url'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}];

const jsonHeaders = {
  'content-type': 'application/json',
  'mcp-protocol-version': MCP_PROTOCOL_VERSION,
};

/** Site origins plus localhost / 127.0.0.1 / ::1 (any port) for local inspectors. */
export const MCP_SITE_ORIGINS = new Set([
  'https://mcp.pacerai.fit',
  'https://mcp-readiness.omer20sh.workers.dev',
]);
export const MCP_CORS_ALLOW_METHODS = 'POST, OPTIONS';
export const MCP_CORS_ALLOW_HEADERS = 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id';

export function mcpOriginHeader(request) {
  return String(request?.headers?.get('origin') || '').trim();
}

export function isAllowedMcpOrigin(origin) {
  if (!origin) return true; // no Origin: server-side agents and CLIs
  let u;
  try { u = new URL(origin); } catch { return false; }
  const normalized = `${u.protocol}//${u.host}`;
  if (MCP_SITE_ORIGINS.has(normalized) || MCP_SITE_ORIGINS.has(origin)) return true;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return u.protocol === 'http:' || u.protocol === 'https:';
  }
  return false;
}

/** CORS headers for an allowed browser Origin. No Origin means no ACAO (non-browser). */
export function mcpCorsHeaders(request) {
  const origin = mcpOriginHeader(request);
  const headers = { ...jsonHeaders, vary: 'Origin' };
  if (origin && isAllowedMcpOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = MCP_CORS_ALLOW_METHODS;
    headers['access-control-allow-headers'] = MCP_CORS_ALLOW_HEADERS;
  }
  return headers;
}

export function forbiddenOriginResponse() {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32000, message: 'Origin not allowed' },
  }), { status: 403, headers: { ...jsonHeaders, vary: 'Origin' } });
}

function textOf(value, max = 400) {
  return escapeHtml(String(value ?? '')).slice(0, max);
}

export async function rateLimitHashed(env, req, bucket, { perMinute = MCP_RATE_PER_MINUTE, perDay = MCP_RATE_PER_DAY } = {}) {
  if (!env?.LICENSES) return false;
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const hash = await pepperedIpHash(ip);
  const now = new Date();
  const minute = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  const mk = `rl:${bucket}:m:${hash}:${minute}`;
  const dk = `rl:${bucket}:d:${hash}:${day}`;
  const m = Number((await env.LICENSES.get(mk)) || 0);
  const d = Number((await env.LICENSES.get(dk)) || 0);
  if (m >= perMinute || d >= perDay) return false;
  await env.LICENSES.put(mk, String(m + 1), { expirationTtl: 120 });
  await env.LICENSES.put(dk, String(d + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

export function mcpToolResult(r, targetUrl, publicBase) {
  const issues = (r.findings || []).filter((f) => f.level === 'fail' || f.level === 'warn');
  const keyFindings = issues.slice(0, MAX_FINDINGS).map((f) => ({
    level: textOf(f.level, 16),
    id: textOf(f.id, 80),
    title: textOf(f.title, 240),
  }));
  const resultsUrl = `${String(publicBase || '').replace(/\/+$/, '')}${pagePath(targetUrl)}`;
  const payload = {
    url: textOf(targetUrl, 500),
    score: Number(r.score) || 0,
    tokensPerTurn: r.contextTokens ?? null,
    keyFindings,
    resultsUrl: textOf(resultsUrl, 500),
    note: 'Surface scan only. Not a security audit.',
  };
  let text = JSON.stringify(payload);
  if (text.length > MAX_RESPONSE_BYTES) {
    payload.keyFindings = payload.keyFindings.slice(0, 3);
    text = JSON.stringify(payload);
    if (text.length > MAX_RESPONSE_BYTES) text = text.slice(0, MAX_RESPONSE_BYTES - 1) + '…';
  }
  return {
    content: [{ type: 'text', text }],
    structuredContent: payload,
  };
}

function rpcResponse(id, result, error, request, status = 200) {
  const body = error
    ? { jsonrpc: '2.0', id: id ?? null, error }
    : { jsonrpc: '2.0', id: id ?? null, result };
  return new Response(JSON.stringify(body), { status, headers: request ? mcpCorsHeaders(request) : { ...jsonHeaders } });
}

async function callScanTool(req, env, msg, mark, scan) {
  const t = await resolvePublicTarget(msg.params?.arguments?.url);
  if (!t.ok) {
    return rpcResponse(msg.id, { isError: true, content: [{ type: 'text', text: `Rejected URL: ${textOf(t.error, 80)}` }] }, null, req);
  }
  if (!(await rateLimitHashed(env, req, 'mcp'))) {
    return rpcResponse(msg.id, { isError: true, content: [{ type: 'text', text: 'Rate limited. Try again later (limit 10/min, 100/day).' }] }, null, req);
  }
  if (mark) {
    mark.targetUrl = t.url;
    mark.events = ['scan_started'];
  }
  const r = await scan(env, t.url);
  const base = env.PUBLIC_URL || new URL(req.url).origin;
  const result = mcpToolResult(r, t.url, base);
  try {
    await savePage(env, t.url, {
      score: r.score,
      server: r.server?.name || null,
      toolCount: r.toolCount,
      contextTokens: r.contextTokens ?? null,
      top: result.structuredContent.keyFindings,
    });
  } catch { /* page cache is best-effort */ }
  if (mark) {
    mark.scan = 'success';
    mark.source = 'mcp';
  }
  return rpcResponse(msg.id, result, null, req);
}

export async function handleMcp(req, env, mark, scan) {
  const setMethod = (name) => { if (mark) mark.mcp_method = name; };
  const origin = mcpOriginHeader(req);
  if (origin && !isAllowedMcpOrigin(origin)) {
    setMethod('rejected_origin');
    return forbiddenOriginResponse();
  }

  if (req.method === 'OPTIONS') {
    setMethod('options');
    return new Response(null, { status: 204, headers: mcpCorsHeaders(req) });
  }
  if (req.method !== 'POST') {
    setMethod(req.method === 'GET' ? 'http_get' : req.method === 'HEAD' ? 'http_head' : 'http_other');
    return new Response(JSON.stringify({ error: 'method_not_allowed', detail: 'Use POST with JSON-RPC for Streamable HTTP.' }), {
      status: 405,
      headers: { ...mcpCorsHeaders(req), allow: 'POST, OPTIONS' },
    });
  }

  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    setMethod('invalid');
    return rpcResponse(null, null, { code: -32600, message: 'Request too large' }, req);
  }
  let msg;
  try { msg = raw ? JSON.parse(raw) : null; } catch { msg = null; }
  if (Array.isArray(msg) || !msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    setMethod('invalid');
    return rpcResponse(msg && !Array.isArray(msg) ? msg.id ?? null : null, null, { code: -32600, message: 'Invalid Request' }, req);
  }
  if (msg.id === undefined) {
    setMethod(String(msg.method).startsWith('notifications/') ? 'notification' : msg.method);
    return new Response(null, { status: 202, headers: mcpCorsHeaders(req) });
  }

  setMethod(msg.method);
  switch (msg.method) {
    case 'initialize':
      return rpcResponse(msg.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mcp-readiness', version: env.MCP_VERSION || '0.5.0' },
        instructions: 'Call scan_mcp_server with the https URL of a public MCP server you are authorized to test. No license key is required. The tool returns a score, tokens per turn, key findings, and a results page link. Surface scan only, not a security audit.',
      }, null, req);
    case 'ping':
      return rpcResponse(msg.id, {}, null, req);
    case 'tools/list':
      return rpcResponse(msg.id, { tools: MCP_TOOLS }, null, req);
    case 'tools/call': {
      if (msg.params?.name !== MCP_TOOL_NAME) return rpcResponse(msg.id, null, { code: -32602, message: 'Unknown tool' }, req);
      try {
        return await callScanTool(req, env, msg, mark, scan);
      } catch (e) {
        if (mark && mark.events && mark.events.includes('scan_started') && !mark.scan) mark.scan = 'fail';
        return rpcResponse(msg.id, { isError: true, content: [{ type: 'text', text: `Scan failed: ${textOf(e?.message || e, 200)}` }] }, null, req);
      }
    }
    default:
      setMethod('unknown_method');
      return rpcResponse(msg.id, null, { code: -32601, message: 'Method not found' }, req);
  }
}
