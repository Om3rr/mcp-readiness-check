// Builds "State of public MCP servers, Nov 2026" from scan result files.
// Usage: node build-state-report.mjs <results.json>... > state-of-mcp-2026-11.html
// Results: arrays of { url, name, score, authRequired, tools, findings[] } from examples/registry-scan/scan.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const files = process.argv.slice(2);
const m = new Map();
for (const f of files) for (const x of JSON.parse(readFileSync(f, 'utf8'))) m.set(x.url, x);
const all = [...m.values()];
const ok = all.filter((x) => x.score != null);
const pub = ok.filter((x) => !x.authRequired), oa = ok.filter((x) => x.authRequired);
const has = (x, id) => x.findings.some((f) => f.id === id && f.level !== 'info');
const any = (x, re) => x.findings.some((f) => re.test(f.id) && f.level !== 'info');
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const cnt = (arr, fn) => arr.filter(fn).length;
const tools = pub.map((x) => x.tools || 0).sort((a, b) => a - b);
const q = (p) => tools[Math.min(tools.length - 1, Math.floor(p * tools.length))];
const descLens = pub.flatMap((x) => x.findings.filter((f) => f.id === 'tools.description_long').map((f) => +(f.title.match(/(\d+) chars/) || [0, 0])[1]));
const scoreBuckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((b) => ({ b, n: cnt(ok, (x) => (b === 100 ? x.score === 100 : x.score >= b && x.score < b + 10)) }));
const toolBuckets = [[0, 0], [1, 3], [4, 10], [11, 20], [21, 40], [41, 100], [101, 1e9]].map(([a, b]) => ({ l: b > 1e8 ? `${a}+` : a === b ? `${a}` : `${a}–${b}`, n: cnt(pub, (x) => (x.tools || 0) >= a && (x.tools || 0) <= b) }));
const S = {
  probed: all.length, ok: ok.length, down: all.length - ok.length, pub: pub.length, oa: oa.length,
  perfect: pct(cnt(ok, (x) => x.score === 100), ok.length),
  median: [...ok.map((x) => x.score)].sort((a, b) => a - b)[Math.floor(ok.length / 2)],
  pub_origin: pct(cnt(pub, (x) => has(x, 'http.origin')), pub.length),
  pub_cors: pct(cnt(pub, (x) => has(x, 'http.cors')), pub.length),
  pub_annot: pct(cnt(pub, (x) => has(x, 'annotations.none') || has(x, 'annotations.risky')), pub.length),
  pub_risky: pct(cnt(pub, (x) => has(x, 'annotations.risky')), pub.length),
  pub_long: pct(cnt(pub, (x) => has(x, 'tools.description_long')), pub.length),
  pub_untyped: pct(cnt(pub, (x) => has(x, 'schema.untyped')), pub.length),
  pub_32601: pct(cnt(pub, (x) => has(x, 'rpc.method_not_found')), pub.length),
  pub_many: pct(cnt(pub, (x) => has(x, 'tools.many')), pub.length),
  pub_old: pct(cnt(pub, (x) => has(x, 'init.old_protocol')), pub.length),
  pub_poison: cnt(pub, (x) => any(x, /poisoning/)),
  pub_title: pct(cnt(pub, (x) => x.findings.some((f) => f.id === 'tools.title')), pub.length),
  oa_www: pct(cnt(oa, (x) => has(x, 'auth.www_authenticate')), oa.length),
  oa_prm: pct(cnt(oa, (x) => has(x, 'auth.prm_missing') || has(x, 'auth.legacy_discovery')), oa.length),
  oa_broken: cnt(oa, (x) => has(x, 'auth.prm_broken')),
  oa_rel: cnt(oa, (x) => has(x, 'auth.prm_relative')),
  oa_legacy: cnt(oa, (x) => has(x, 'auth.legacy_discovery')),
  oa_pkce: cnt(oa, (x) => has(x, 'auth.pkce')),
  oa_clean: pct(cnt(oa, (x) => x.score === 100), oa.length),
  t_med: q(0.5), t_p90: q(0.9), t_max: tools[tools.length - 1],
  d_count: descLens.length, d_max: Math.max(0, ...descLens), d_over3k: descLens.filter((d) => d > 3000).length,
};
writeFileSync(new URL('./state-of-mcp-2026-11.stats.json', import.meta.url), JSON.stringify({ ...S, scoreBuckets, toolBuckets }, null, 1));
const fmt = (n) => n.toLocaleString('en-US');
const bars = (rows, lab, val, color) => { const mx = Math.max(...rows.map(val)); return `<div class="bars">${rows.map((r) => `<div class="br"><span>${lab(r)}</span><i style="width:${(100 * val(r)) / mx}%;background:${color}"></i><b>${fmt(val(r))}</b></div>`).join('')}</div>`; };
const gap = (label, p, note) => `<tr><td>${label}</td><td style="width:38%"><div class="bar"><i style="width:${p}%"></i></div></td><td class="num">${p}%</td><td class="mut">${note}</td></tr>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>State of public MCP servers, Nov 2026</title>
<style>
@page{size:A4;margin:15mm}
:root{--ink:#0f172a;--mut:#475569;--line:#e2e8f0;--blue:#1d4ed8;--acc:#7c3aed}
*{box-sizing:border-box}body{font:10.2pt/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);max-width:182mm;margin:auto;padding:8px}
h1{font-size:25pt;line-height:1.1;margin:0 0 6px;letter-spacing:-.02em}h2{font-size:14pt;margin:24px 0 6px;color:var(--blue);border-bottom:2px solid var(--line);padding-bottom:3px}h3{font-size:11pt;margin:12px 0 4px}
.mut{color:var(--mut)}.small{font-size:8.8pt}p{margin:5px 0}
.hero{border-radius:12px;padding:20px 20px 16px;background:linear-gradient(135deg,#1e1b4b,#1d4ed8);color:#fff}.hero .mut{color:#c7d2fe}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.kpi{border:1px solid var(--line);border-radius:8px;padding:8px 10px}.kpi b{display:block;font-size:18pt;line-height:1.1}.kpi span{font-size:8.6pt;color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:9.3pt;margin:6px 0}td,th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:middle}th{background:#f8fafc}.num{text-align:right;font-weight:600;white-space:nowrap}
.bar{height:8px;background:#eef2ff;border-radius:4px;position:relative}.bar i{position:absolute;inset:0 auto 0 0;background:var(--acc);border-radius:4px}
.bars .br{display:grid;grid-template-columns:62px 1fr 52px;align-items:center;gap:6px;font-size:8.8pt;margin:2px 0}.bars i{display:block;height:11px;border-radius:3px}.bars b{text-align:right;font-weight:600}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.case{border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:6px;padding:7px 10px;margin:7px 0;page-break-inside:avoid}
.callout{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:9px 12px;margin:10px 0}
ol li,ul li{margin:3px 0}.pb{page-break-before:always}
code{font:8.8pt ui-monospace,Menlo,monospace;background:#f1f5f9;padding:0 3px;border-radius:3px}
</style></head><body>
<div class="hero"><div class="small mut">REPORT · November 2026 · DRAFT, NOT PUBLISHED</div>
<h1>State of public MCP servers</h1>
<div>What ${fmt(S.ok)} live Model Context Protocol servers from the official registry get right, what they skip, and what it costs the agents that connect to them.</div>
<p class="small mut" style="margin-top:10px">Omer Shacham, AI agents &amp; MCP architecture · Data collected 13 Nov 2026 with the open-source scanner mcp-readiness-check (v0.2.x).</p></div>

<div class="kpis">
<div class="kpi"><b>${fmt(S.ok)}</b><span>servers reached (${fmt(S.probed)} probed)</span></div>
<div class="kpi"><b>${S.perfect}%</b><span>pass every check</span></div>
<div class="kpi"><b>${S.pub_origin}%</b><span>of public servers accept any web Origin</span></div>
<div class="kpi"><b>${S.oa_prm}%</b><span>of login-protected servers can't be discovered by current clients</span></div>
</div>

<h2>Key findings</h2>
<ol>
<li><b>Most servers are fine, and the ones that aren't share the same few gaps.</b> ${S.perfect}% pass every check, and the median score is ${S.median}/100. Three issues account for most deductions: Origin validation, safety annotations and description length.</li>
<li><b>Origin validation is the most-skipped MUST in the spec.</b> ${S.pub_origin}% of public servers process requests carrying a foreign <code>Origin</code> header, and ${S.pub_cors}% answer with <code>Access-Control-Allow-Origin: *</code>.</li>
<li><b>Agents often can't tell safe tools from dangerous ones.</b> ${S.pub_annot}% of public servers ship tools without <code>readOnlyHint</code>/<code>destructiveHint</code> annotations. ${S.pub_risky}% have tools named like writes (create, update, delete, send) with no annotation at all.</li>
<li><b>The context bill is concentrated in a few large servers.</b> The median public server exposes ${S.t_med} tools. The top 10% expose ${S.t_p90} or more, and the largest exposes ${fmt(S.t_max)}. ${fmt(S.d_count)} individual tool descriptions exceed 1,500 characters, ${fmt(S.d_over3k)} exceed 3,000, and the longest is ${fmt(S.d_max)} characters.</li>
<li><b>OAuth is mostly right, and when it's wrong, nobody can log in.</b> ${S.oa_clean}% of login-protected servers pass discovery cleanly. ${S.oa_prm}% publish no RFC 9728 protected-resource metadata, or only the older 2025-03-26 flow. ${S.oa_www}% return a 401 with no <code>WWW-Authenticate</code> header. ${S.oa_broken} point clients at a metadata URL that doesn't load.</li>
</ol>

<h2>1. Scores</h2>
<div class="two">
<div><h3>Score distribution (all reachable servers)</h3>${bars(scoreBuckets, (r) => (r.b === 100 ? '100' : `${r.b}–${r.b + 9}`), (r) => r.n, '#1d4ed8')}</div>
<div><h3>Public vs login-protected</h3>
<table><tr><th></th><th class="num">Servers</th><th class="num">Score 100</th></tr>
<tr><td>Public (tools listed without login)</td><td class="num">${fmt(S.pub)}</td><td class="num">${pct(cnt(pub, (x) => x.score === 100), pub.length)}%</td></tr>
<tr><td>Behind a 401</td><td class="num">${fmt(S.oa)}</td><td class="num">${S.oa_clean}%</td></tr>
<tr><td>Unreachable / not MCP</td><td class="num">${fmt(S.down)}</td><td class="num">n/a</td></tr></table>
<p class="small mut">Login-protected servers are scored on their discovery flow only. The tool surface behind login isn't visible to an unauthenticated scan.</p></div>
</div>

<h2>2. Gaps on public servers</h2>
<table><tr><th>Gap</th><th>Share of ${fmt(S.pub)} public servers</th><th class="num"></th><th>Why it matters</th></tr>
${gap('Foreign <code>Origin</code> accepted', S.pub_origin, 'Spec MUST; DNS-rebinding and drive-by calls from any web page')}
${gap('No / missing safety annotations', S.pub_annot, 'Clients can\'t decide when to ask the human first')}
${gap('<code>Access-Control-Allow-Origin: *</code>', S.pub_cors, 'Any site can call the server from a visitor\'s browser')}
${gap('Unknown method ≠ <code>-32601</code>', S.pub_32601, 'Breaks capability probing in some clients')}
${gap('A tool description over 1,500 chars', S.pub_long, 'Paid on every turn, by every user')}
${gap('No human-readable tool titles', S.pub_title, 'Approval prompts show raw identifiers')}
${gap('Write-sounding tools, no annotations', S.pub_risky, 'Delete looks the same as list')}
${gap('More than 40 tools', S.pub_many, 'Exceeds some clients\' tool caps; heavy context')}
${gap('Untyped input properties', S.pub_untyped, 'Model guesses the shape; failed calls cost money')}
${gap('Outdated protocol version', S.pub_old, 'Misses newer features (annotations, structured output)')}
</table>

<div class="two">
<div><h3>Tools per public server</h3>${bars(toolBuckets, (r) => r.l, (r) => r.n, '#7c3aed')}</div>
<div><h3>What "too long" looks like</h3>
<p>Tool metadata goes into the model's context on every turn, whether or not the tool is used. Rule of thumb: 4 characters ≈ 1 token.</p>
<ul class="small"><li>A clean tool: 150–600 characters</li><li>Our warning threshold: 1,500 characters</li><li>Longest single description found: <b>${fmt(S.d_max)}</b> characters (≈${fmt(Math.round(S.d_max / 4))} tokens)</li><li>Largest <code>tools/list</code> measured: ≈505 KB (≈125K tokens) for one analytics vendor</li></ul></div>
</div>

<h2 class="pb">3. Authentication and discovery</h2>
<p>For a server to work as a one-click connector in Claude.ai or ChatGPT, it has to support the 2025-06-18 discovery chain: a <code>401</code> with <code>WWW-Authenticate: Bearer resource_metadata="…"</code>, then RFC 9728 protected-resource metadata, then RFC 8414 authorization-server metadata with PKCE S256, ideally with dynamic client registration.</p>
<table><tr><th>Issue (login-protected servers, n=${fmt(S.oa)})</th><th class="num">Count / share</th></tr>
<tr><td>No RFC 9728 metadata, or legacy 2025-03-26 flow only</td><td class="num">${S.oa_prm}%</td></tr>
<tr><td>401 without <code>WWW-Authenticate</code></td><td class="num">${S.oa_www}%</td></tr>
<tr><td>Legacy discovery (AS metadata on the MCP host, no RFC 9728)</td><td class="num">${S.oa_legacy}</td></tr>
<tr><td><code>resource_metadata</code> pointer that returns an error</td><td class="num">${S.oa_broken}</td></tr>
<tr><td><code>resource_metadata</code> given as a relative URL</td><td class="num">${S.oa_rel}</td></tr>
<tr><td>Authorization server without PKCE S256</td><td class="num">${S.oa_pkce}</td></tr>
</table>
<p class="small mut">Many servers behind a 401 use plain API keys on purpose. For those, missing OAuth metadata isn't a bug, but it rules out the consumer connector directories.</p>

<h2>4. Patterns from the long tail (anonymized)</h2>
<div class="case"><b>The 628-tool ad server.</b> A mature ad-serving platform generated its MCP server from its REST API. Every endpoint became a tool, and about 300 create/update/delete tools have no annotations. The surface is complete, but agents get no safety signal and spend about 80K tokens per turn.</div>
<div class="case"><b>The 125K-token analytics server.</b> 132 tools with rich descriptions and untyped SQL-like <code>where</code>/<code>having</code> arguments. Next to two other servers it no longer fits in a typical context window.</div>
<div class="case"><b>The broken pointer.</b> Several SaaS vendors, including an SMS platform and an integration platform, return a correct-looking <code>401</code> whose <code>resource_metadata</code> URL returns 404. Their own docs say "ChatGPT isn't supported", and this is why.</div>
<div class="case"><b>The callback form.</b> A well-built comparison site exposes a "request a callback" tool that submits a phone number. Combined with <code>CORS: *</code> and no Origin check, any web page can file leads through its visitors' browsers.</div>
<div class="case"><b>The false alarm.</b> Our first pass flagged 244 servers for tool poisoning. Most were harmless lines like "read-only, needs no API key". After the rule was narrowed, the remaining flags are mostly invisible bidi characters in legitimate right-to-left text. Automated poisoning checks need a human read before anyone is accused of anything.</div>

<h2>5. What the leaders do</h2>
<p>A separate scan of 25 well-known vendor servers (Stripe, Notion, Linear, Sentry, GitHub, Supabase, Vercel, PayPal, Cloudflare, Microsoft Learn and others) found 20 of 25 at 100/100. Their shared habits:</p>
<ul><li>A full OAuth 2025-06-18 discovery chain with PKCE S256.</li><li>Few, well-named tools (2–5 on public docs servers) with short descriptions.</li><li>Annotations on every tool, including <code>readOnlyHint</code> on pure reads.</li><li>Origin validation on anything that isn't purely public and read-only.</li></ul>

<h2>6. A checklist for MCP server owners</h2>
<ol><li>Validate <code>Origin</code>, and drop wildcard CORS on any server with write tools.</li><li>Annotate every tool. If you have an OpenAPI spec, generate the annotations from the HTTP verbs.</li><li>Keep descriptions under about 600 characters. Put shared guidance in the server's <code>instructions</code> field.</li><li>Over about 40 tools, split them into toolsets or use a search-then-load pattern.</li><li>Type every input property and list the required ones.</li><li>For OAuth, return <code>401</code> + <code>WWW-Authenticate</code> with an absolute <code>resource_metadata</code> URL, publish RFC 9728 and RFC 8414 metadata, and support PKCE S256.</li><li>Return <code>-32601</code> for unknown methods.</li><li>Re-scan on every release. The scanner runs in CI in under a second per server.</li></ol>

<h2>Method</h2>
<p class="small">Source: the official MCP registry API (registry.modelcontextprotocol.io), latest version of each server, Streamable-HTTP remotes only, deduplicated to one endpoint per registered domain. Probes, all unauthenticated and with no side effects: <code>initialize</code>, <code>tools/list</code>, <code>prompts/list</code>, an unknown method, an unknown tool name, a request with a foreign <code>Origin</code>, a CORS preflight, and OAuth discovery (RFC 9728, RFC 8414, legacy 2025-03-26, PKCE, DCR). 20-second timeout, run on 13 Nov 2026. Scores are the scanner's weighted deductions (fail −15, warn −5) and are a triage signal, not a security audit. Small vendors are anonymized. Vendors named in section 5 were scanned on public endpoints and are named only for positive practice.</p>
<p class="small mut" style="border-top:1px solid var(--line);padding-top:6px;margin-top:14px">Want this for your server, public or internal? The MCP Readiness Review covers the automated scan, a manual review of auth and approval gates, a ranked fix plan and a re-scan in 3 working days. Omer Shacham · [email] · [LinkedIn URL]</p>
</body></html>`;
process.stdout.write(html);
