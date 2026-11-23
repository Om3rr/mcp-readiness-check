// Builds worker/public/docs/ci/index.html: CI badge onboarding (quick start, workflow, local server, troubleshooting).
// Inputs and outputs must match action.yml (test/landing.test.js checks this). Run: node reports/build-docs-ci.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { PAGE_CSS, PAGE_NAV, PAGE_FOOT, ogTags } from '../worker/src/pages.js';

const SITE = 'https://mcp.pacerai.fit';
const README = 'https://github.com/Om3rr/mcp-readiness-check?utm_source=mcp-readiness&utm_medium=docs&utm_campaign=action#readme';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const title = 'Add an MCP readiness badge and CI gate in 3 steps | MCP Readiness';
const desc = 'Quick start for the free MCP Readiness GitHub Action: scan your MCP server, add the README badge, and fail PRs on a low score or a tool list over your token budget. Copy-paste workflow and troubleshooting.';

export const WORKFLOW = `name: MCP readiness
on: [pull_request]
jobs:
  mcp-readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: Om3rr/mcp-readiness-check@v1
        id: mcp
        with:
          url: https://your-server.example.com/mcp
          fail-under: 80
          max-context-tokens: 8000
      - run: echo "Score \${{ steps.mcp.outputs.score }}, ~\${{ steps.mcp.outputs.context-tokens }} tokens per turn"`;

export const LOCAL = `name: MCP readiness
on: [pull_request]
jobs:
  mcp-readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Start the MCP server in the background
        run: |
          PORT=8787 npm start &
          for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8787/mcp && break; sleep 1; done
      - uses: Om3rr/mcp-readiness-check@v1
        with:
          url: http://127.0.0.1:8787/mcp
          fail-under: 80
          max-context-tokens: 8000`;

const BADGE = `[![MCP readiness](${SITE}/badge.svg?url=https://your-server.example.com/mcp)](${SITE}/s/your-server.example.com/mcp)`;

export const INPUTS = [
  ['url', 'yes', '', 'MCP endpoint (Streamable HTTP). Your public https URL, or http://127.0.0.1:PORT/mcp after starting the server in the job.'],
  ['fail-under', 'no', '70', 'Fail the job if the score is below this (0-100). 0 never fails.'],
  ['max-context-tokens', 'no', '0', 'Fail the job if the tools/list payload costs more than this many tokens (about 4 characters per token). 0 disables.'],
  ['token', 'no', '', 'Bearer token for servers behind login, so tools can be listed. Use a test-tenant token from secrets.'],
  ['json-path', 'no', '', 'Write the JSON report (with the raw tools/list) to this path. Empty disables.'],
  ['api-key', 'no', '', 'Optional license key. Not needed for the free tier.'],
];
export const OUTPUTS = ['score', 'context-tokens', 'findings', 'mode'];

const TROUBLE = [
  ['The job fails on OAuth discovery. What do I fix?', `If your server answers 401, MCP clients need to discover how to log in. Return <code>WWW-Authenticate: Bearer resource_metadata="https://your-server/.well-known/oauth-protected-resource"</code> and serve that protected-resource metadata (RFC 9728) with an <code>authorization_servers</code> list. The authorization server needs its own metadata at <code>/.well-known/oauth-authorization-server</code> (RFC 8414). To scan the tools behind login as well, pass a test-tenant token with the <code>token</code> input from a secret.`],
  ['It flags CORS or a foreign Origin. Why does that matter?', `The scan sends a request with a foreign <code>Origin</code> header. The MCP spec says servers MUST validate Origin, and for a server on localhost accepting it is a fail, because any web page could reach it (DNS rebinding). Reject unknown origins with 403 and keep <code>Access-Control-Allow-Origin</code> to an allowlist rather than <code>*</code>. Public, read-only, unauthenticated servers only get an info note.`],
  ['The scan times out or cannot connect in CI. What now?', `Each request waits up to 15 seconds. In CI the usual cause is that the server has not finished starting: start it in the background and wait for the port, as in the local workflow above. Bind to 127.0.0.1 on the port you pass in <code>url</code>, and point at the Streamable HTTP path (often <code>/mcp</code>), not an SSE-only or stdio entry point. Public URLs must be reachable from GitHub-hosted runners.`],
  ['The job fails on the token budget. How do I get under it?', `<code>max-context-tokens</code> counts what your tools/list costs on every agent turn. Shorten long tool descriptions, drop rarely used tools, and remove repeated text in input schemas. Set it to 0 to only report the number while you work on it.`],
  ['The score is below fail-under on the first run. Can I start softer?', `Yes. Start with <code>fail-under: 0</code> to see the score and top issues in the job log without failing, fix the top issues, then raise the gate. The free tier runs 50 times a day per repo.`],
];

const ld = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'HowTo', name: 'Add an MCP readiness badge and CI gate', url: `${SITE}/docs/ci/`, step: [
    { '@type': 'HowToStep', name: 'Scan your MCP server', text: 'Paste your public MCP URL into the free scan at mcp.pacerai.fit.' },
    { '@type': 'HowToStep', name: 'Add the README badge', text: 'Copy the badge markdown with your server URL into your README.' },
    { '@type': 'HowToStep', name: 'Add the GitHub Action', text: 'Add Om3rr/mcp-readiness-check@v1 to a workflow with fail-under and max-context-tokens.' },
  ] },
  { '@type': 'FAQPage', mainEntity: TROUBLE.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
] };

const box = (id, text, ev, label = 'Copy') => `<div class="codebox"><pre id="${id}"${id === 'badge' ? '' : ' class="code-pre"'}>${esc(text)}</pre><button type="button" class="ghost sm copy" data-copy="${id}" data-event="${ev}">${label}</button></div>`;

const body = `<h1>Badge and CI gate for your MCP server in 3 steps</h1>
<p>The free <a href="${esc(README)}" data-event="action_install_click">MCP Readiness GitHub Action</a> connects to your server the way agents do and fails the PR when the score drops or the tool list gets too expensive.</p>
<div class="card"><h2>Quick start</h2>
<h3>1. Scan your server</h3><p>Paste your MCP URL into the <a href="/">free scan</a>. You get a 0-100 score, the token cost of your tool list and the top issues. No sign-up.</p>
<h3>2. Add the badge</h3><p>Put this in your README, with your URL. It links to your server's public page and refreshes at most every 6 hours.</p>
${box('badge', BADGE, 'badge_copied', 'Copy badge')}
<h3>3. Add the Action</h3><p>Save as <code>.github/workflows/mcp-readiness.yml</code>. It fails under the score you pick and over your token budget.</p>
${box('wf', WORKFLOW, 'action_install_click')}
<div class="actions"><a class="btn" data-event="action_install_click" href="${esc(README)}">Open the Action README</a><a class="btn ghost" href="/">Scan a server first</a></div></div>
<div class="card" id="local"><h2>Test a local server in CI</h2><p>Start the server in the job, wait for the port, then scan localhost. Nothing has to be public, and a localhost server gets the stricter Origin check.</p>
${box('local-wf', LOCAL, 'action_install_click')}</div>
<div class="card" id="inputs"><h2>Inputs and outputs</h2><div class="tablewrap"><table><tr><th>Input</th><th>Required</th><th>Default</th><th>What it does</th></tr>
${INPUTS.map(([n, r, d, w]) => `<tr><td><code>${n}</code></td><td>${r}</td><td><code>${esc(d || '""')}</code></td><td>${esc(w)}</td></tr>`).join('\n')}</table></div>
<p class="small">Outputs: ${OUTPUTS.map((o) => `<code>${o}</code>`).join(', ')}. Read them with <code>steps.&lt;id&gt;.outputs.score</code>.</p></div>
<div class="card" id="troubleshooting"><h2>Troubleshooting</h2>
${TROUBLE.map(([q, a]) => `<h3>${esc(q)}</h3><p>${a}</p>`).join('\n')}</div>`;

mkdirSync('worker/public/docs/ci', { recursive: true });
writeFileSync('worker/public/docs/ci/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}/docs/ci/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${ogTags(title, desc, `${SITE}/docs/ci/`)}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>${PAGE_CSS}h3{margin:16px 0 6px}</style></head><body><div class="wrap">${PAGE_NAV}<main>
${body}
</main>${PAGE_FOOT}</div><script src="/t.js" defer></script></body></html>
`);
console.log('wrote worker/public/docs/ci/index.html');
