// MCP production-readiness checks. Pure functions over what we observed from a server.
// Each finding: { id, level: 'fail'|'warn'|'info'|'pass', title, detail, fix }
export const RISKY = /(^|_|-)(delete|remove|drop|destroy|purge|send|post|publish|pay|charge|transfer|refund|exec|execute|run|shell|command|write|update|create|approve|deploy|kill|revoke|grant|email|sms|message)(_|-|$)/i;
const POISON = [
  [/ignore (all |any )?(previous|prior|above) (instructions|messages)/i, 'tells the model to ignore previous instructions'],
  [/<\s*(important|system|secret|instructions?)\s*>/i, 'contains hidden-instruction tags like <IMPORTANT>'],
  [/(do not|don't|never) (tell|inform|mention|show)( this to)? (the )?user/i, 'asks the model to hide something from the user'],
  [/(read|cat|open|send|upload|include).{0,40}(\.ssh|id_rsa|\.env|credentials|api[_ ]?key|password|token)/i, 'references secrets or credential files'],
  [/[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E]/, 'contains invisible or bidi-control unicode'],
  [/[A-Za-z0-9+/]{120,}={0,2}/, 'contains a long base64-like blob'],
];
const NAME = /^[a-zA-Z0-9_.-]{1,64}$/;

export function checkTools(tools = []) {
  const f = [];
  const add = (level, id, title, detail = '', fix = '') => f.push({ id, level, title, detail, fix });
  if (!tools.length) { add('warn', 'tools.none', 'Server exposes no tools'); return f; }
  const seen = new Set();
  for (const t of tools) {
    const n = t.name || '(unnamed)';
    if (seen.has(n)) add('fail', 'tools.duplicate', `Duplicate tool name "${n}"`, '', 'Tool names must be unique.');
    seen.add(n);
    if (!NAME.test(n)) add('warn', 'tools.name', `Tool name "${n}" is not portable`, 'Some clients reject names outside [a-zA-Z0-9_.-], max 64 chars.', 'Rename to snake_case ASCII.');
    const d = t.description || '';
    if (d.trim().length < 20) add('warn', 'tools.description', `"${n}" has little or no description`, 'Models choose tools from descriptions; vague ones cause wrong or unsafe calls.', 'Describe what it does, side effects, and when NOT to use it.');
    if (d.length > 1500) add('warn', 'tools.description_long', `"${n}" description is ${d.length} chars`, 'Long descriptions burn context on every turn and hide instructions.', 'Keep under ~1,000 chars; move docs to resources.');
    const blob = `${d} ${JSON.stringify(t.inputSchema || {})}`;
    for (const [re, why] of POISON) if (re.test(blob)) add('fail', 'tools.poisoning', `"${n}" looks like tool poisoning: it ${why}`, 'Tool metadata is injected straight into the model context.', 'Remove instructions aimed at the model from tool metadata.');
    const s = t.inputSchema;
    if (!s || s.type !== 'object') add('fail', 'schema.type', `"${n}" inputSchema is missing or not type "object"`, 'The MCP spec requires a JSON Schema object.', 'Set inputSchema: { type: "object", properties: {...} }.');
    else {
      const props = Object.keys(s.properties || {});
      if (props.length && !Array.isArray(s.required)) add('info', 'schema.required', `"${n}" declares no required fields`, '', 'List required args so clients validate before calling.');
      const untyped = props.filter((p) => !s.properties[p]?.type && !s.properties[p]?.enum && !s.properties[p]?.anyOf && !s.properties[p]?.oneOf);
      if (untyped.length) add('warn', 'schema.untyped', `"${n}" has untyped args: ${untyped.join(', ')}`, '', 'Give every property a type.');
    }
    const a = t.annotations || {};
    if (RISKY.test(n) && a.destructiveHint === undefined && a.readOnlyHint === undefined)
      add('warn', 'annotations.risky', `"${n}" sounds state-changing but has no annotations`, 'Clients use readOnlyHint/destructiveHint/idempotentHint to decide when to ask the human first.', 'Add annotations, e.g. { destructiveHint: true } or { readOnlyHint: true }.');
  }
  const annotated = tools.filter((t) => t.annotations && Object.keys(t.annotations).length).length;
  if (!annotated) add('warn', 'annotations.none', 'No tool declares annotations', `0 of ${tools.length} tools have readOnlyHint/destructiveHint.`, 'Annotate every tool; mark reads readOnlyHint: true.');
  if (tools.length > 40) add('warn', 'tools.many', `${tools.length} tools exposed`, 'Large tool lists degrade tool selection and cost context.', 'Group or split into toolsets.');
  if (!f.some((x) => x.level === 'fail' || x.level === 'warn')) add('pass', 'tools.ok', `All ${tools.length} tools look clean`);
  return f;
}

export function checkHttp(obs) {
  const f = [];
  const add = (level, id, title, detail = '', fix = '') => f.push({ id, level, title, detail, fix });
  const u = new URL(obs.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) add('fail', 'http.tls', 'Remote server is not using HTTPS', '', 'Serve MCP over TLS only.');
  if (obs.unauthToolsList && !obs.authProvided) add('info', 'http.auth', 'tools/list works without credentials', 'Fine for public read-only servers; otherwise require OAuth 2.1 / bearer auth.', 'Return 401 with WWW-Authenticate for protected servers.');
  if (obs.unauthToolCallOk) add('fail', 'http.auth_call', 'A tool call succeeded without credentials', `Called "${obs.unauthToolCallName}" with no auth.`, 'Require auth for every non-public tool.');
  if (obs.acao === '*') add('warn', 'http.cors', 'CORS allows any origin (Access-Control-Allow-Origin: *)', 'Any website the user visits can script calls to this server from the browser.', 'Allow-list known origins.');
  if (obs.evilOriginAccepted) add(local ? 'fail' : 'warn', 'http.origin', 'Requests with a foreign Origin header are accepted', 'The MCP Streamable HTTP spec says servers MUST validate Origin to prevent DNS-rebinding attacks, which matters most for localhost servers.', 'Reject requests whose Origin is not on an allow-list (403).');
  if (obs.unknownMethodCode !== -32601) add('warn', 'rpc.method_not_found', 'Unknown methods do not return JSON-RPC -32601', `Got ${JSON.stringify(obs.unknownMethodCode)}.`, 'Return error code -32601 for unknown methods.');
  if (obs.badToolStatus >= 500) add('warn', 'rpc.unknown_tool', 'Calling an unknown tool crashes with HTTP 5xx', '', 'Return a JSON-RPC error or isError: true result.');
  if (!obs.sessionHeader) add('info', 'http.session', 'No Mcp-Session-Id issued', 'Fine for stateless servers.', '');
  return f;
}

export function checkInit(init) {
  const f = [];
  if (!init?.protocolVersion) f.push({ level: 'fail', id: 'init.version', title: 'initialize did not return a protocolVersion', detail: '', fix: '' });
  if (!init?.serverInfo?.name || !init?.serverInfo?.version) f.push({ level: 'warn', id: 'init.serverInfo', title: 'serverInfo name/version missing', detail: '', fix: 'Return serverInfo { name, version }.' });
  if (!init?.instructions) f.push({ level: 'info', id: 'init.instructions', title: 'No server instructions', detail: 'Instructions are the right place for safety rules (what needs human approval).', fix: '' });
  return f;
}

export function score(findings) {
  const pen = { fail: 15, warn: 5, info: 0, pass: 0 };
  return Math.max(0, 100 - findings.reduce((s, x) => s + pen[x.level], 0));
}
