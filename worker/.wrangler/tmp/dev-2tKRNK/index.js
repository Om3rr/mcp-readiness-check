var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../src/checks.js
var RISKY = /(^|_|-)(delete|remove|drop|destroy|purge|send|post|publish|pay|charge|transfer|refund|exec|execute|run|shell|command|write|update|create|approve|deploy|kill|revoke|grant|email|sms|message)(_|-|$)/i;
var POISON = [
  [/ignore (all |any )?(previous|prior|above) (instructions|messages)/i, "tells the model to ignore previous instructions"],
  [/<\s*(important|system|secret|instructions?)\s*>/i, "contains hidden-instruction tags like <IMPORTANT>"],
  [/(do not|don't|never) (tell|inform|mention|show)( this to)? (the )?user/i, "asks the model to hide something from the user"],
  [/\b(read|cat|open|load|send|upload|include|attach)\b[^.\n]{0,40}(~\/\.ssh|\.ssh\/|id_rsa|id_ed25519|\.env\b|\.aws\/|\.npmrc|\.netrc|credentials\.json|mcp\.json)/i, "references secrets or credential files"],
  [/\b(send|upload|forward|post|pass|include|exfiltrate)\b[^.\n]{0,30}\b(the user'?s|all|any|their)\b[^.\n]{0,20}\b(passwords?|tokens?|api[_ ]?keys?|secrets?|private keys?|seed phrases?)\b[^.\n]{0,30}\b(to|into|as)\b/i, "asks the model to forward user secrets"],
  [/[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E]/, "contains invisible or bidi-control unicode"],
  [/[A-Za-z0-9+/]{120,}={0,2}/, "contains a long base64-like blob"]
];
var NAME = /^[a-zA-Z0-9_.-]{1,64}$/;
function checkTools(tools = []) {
  const f = [];
  const add = /* @__PURE__ */ __name((level, id, title, detail = "", fix = "") => f.push({ id, level, title, detail, fix }), "add");
  if (!tools.length) {
    add("warn", "tools.none", "Server exposes no tools");
    return f;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const t of tools) {
    const n = t.name || "(unnamed)";
    if (seen.has(n)) add("fail", "tools.duplicate", `Duplicate tool name "${n}"`, "", "Tool names must be unique.");
    seen.add(n);
    if (!NAME.test(n)) add("warn", "tools.name", `Tool name "${n}" is not portable`, "Some clients reject names outside [a-zA-Z0-9_.-], max 64 chars.", "Rename to snake_case ASCII.");
    const d = t.description || "";
    if (d.trim().length < 20) add("warn", "tools.description", `"${n}" has little or no description`, "Models choose tools from descriptions; vague ones cause wrong or unsafe calls.", "Describe what it does, side effects, and when NOT to use it.");
    if (d.length > 1500) add("warn", "tools.description_long", `"${n}" description is ${d.length} chars`, "Long descriptions burn context on every turn and hide instructions.", "Keep under ~1,000 chars; move docs to resources.");
    const blob = `${d} ${JSON.stringify(t.inputSchema || {})}`;
    for (const [re, why] of POISON) if (re.test(blob)) add("fail", "tools.poisoning", `"${n}" looks like tool poisoning: it ${why}`, "Tool metadata is injected straight into the model context.", "Remove instructions aimed at the model from tool metadata.");
    const s = t.inputSchema;
    if (!s || s.type !== "object") add("fail", "schema.type", `"${n}" inputSchema is missing or not type "object"`, "The MCP spec requires a JSON Schema object.", 'Set inputSchema: { type: "object", properties: {...} }.');
    else {
      const props = Object.keys(s.properties || {});
      if (props.length && !Array.isArray(s.required)) add("info", "schema.required", `"${n}" declares no required fields`, "", "List required args so clients validate before calling.");
      const untyped = props.filter((p) => !s.properties[p]?.type && !s.properties[p]?.enum && !s.properties[p]?.anyOf && !s.properties[p]?.oneOf);
      if (untyped.length) add("warn", "schema.untyped", `"${n}" has untyped args: ${untyped.join(", ")}`, "", "Give every property a type.");
    }
    if (/^(search|fetch|read|write|query|get|list|run|execute|read_file|write_file)$/i.test(n)) add("info", "tools.generic_name", `"${n}" is a generic name`, "With several servers connected, generic names collide or get shadowed by another server's tool.", 'Prefix tool names with the server or domain, e.g. "acme_search".');
    const a = t.annotations || {};
    if (RISKY.test(n) && a.destructiveHint === void 0 && a.readOnlyHint === void 0)
      add("warn", "annotations.risky", `"${n}" sounds state-changing but has no annotations`, "Clients use readOnlyHint/destructiveHint/idempotentHint to decide when to ask the human first.", "Add annotations, e.g. { destructiveHint: true } or { readOnlyHint: true }.");
  }
  const untitled = tools.filter((t) => !t.title && !t.annotations?.title).map((t) => t.name);
  if (untitled.length) add("info", "tools.title", `${untitled.length} of ${tools.length} tools have no human-readable title`, `Since 2025-06-18 clients show the title in approval prompts. Missing: ${untitled.slice(0, 6).join(", ")}${untitled.length > 6 ? "\u2026" : ""}`, 'Add title: "\u2026" to each tool.');
  const annotated = tools.filter((t) => t.annotations && Object.keys(t.annotations).length).length;
  if (!annotated) add("warn", "annotations.none", "No tool declares annotations", `0 of ${tools.length} tools have readOnlyHint/destructiveHint.`, "Annotate every tool; mark reads readOnlyHint: true.");
  if (tools.length > 40) add("warn", "tools.many", `${tools.length} tools exposed`, "Large tool lists degrade tool selection and cost context.", "Group or split into toolsets.");
  if (!f.some((x) => x.level === "fail" || x.level === "warn")) add("pass", "tools.ok", `All ${tools.length} tools look clean`);
  return f;
}
__name(checkTools, "checkTools");
function checkPrompts(prompts = []) {
  const f = [];
  for (const p of prompts) {
    const blob = `${p.description || ""} ${JSON.stringify(p.arguments || [])}`;
    for (const [re, why] of POISON) if (re.test(blob)) f.push({ level: "fail", id: "prompts.poisoning", title: `Prompt "${p.name}" looks poisoned: it ${why}`, detail: "", fix: "Remove model-directed instructions from prompt metadata." });
  }
  return f;
}
__name(checkPrompts, "checkPrompts");
function checkHttp(obs) {
  const f = [];
  const add = /* @__PURE__ */ __name((level, id, title, detail = "", fix = "") => f.push({ id, level, title, detail, fix }), "add");
  const u = new URL(obs.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) add("fail", "http.tls", "Remote server is not using HTTPS", "", "Serve MCP over TLS only.");
  if (obs.unauthToolsList && !obs.authProvided) add("info", "http.auth", "tools/list works without credentials", "Fine for public read-only servers; otherwise require OAuth 2.1 / bearer auth.", "Return 401 with WWW-Authenticate for protected servers.");
  if (obs.unauthToolCallOk) add("fail", "http.auth_call", "A tool call succeeded without credentials", `Called "${obs.unauthToolCallName}" with no auth.`, "Require auth for every non-public tool.");
  const publicRO = !obs.authProvided && obs.unauthToolsList && obs.allReadOnly;
  if (obs.acao === "*") add(publicRO ? "info" : "warn", "http.cors", "CORS allows any origin (Access-Control-Allow-Origin: *)", "Any website the user visits can script calls to this server from the browser.", "Allow-list known origins.");
  if (obs.evilOriginAccepted) add(local ? "fail" : publicRO ? "info" : "warn", "http.origin", "Requests with a foreign Origin header are accepted", "The MCP Streamable HTTP spec says servers MUST validate Origin to prevent DNS-rebinding attacks, which matters most for localhost servers.", "Reject requests whose Origin is not on an allow-list (403).");
  if (obs.unknownMethodCode !== -32601) add("warn", "rpc.method_not_found", "Unknown methods do not return JSON-RPC -32601", `Got ${JSON.stringify(obs.unknownMethodCode)}.`, "Return error code -32601 for unknown methods.");
  if (obs.badToolStatus >= 500) add("warn", "rpc.unknown_tool", "Calling an unknown tool crashes with HTTP 5xx", "", "Return a JSON-RPC error or isError: true result.");
  if (!obs.sessionHeader) add("info", "http.session", "No Mcp-Session-Id issued", "Fine for stateless servers.", "");
  else if (obs.sessionHeader.length < 16 || /^\d+$/.test(obs.sessionHeader)) add("warn", "http.session_entropy", "Mcp-Session-Id looks guessable", `"${obs.sessionHeader}"`, "Use a cryptographically random id (e.g. a UUID).");
  if (obs.errorLeak) add("warn", "rpc.error_leak", "Error responses leak internals", obs.errorLeak, "Return short error messages; log stack traces server-side.");
  return f;
}
__name(checkHttp, "checkHttp");
function checkInit(init) {
  const f = [];
  if (!init?.protocolVersion) f.push({ level: "fail", id: "init.version", title: "initialize did not return a protocolVersion", detail: "", fix: "" });
  if (!init?.serverInfo?.name || !init?.serverInfo?.version) f.push({ level: "warn", id: "init.serverInfo", title: "serverInfo name/version missing", detail: "", fix: "Return serverInfo { name, version }." });
  const v = init?.protocolVersion || "";
  if (v && v < "2025-03-26") f.push({ level: "warn", id: "init.old_protocol", title: `Old protocol version ${v}`, detail: "Pre-2025-03-26 servers lack Streamable HTTP, annotations and the OAuth discovery flow.", fix: "Upgrade the MCP SDK." });
  if (!init?.instructions) f.push({ level: "info", id: "init.instructions", title: "No server instructions", detail: "Instructions are the right place for safety rules (what needs human approval).", fix: "" });
  return f;
}
__name(checkInit, "checkInit");
function score(findings) {
  const pen = { fail: 15, warn: 5, info: 0, pass: 0 };
  return Math.max(0, 100 - findings.reduce((s, x) => s + pen[x.level], 0));
}
__name(score, "score");

// ../src/oauth.js
var j = /* @__PURE__ */ __name(async (u, fetchImpl) => {
  try {
    const r = await fetchImpl(u, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}, "j");
function parseWwwAuth(h = "") {
  const out = { scheme: (h.match(/^\s*(\w+)/) || [])[1] || null };
  for (const m of h.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
__name(parseWwwAuth, "parseWwwAuth");
async function probeOAuth(url, res, fetchImpl = fetch) {
  const f = [];
  const add = /* @__PURE__ */ __name((level, id, title, detail = "", fix = "") => f.push({ id, level, title, detail, fix }), "add");
  const u = new URL(url);
  const www = parseWwwAuth(res.headers.get("www-authenticate") || "");
  add("pass", "auth.required", "Unauthenticated requests are rejected with 401");
  if (!www.scheme) add("warn", "auth.www_authenticate", "401 without a WWW-Authenticate header", "Clients cannot discover how to authenticate.", 'Return WWW-Authenticate: Bearer resource_metadata="\u2026".');
  else if (!/bearer/i.test(www.scheme)) add("info", "auth.scheme", `WWW-Authenticate scheme is ${www.scheme}, not Bearer`);
  if (www.resource_metadata && !/^https?:\/\//i.test(www.resource_metadata)) {
    add("warn", "auth.prm_relative", "resource_metadata is a relative URL", `Got "${www.resource_metadata}". RFC 9728 requires an absolute URL; some clients will not resolve it.`, "Send the full https:// URL.");
    try {
      www.resource_metadata = new URL(www.resource_metadata, u.origin).href;
    } catch {
    }
  }
  const candidates = [www.resource_metadata, `${u.origin}/.well-known/oauth-protected-resource${u.pathname === "/" ? "" : u.pathname}`, `${u.origin}/.well-known/oauth-protected-resource`].filter(Boolean);
  let prm = null, prmUrl = null;
  for (const c of candidates) {
    prm = await j(c, fetchImpl);
    if (prm) {
      prmUrl = c;
      break;
    }
  }
  if (www.resource_metadata && prmUrl !== www.resource_metadata) add("fail", "auth.prm_broken", "The 401 points at protected-resource metadata that does not load", `resource_metadata="${www.resource_metadata}" did not return JSON.`, "Serve RFC 9728 JSON at that exact URL (resource, authorization_servers), or fix the pointer.");
  if (!www.resource_metadata) add("info", "auth.resource_metadata_hint", "WWW-Authenticate has no resource_metadata pointer", "The 2025-06-18 spec has servers point clients at RFC 9728 metadata from the 401.", 'Add resource_metadata="https://\u2026/.well-known/oauth-protected-resource".');
  let as;
  if (!prm) {
    const legacy = await j(`${u.origin}/.well-known/oauth-authorization-server`, fetchImpl);
    if (!legacy) {
      add("warn", "auth.prm_missing", "No OAuth protected-resource metadata (RFC 9728) found", `Tried ${candidates.length} well-known locations.`, "Serve /.well-known/oauth-protected-resource with authorization_servers.");
      return { findings: f, oauth: { www } };
    }
    add("warn", "auth.legacy_discovery", "Uses the older 2025-03-26 discovery (AS metadata on the MCP host, no RFC 9728)", "Clients built for the 2025-06-18 spec look for protected-resource metadata first.", "Also publish /.well-known/oauth-protected-resource.");
    as = u.origin;
  } else {
    add("pass", "auth.prm", "Protected-resource metadata (RFC 9728) published", prmUrl);
    as = prm.authorization_servers?.[0];
  }
  if (!as) {
    add("warn", "auth.prm_no_as", "Protected-resource metadata lists no authorization_servers");
    return { findings: f, oauth: { www, prm } };
  }
  const asu = new URL(as);
  const asMeta = await j(`${asu.origin}/.well-known/oauth-authorization-server${asu.pathname === "/" ? "" : asu.pathname}`, fetchImpl) || await j(`${asu.origin}/.well-known/oauth-authorization-server`, fetchImpl) || await j(`${asu.origin}/.well-known/openid-configuration${asu.pathname === "/" ? "" : asu.pathname}`, fetchImpl);
  if (!asMeta) {
    add("warn", "auth.as_meta", "Authorization-server metadata (RFC 8414) not found", as);
    return { findings: f, oauth: { www, prm } };
  }
  add("pass", "auth.as_meta", "Authorization-server metadata found", asMeta.issuer || as);
  const pkce = asMeta.code_challenge_methods_supported || [];
  if (!pkce.includes("S256")) add("warn", "auth.pkce", "Authorization server does not advertise PKCE S256", `code_challenge_methods_supported: ${JSON.stringify(pkce)}`, "OAuth 2.1 / MCP require PKCE with S256.");
  else add("pass", "auth.pkce", "PKCE S256 advertised");
  if (!asMeta.registration_endpoint) add("info", "auth.dcr", "No dynamic client registration endpoint", "Generic MCP clients then need a pre-registered client id.");
  else add("pass", "auth.dcr", "Dynamic client registration available");
  return { findings: f, oauth: { www, prm, as: asMeta.issuer || as } };
}
__name(probeOAuth, "probeOAuth");

// ../src/probe.js
var INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-readiness-check", version: "0.2.0" } };
async function parseBody(r) {
  const t = await r.text();
  if ((r.headers.get("content-type") || "").includes("text/event-stream")) {
    const data = t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    return data.length ? JSON.parse(data.at(-1)) : null;
  }
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
__name(parseBody, "parseBody");
async function probeHttp(url, { token, timeoutMs = 15e3, fetchImpl = globalThis.fetch } = {}) {
  let id = 0, session = null;
  const send = /* @__PURE__ */ __name(async (method, params, { auth = true, origin, notify = false } = {}) => {
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": INIT.protocolVersion };
    if (auth && token) h.authorization = `Bearer ${token}`;
    if (session) h["mcp-session-id"] = session;
    if (origin) h.origin = origin;
    const body = notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++id, method, params };
    const r = await fetchImpl(url, { method: "POST", headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    session ??= r.headers.get("mcp-session-id");
    return { r, j: notify ? null : await parseBody(r) };
  }, "send");
  const init = await send("initialize", INIT);
  if ((init.r.status === 401 || init.r.status === 403) && !token) {
    const { findings, oauth } = await probeOAuth(url, init.r, fetchImpl);
    const u = new URL(url);
    if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) findings.push({ level: "fail", id: "http.tls", title: "Remote server is not using HTTPS", detail: "", fix: "" });
    findings.push({ level: "info", id: "auth.scope", title: "Tools not scanned (needs a token)", detail: "Re-run with --token to check tools, annotations and transport behaviour after login.", fix: "" });
    return { server: { name: u.host + u.pathname }, protocolVersion: null, toolCount: null, authRequired: true, oauth, score: score(findings), findings };
  }
  if (!init.j?.result) throw new Error(`initialize failed: HTTP ${init.r.status} ${JSON.stringify(init.j)}`);
  await send("notifications/initialized", void 0, { notify: true });
  const list = await send("tools/list", {});
  const tools = list.j?.result?.tools || [];
  const promptsRes = init.j.result.capabilities?.prompts ? await send("prompts/list", {}) : null;
  const prompts = promptsRes?.j?.result?.prompts || [];
  const unauth = await send("tools/list", {}, { auth: false });
  const evil = await send("tools/list", {}, { origin: "https://evil.example" });
  const unknown = await send("no/such_method", {});
  const badTool = await send("tools/call", { name: "__no_such_tool__", arguments: {} });
  const ro = tools.find((t) => t.annotations?.readOnlyHint || /^(get|list|search|read|inbox)/i.test(t.name) && !(t.inputSchema?.required || []).length);
  let unauthCall = null;
  if (ro && token) unauthCall = await send("tools/call", { name: ro.name, arguments: {} }, { auth: false });
  const obs = {
    url,
    authProvided: Boolean(token),
    acao: init.r.headers.get("access-control-allow-origin"),
    sessionHeader: session,
    unauthToolsList: Boolean(unauth.j?.result?.tools),
    evilOriginAccepted: evil.r.ok && Boolean(evil.j?.result),
    unknownMethodCode: unknown.j?.error?.code ?? null,
    badToolStatus: badTool.r.status,
    errorLeak: (() => {
      const s = JSON.stringify(badTool.j || {}) + JSON.stringify(unknown.j || {});
      const m = s.match(/(\s+at\s+[\w$.<>]+\s+\(|\/(home|usr|var|app|srv)\/[\w./-]+\.(js|ts|py)|Traceback \(most recent call last\))/);
      return m ? m[0].trim().slice(0, 80) : null;
    })(),
    unauthToolCallOk: Boolean(unauthCall && unauthCall.r.ok && unauthCall.j?.result && !unauthCall.j.result.isError),
    unauthToolCallName: ro?.name,
    allReadOnly: tools.length > 0 && tools.every((t) => t.annotations?.readOnlyHint === true || /^(get|list|search|read|fetch|resolve|query|find|ask)[_-]?/i.test(t.name))
  };
  return report(init.j.result, tools, [...checkPrompts(prompts), ...checkHttp(obs)]);
}
__name(probeHttp, "probeHttp");
function report(init, tools, transport) {
  const findings = [...checkInit(init), ...checkTools(tools), ...transport];
  const contextBytes = JSON.stringify(tools).length;
  return { server: init?.serverInfo, protocolVersion: init?.protocolVersion, toolCount: tools.length, contextBytes, contextTokens: Math.round(contextBytes / 4), score: score(findings), findings };
}
__name(report, "report");

// ../src/html.js
var esc = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
var LV = { fail: ["Fail", "#dc2626"], warn: ["Warn", "#d97706"], info: ["Info", "#2563eb"], pass: ["Pass", "#059669"] };
var ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };
var CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#0f172a;--mut:#64748b;--card:#f8fafc;--bd:#e2e8f0}
@media(prefers-color-scheme:dark){:root{--bg:#0b1120;--fg:#e2e8f0;--mut:#94a3b8;--card:#111827;--bd:#1f2937}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:860px;margin:auto;padding:32px 20px}h1{font-size:24px;margin:0 0 4px}.mut{color:var(--mut)}
.score{display:flex;gap:20px;align-items:center;margin:20px 0;padding:18px;border:1px solid var(--bd);border-radius:14px;background:var(--card)}
.ring{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font-size:28px;font-weight:700}
.counts span{display:inline-block;margin-right:14px}.f{border:1px solid var(--bd);border-left-width:4px;border-radius:10px;padding:10px 14px;margin:10px 0;background:var(--card)}
.f b{display:block}.tag{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}.fix{margin-top:4px;font-size:14px}
table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:8px 10px;border-bottom:1px solid var(--bd);text-align:left;font-size:14px}th{color:var(--mut);font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}a{color:#2563eb}footer{margin-top:28px;font-size:13px}code{font-family:ui-monospace,Menlo,monospace;font-size:13px}`;
var ringColor = /* @__PURE__ */ __name((s) => s == null ? "#64748b" : s >= 90 ? "#059669" : s >= 70 ? "#d97706" : "#dc2626", "ringColor");
var page = /* @__PURE__ */ __name((title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap">${body}
<footer class="mut">Generated by mcp-readiness-check on ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ")} UTC. These are automated surface checks. They do not replace a design review of auth, data flows and human-approval gates.</footer></div></body></html>`, "page");
function toHtml(r, target) {
  const counts = Object.fromEntries(Object.keys(LV).map((k) => [k, r.findings.filter((f) => f.level === k).length]));
  const items = [...r.findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]).map((f) => `<div class="f" style="border-left-color:${LV[f.level][1]}"><span class="tag" style="color:${LV[f.level][1]}">${LV[f.level][0]}</span><b>${esc(f.title)}</b>${f.detail ? `<div class="mut">${esc(f.detail)}</div>` : ""}${f.fix ? `<div class="fix">Fix: ${esc(f.fix)}</div>` : ""}</div>`).join("");
  const meta = r.authRequired ? "Authentication required; OAuth discovery checked" : `Protocol ${esc(r.protocolVersion)} \xB7 ${r.toolCount} tools`;
  return page(`MCP readiness: ${r.server?.name || target}`, `<h1>MCP readiness report</h1><div class="mut">${esc(r.server?.name || "")} \xB7 <code>${esc(target)}</code></div>
<div class="score"><div class="ring" style="border:8px solid ${ringColor(r.score)}">${r.score}</div><div><div><b>${meta}</b></div><div class="counts mut">${Object.entries(counts).map(([k, v]) => `<span style="color:${LV[k][1]}">${LV[k][0]} ${v}</span>`).join("")}</div></div></div>${items}`);
}
__name(toHtml, "toHtml");

// src/guard.js
var PRIVATE = [/^localhost$/i, /\.local$/i, /\.internal$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i, /^\[?fe80:/i, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
function checkTarget(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (u.protocol !== "https:") return { ok: false, error: "https_only" };
  if (u.username || u.password) return { ok: false, error: "no_credentials_in_url" };
  if (u.port && u.port !== "443") return { ok: false, error: "port_443_only" };
  if (PRIVATE.some((re) => re.test(u.hostname))) return { ok: false, error: "private_address" };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return { ok: false, error: "hostname_required" };
  u.hash = "";
  return { ok: true, url: u.href };
}
__name(checkTarget, "checkTarget");

// src/license.js
var PLANS = {
  free: { label: "Free", quota: 0, monthly: false },
  pack: { label: "Report pack ($9 one-off)", quota: 5, monthly: false },
  // one-off credits
  org: { label: "Action Org ($29/mo)", quota: 5e3, monthly: true },
  // unlimited-feel CI tier
  indie: { label: "API Indie ($19/mo)", quota: 500, monthly: true },
  team: { label: "API Team ($99/mo)", quota: 1e4, monthly: true },
  credits: { label: "Pay-per-scan credits (100 x $0.10)", quota: 100, monthly: false }
};
var hex = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
var sha256 = /* @__PURE__ */ __name(async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), "sha256");
var newKey = /* @__PURE__ */ __name(() => `mrc_live_${hex(crypto.getRandomValues(new Uint8Array(20)))}`, "newKey");
var period = /* @__PURE__ */ __name((d = /* @__PURE__ */ new Date()) => d.toISOString().slice(0, 7), "period");
async function issueLicense(env, { plan, source, ref, email }) {
  if (!PLANS[plan] || plan === "free") throw new Error(`unknown plan ${plan}`);
  const key = newKey();
  const lic = { plan, status: "active", used: 0, quota: PLANS[plan].quota, period: period(), source, ref, email: email || null, created: (/* @__PURE__ */ new Date()).toISOString() };
  await env.LICENSES.put(`lic:${await sha256(key)}`, JSON.stringify(lic));
  return key;
}
__name(issueLicense, "issueLicense");
async function getLicense(env, key) {
  if (!key || !/^mrc_(live|test)_[0-9a-f]{40}$/.test(key)) return null;
  const h = await sha256(key);
  const raw = await env.LICENSES.get(`lic:${h}`);
  if (!raw) return null;
  const lic = JSON.parse(raw);
  if (PLANS[lic.plan]?.monthly && lic.period !== period()) {
    lic.period = period();
    lic.used = 0;
    await env.LICENSES.put(`lic:${h}`, JSON.stringify(lic));
  }
  return { ...lic, hash: h, remaining: Math.max(0, lic.quota - lic.used) };
}
__name(getLicense, "getLicense");
async function consume(env, key) {
  const lic = await getLicense(env, key);
  if (!lic) return { ok: false, error: "invalid_license" };
  if (lic.status !== "active") return { ok: false, error: `license_${lic.status}`, lic };
  if (lic.remaining <= 0) return { ok: false, error: "quota_exhausted", lic };
  const { hash, remaining, ...store } = lic;
  store.used += 1;
  await env.LICENSES.put(`lic:${hash}`, JSON.stringify(store));
  return { ok: true, lic: { ...store, remaining: remaining - 1 } };
}
__name(consume, "consume");
async function setStatusByRef(env, ref, status, { resetUsage = false } = {}) {
  const h = await env.LICENSES.get(`ref:${ref}`);
  if (!h) return false;
  const raw = await env.LICENSES.get(`lic:${h}`);
  if (!raw) return false;
  const lic = JSON.parse(raw);
  lic.status = status;
  if (resetUsage) {
    lic.used = 0;
    lic.period = period();
  }
  await env.LICENSES.put(`lic:${h}`, JSON.stringify(lic));
  return true;
}
__name(setStatusByRef, "setStatusByRef");
async function linkRef(env, ref, key) {
  await env.LICENSES.put(`ref:${ref}`, await sha256(key));
}
__name(linkRef, "linkRef");

// src/webhooks.js
var enc = new TextEncoder();
var hex2 = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex2(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
__name(hmacHex, "hmacHex");
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(safeEq, "safeEq");
var json = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }), "json");
var parseMap = /* @__PURE__ */ __name((s) => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}, "parseMap");
async function verifyStripe(body, header, secret, now = Date.now(), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).map(([k, ...v]) => [k.trim(), v.join("=")]));
  const sigs = header.split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now / 1e3 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => safeEq(s, expected));
}
__name(verifyStripe, "verifyStripe");
async function verifyLemon(body, header, secret) {
  if (!header || !secret) return false;
  return safeEq(header, await hmacHex(secret, body));
}
__name(verifyLemon, "verifyLemon");
async function handleStripe(req, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "stripe_not_configured" }, 501);
  const body = await req.text();
  if (!await verifyStripe(body, req.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET)) return json({ error: "bad_signature" }, 400);
  const ev = JSON.parse(body);
  const o = ev.data?.object || {};
  if (await env.LICENSES.get(`evt:${ev.id}`)) return json({ ok: true, duplicate: true });
  const res = await stripeEvent(ev, o, env);
  if (res.status < 300) await env.LICENSES.put(`evt:${ev.id}`, "1", { expirationTtl: 60 * 60 * 24 * 7 });
  return res;
}
__name(handleStripe, "handleStripe");
async function stripeEvent(ev, o, env) {
  switch (ev.type) {
    case "checkout.session.completed": {
      const plan = o.metadata?.plan || parseMap(env.STRIPE_PLAN_BY_LINK)[o.payment_link];
      if (!plan) return json({ ok: true, ignored: "no_plan_mapping" });
      const ref = o.subscription || o.id;
      const key = await issueLicense(env, { plan, source: "stripe", ref, email: o.customer_details?.email });
      await linkRef(env, ref, key);
      await env.LICENSES.put(`claim:${o.id}`, key, { expirationTtl: 60 * 60 * 24 });
      return json({ ok: true, issued: plan });
    }
    case "invoice.paid":
      if (o.subscription && o.billing_reason === "subscription_cycle") await setStatusByRef(env, o.subscription, "active", { resetUsage: true });
      return json({ ok: true });
    case "customer.subscription.deleted":
      await setStatusByRef(env, o.id, "cancelled");
      return json({ ok: true });
    case "invoice.payment_failed":
      if (o.subscription) await setStatusByRef(env, o.subscription, "past_due");
      return json({ ok: true });
    default:
      return json({ ok: true, ignored: ev.type });
  }
}
__name(stripeEvent, "stripeEvent");
async function handleLemon(req, env) {
  if (!env.LEMON_WEBHOOK_SECRET) return json({ error: "lemonsqueezy_not_configured" }, 501);
  const body = await req.text();
  if (!await verifyLemon(body, req.headers.get("x-signature"), env.LEMON_WEBHOOK_SECRET)) return json({ error: "bad_signature" }, 400);
  const ev = JSON.parse(body);
  const name = ev.meta?.event_name;
  const a = ev.data?.attributes || {};
  const id = String(ev.data?.id || "");
  const map = parseMap(env.LEMON_PLAN_BY_VARIANT);
  switch (name) {
    case "order_created": {
      const variant = String(a.first_order_item?.variant_id ?? "");
      const plan = ev.meta?.custom_data?.plan || map[variant];
      if (!plan || ["org", "indie", "team"].includes(plan)) return json({ ok: true, ignored: "subscription_order_or_unmapped" });
      if (await env.LICENSES.get(`ref:ls_order_${id}`)) return json({ ok: true, duplicate: true });
      const key = await issueLicense(env, { plan, source: "lemonsqueezy", ref: `ls_order_${id}`, email: a.user_email });
      await linkRef(env, `ls_order_${id}`, key);
      await env.LICENSES.put(`claim:ls_${a.identifier || id}`, key, { expirationTtl: 60 * 60 * 24 });
      return json({ ok: true, issued: plan });
    }
    case "subscription_created": {
      const plan = ev.meta?.custom_data?.plan || map[String(a.variant_id)];
      if (!plan) return json({ ok: true, ignored: "no_plan_mapping" });
      if (await env.LICENSES.get(`ref:ls_sub_${id}`)) return json({ ok: true, duplicate: true });
      const key = await issueLicense(env, { plan, source: "lemonsqueezy", ref: `ls_sub_${id}`, email: a.user_email });
      await linkRef(env, `ls_sub_${id}`, key);
      await env.LICENSES.put(`claim:ls_${a.order_id}`, key, { expirationTtl: 60 * 60 * 24 });
      return json({ ok: true, issued: plan });
    }
    case "subscription_payment_success":
      await setStatusByRef(env, `ls_sub_${a.subscription_id}`, "active", { resetUsage: true });
      return json({ ok: true });
    case "subscription_cancelled":
    case "subscription_expired":
      await setStatusByRef(env, `ls_sub_${id}`, name === "subscription_expired" ? "expired" : "cancelled");
      return json({ ok: true });
    default:
      return json({ ok: true, ignored: name });
  }
}
__name(handleLemon, "handleLemon");

// src/badge.js
function badge(score2) {
  const s = score2 == null ? "n/a" : String(score2);
  const color = score2 == null ? "#9f9f9f" : score2 >= 90 ? "#3fb950" : score2 >= 70 ? "#d29922" : "#e5534b";
  const l = "MCP readiness", lw = 92, rw = 8 + s.length * 7 + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${l}: ${s}"><title>${l}: ${s}</title><linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${lw + rw}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${lw + rw}" height="20" fill="url(#g)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">${l}</text><text x="${lw + rw / 2}" y="14">${s}</text></g></svg>`;
}
__name(badge, "badge");

// src/monitor.js
var LIMIT = { indie: 3, team: 25, org: 5 };
var json2 = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "content-type": "application/json" } }), "json");
async function registerMonitor(req, env, key) {
  const lic = await getLicense(env, key);
  if (!lic || lic.status !== "active") return json2({ error: "invalid_license" }, 401);
  const max = LIMIT[lic.plan] || 0;
  if (!max) return json2({ error: "plan_has_no_monitoring" }, 402);
  const body = await req.json().catch(() => ({}));
  const t = checkTarget(body.url);
  if (!t.ok) return json2({ error: t.error }, 400);
  const hook = body.webhook ? checkTarget(body.webhook) : { ok: true, url: null };
  if (!hook.ok) return json2({ error: `webhook_${hook.error}` }, 400);
  const k = `mon:${lic.hash}`;
  const list = JSON.parse(await env.LICENSES.get(k) || "[]").filter((m) => m.url !== t.url);
  if (body.remove) {
    await env.LICENSES.put(k, JSON.stringify(list));
    return json2({ ok: true, monitors: list.length });
  }
  if (list.length >= max) return json2({ error: "monitor_limit", max }, 402);
  list.push({ url: t.url, webhook: hook.url, last: null, at: null });
  await env.LICENSES.put(k, JSON.stringify(list));
  await env.LICENSES.put(`monidx:${lic.hash}`, "1");
  return json2({ ok: true, monitors: list.length, max });
}
__name(registerMonitor, "registerMonitor");
function drift(prev, r) {
  if (!prev) return null;
  const ids = r.findings.filter((f) => f.level === "fail" || f.level === "warn").map((f) => `${f.id}:${f.title}`);
  const added = ids.filter((x) => !prev.ids.includes(x));
  const fixed = prev.ids.filter((x) => !ids.includes(x));
  const ctxDelta = (r.contextTokens ?? 0) - (prev.contextTokens ?? 0);
  if (r.score === prev.score && !added.length && !fixed.length && Math.abs(ctxDelta) < 500) return null;
  return { scoreFrom: prev.score, scoreTo: r.score, added, fixed, contextTokensDelta: ctxDelta };
}
__name(drift, "drift");
async function runMonitors(env, scan2, fetchImpl = fetch) {
  let cursor;
  let checked = 0, alerts = 0;
  do {
    const page2 = await env.LICENSES.list({ prefix: "monidx:", cursor });
    for (const { name } of page2.keys) {
      const hash = name.slice("monidx:".length);
      const k = `mon:${hash}`;
      const list = JSON.parse(await env.LICENSES.get(k) || "[]");
      for (const m of list) {
        let r;
        try {
          r = await scan2(env, m.url);
        } catch (e) {
          r = { score: 0, contextTokens: null, findings: [{ level: "fail", id: "monitor.unreachable", title: String(e.message).slice(0, 120) }] };
        }
        checked++;
        const d = drift(m.last, r);
        if (d && m.webhook) {
          alerts++;
          await fetchImpl(m.webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "mcp_readiness.drift", url: m.url, ...d, at: (/* @__PURE__ */ new Date()).toISOString() }) }).catch(() => {
          });
        }
        m.last = { score: r.score, contextTokens: r.contextTokens ?? null, ids: r.findings.filter((f) => f.level === "fail" || f.level === "warn").map((f) => `${f.id}:${f.title}`) };
        m.at = (/* @__PURE__ */ new Date()).toISOString();
      }
      await env.LICENSES.put(k, JSON.stringify(list));
    }
    cursor = page2.list_complete ? null : page2.cursor;
  } while (cursor);
  return { checked, alerts };
}
__name(runMonitors, "runMonitors");

// src/index.js
var VERSION = "0.3.0";
var ORDER2 = { fail: 0, warn: 1, info: 2, pass: 3 };
var json3 = /* @__PURE__ */ __name((o, status = 200, extra = {}) => new Response(JSON.stringify(o, null, 1), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra } }), "json");
var bearer = /* @__PURE__ */ __name((req, url) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "", "bearer");
async function rateLimit(env, req, bucket, limit) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const k = `rl:${bucket}:${ip}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 13)}`;
  const n = Number(await env.LICENSES.get(k) || 0);
  if (n >= limit) return false;
  await env.LICENSES.put(k, String(n + 1), { expirationTtl: 3700 });
  return true;
}
__name(rateLimit, "rateLimit");
async function scan(env, target, opts = {}) {
  const r = await probeHttp(target, { timeoutMs: Number(env.SCAN_TIMEOUT_MS || 12e3), token: opts.token });
  r.findings.sort((a, b) => ORDER2[a.level] - ORDER2[b.level]);
  return r;
}
__name(scan, "scan");
function limited(r, env) {
  const issues = r.findings.filter((f) => f.level === "fail" || f.level === "warn");
  const counts = Object.fromEntries(["fail", "warn", "info", "pass"].map((k) => [k, r.findings.filter((f) => f.level === k).length]));
  return {
    score: r.score,
    server: r.server?.name || null,
    toolCount: r.toolCount,
    contextTokens: r.contextTokens ?? null,
    authRequired: Boolean(r.authRequired),
    counts,
    top: issues.slice(0, 3).map(({ level, id, title }) => ({ level, id, title })),
    locked: Math.max(0, issues.length - 3),
    upgrade: { fixes: "Full report includes every finding with its fix, PDF export and CI use.", pricing: `${env.PUBLIC_URL || ""}/#pricing` }
  };
}
__name(limited, "limited");
async function pdfFromHtml(env, html) {
  if (!env.CF_ACCOUNT_ID || !env.CF_BROWSER_TOKEN) return null;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_BROWSER_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ html, pdfOptions: { format: "a4", printBackground: true } })
  });
  return r.ok ? r : null;
}
__name(pdfFromHtml, "pdfFromHtml");
function thanksPage(key, env) {
  const body = key ? `<h1>You're in.</h1><p>Your license key (shown once, so copy it now):</p><pre id="k">${key}</pre>
<p>Use it in the web app, the API (<code>Authorization: Bearer \u2026</code>) or the GitHub Action (<code>api-key: \${{ secrets.MCP_READINESS_KEY }}</code>).</p>` : `<h1>Payment received</h1><p>Your key is being issued. Refresh in a few seconds. If it has been more than an hour, reply to your receipt email.</p>`;
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Thanks | MCP Readiness</title><style>body{font:16px/1.5 system-ui;max-width:640px;margin:60px auto;padding:0 20px}pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto}</style>${body}<p><a href="/">Back to MCP Readiness</a></p>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
__name(thanksPage, "thanksPage");
var MCP_TOOLS = [{
  name: "scan_mcp",
  title: "Scan an MCP server",
  description: "Live readiness + context-cost scan of a public Streamable HTTP MCP server. Returns score, every finding with its fix, and the token cost of its tool list. Uses 1 credit.",
  inputSchema: { type: "object", properties: { url: { type: "string", description: "https URL of the MCP endpoint" } }, required: ["url"] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
}];
async function mcpEndpoint(req, env, url) {
  const origin = req.headers.get("origin");
  const allowed = String(env.MCP_ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return new Response("Forbidden origin", { status: 403 });
  const msg = await req.json().catch(() => null);
  const reply = /* @__PURE__ */ __name((result, error) => new Response(JSON.stringify(error ? { jsonrpc: "2.0", id: msg?.id ?? null, error } : { jsonrpc: "2.0", id: msg?.id ?? null, result }), { headers: { "content-type": "application/json" } }), "reply");
  if (!msg || msg.jsonrpc !== "2.0") return reply(null, { code: -32600, message: "Invalid Request" });
  if (msg.id === void 0) return new Response(null, { status: 202 });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mcp-readiness", version: VERSION }, instructions: "Call scan_mcp with a public MCP URL. Needs a license key (Authorization: Bearer mrc_live_...)." });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: MCP_TOOLS });
    case "tools/call": {
      if (msg.params?.name !== "scan_mcp") return reply(null, { code: -32602, message: "Unknown tool" });
      const t = checkTarget(msg.params?.arguments?.url);
      if (!t.ok) return reply({ isError: true, content: [{ type: "text", text: `Rejected URL: ${t.error}` }] });
      const c = await consume(env, bearer(req, url));
      if (!c.ok) return reply({ isError: true, content: [{ type: "text", text: `License problem: ${c.error}. Buy credits at ${env.PUBLIC_URL || ""}/#pricing` }] });
      const r = await scan(env, t.url);
      return reply({ content: [{ type: "text", text: JSON.stringify({ url: t.url, ...r, remaining: c.lic.remaining }) }], structuredContent: { url: t.url, score: r.score, contextTokens: r.contextTokens, findings: r.findings } });
    }
    default:
      return reply(null, { code: -32601, message: "Method not found" });
  }
}
__name(mcpEndpoint, "mcpEndpoint");
var src_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST" } });
      if (p === "/api/health") return json3({ ok: true, version: VERSION, payments: { stripe: Boolean(env.STRIPE_WEBHOOK_SECRET), lemonsqueezy: Boolean(env.LEMON_WEBHOOK_SECRET) }, pdf: Boolean(env.CF_BROWSER_TOKEN) });
      if (p === "/api/pricing") return json3({ plans: PLANS, checkout: Object.fromEntries(["org", "indie", "team", "pack", "credits"].map((k) => [k, env[`CHECKOUT_URL_${k.toUpperCase()}`] || null])) });
      if (p === "/api/scan" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const t = checkTarget(body.url);
        if (!t.ok) return json3({ error: t.error }, 400);
        const key = bearer(req, url);
        if (key) {
          const c = await consume(env, key);
          if (!c.ok) return json3({ error: c.error }, c.error === "invalid_license" ? 401 : 402);
          const r2 = await scan(env, t.url, { token: body.token });
          return json3({ ...r2, url: t.url, plan: c.lic.plan, remaining: c.lic.remaining });
        }
        if (body.token) return json3({ error: "token_scans_need_a_license" }, 402);
        if (!await rateLimit(env, req, "scan", Number(env.FREE_SCANS_PER_HOUR || 10))) return json3({ error: "rate_limited", detail: "Free scans are limited per hour. A license removes the limit." }, 429);
        const r = await scan(env, t.url);
        return json3({ url: t.url, ...limited(r, env) });
      }
      if (p === "/api/report") {
        const t = checkTarget(url.searchParams.get("url"));
        if (!t.ok) return json3({ error: t.error }, 400);
        const c = await consume(env, bearer(req, url));
        if (!c.ok) return json3({ error: c.error, pricing: "/#pricing" }, c.error === "invalid_license" ? 401 : 402);
        const html = toHtml(await scan(env, t.url), t.url);
        if (url.searchParams.get("format") === "pdf") {
          const pdf = await pdfFromHtml(env, html);
          if (pdf) return new Response(pdf.body, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="mcp-readiness-report.pdf"' } });
        }
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (p === "/api/ci/run" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const key = bearer(req, url);
        if (key) {
          const c = await consume(env, key);
          if (!c.ok) return json3({ mode: "free", error: c.error }, 200);
          return json3({ mode: "full", plan: c.lic.plan, remaining: c.lic.remaining });
        }
        const repo = String(body.repo || "unknown").slice(0, 140);
        const k = `ci:${repo}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
        const n = Number(await env.LICENSES.get(k) || 0);
        const cap = Number(env.FREE_ACTION_RUNS_PER_DAY || 50);
        if (n >= cap) return json3({ mode: "capped", cap, detail: "Free daily cap reached for this repo. Score still reported; findings hidden until tomorrow or with an Org key." });
        await env.LICENSES.put(k, String(n + 1), { expirationTtl: 60 * 60 * 26 });
        return json3({ mode: "free", remaining: cap - n - 1, cap });
      }
      if (p === "/mcp" && req.method === "POST") return mcpEndpoint(req, env, url);
      if (p === "/api/monitor" && req.method === "POST") return registerMonitor(req, env, bearer(req, url));
      if (p === "/api/license") {
        const lic = await getLicense(env, bearer(req, url));
        if (!lic) return json3({ error: "invalid_license" }, 401);
        return json3({ plan: lic.plan, status: lic.status, remaining: lic.remaining, quota: lic.quota, period: lic.period });
      }
      if (p === "/badge.svg" || p === "/badge") {
        const t = checkTarget(url.searchParams.get("url"));
        const cache = caches.default;
        const ck = new Request(`https://badge.cache/${encodeURIComponent(t.url || "invalid")}`);
        const hit = await cache.match(ck);
        if (hit) return hit;
        let score2 = null;
        if (t.ok && await rateLimit(env, req, "badge", Number(env.BADGE_MISSES_PER_HOUR || 30))) {
          try {
            score2 = (await scan(env, t.url)).score;
          } catch {
          }
        }
        const res = new Response(badge(score2), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=21600" } });
        ctx?.waitUntil?.(cache.put(ck, res.clone()));
        return res;
      }
      if (p === "/api/subscribe" && req.method === "POST") {
        const { email } = await req.json().catch(() => ({}));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) return json3({ error: "invalid_email" }, 400);
        if (!await rateLimit(env, req, "sub", 5)) return json3({ error: "rate_limited" }, 429);
        await env.LICENSES.put(`lead:${email.toLowerCase()}`, JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), source: "state-of-mcp-2026-11" }));
        return json3({ ok: true, report: "/state-of-mcp-2026-11.html" });
      }
      if (p === "/webhooks/stripe" && req.method === "POST") return handleStripe(req, env);
      if (p === "/webhooks/lemonsqueezy" && req.method === "POST") return handleLemon(req, env);
      if (p === "/thanks") {
        const sid = url.searchParams.get("session_id") || (url.searchParams.get("ls_order") ? `ls_${url.searchParams.get("ls_order")}` : "");
        const key = sid ? await env.LICENSES.get(`claim:${sid}`) : null;
        if (key) await env.LICENSES.delete(`claim:${sid}`);
        return thanksPage(key, env);
      }
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return json3({ error: "not_found" }, 404);
    } catch (e) {
      return json3({ error: "scan_failed", detail: String(e?.message || e).slice(0, 200) }, 502);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMonitors(env, scan));
  }
};

// ../../../home/box/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../home/box/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-u4Mgvk/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../home/box/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-u4Mgvk/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
  limited,
  scan
};
//# sourceMappingURL=index.js.map
