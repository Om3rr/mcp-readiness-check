---
title: "How to test an MCP server before shipping (CI with a GitHub Action)"
description: "A pre-ship test plan for MCP servers: what to check by hand with MCP Inspector, and how to fail a pull request with a free GitHub Action that scores readiness and tool-list token cost."
date: 2026-11-20
slug: test-mcp-server-before-shipping
---

# How to test an MCP server before shipping (CI with a GitHub Action)

> **TL;DR:** "It works in my chat client" is not a shipping test for an MCP server. Before you release, confirm initialize and `tools/list`, unknown-method errors, Origin checks, and — if the server is protected — OAuth discovery. Use the official [MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) to call tools and inspect JSON-RPC by hand. Add a CI gate so a pull request fails when the readiness score drops or the tool list blows a token budget. The free [MCP Readiness Scan GitHub Action](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=test-mcp-server-before-shipping) does that against a server you start on localhost in the job, or against a public URL.

A surprising number of issues never show up in a happy-path chat. In our unauthenticated scans of 23 popular remote MCP servers on 20 November 2026 ([comparison page](https://mcp-readiness.omer20sh.workers.dev/mcp-servers/)), every server in the list still scored 90 or more on live surface checks — and the remaining misses were exactly the kind of thing a CI scan catches: missing tool annotations, long descriptions, a legacy OAuth discovery flow, and unknown methods that do not return JSON-RPC `-32601`.

Those are automated surface checks, not a security audit. They are also cheap to run on every PR.

## What to verify before you ship

Test the server as a client would, not only as its author.

**Protocol handshake.** A client sends `initialize`, then `tools/list` if you declared the tools capability. The [tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) requires `tools/list` to return the current set of tools, each with a `name`, `description`, and `inputSchema`. Confirm the list is the list you meant to ship: no leftover debug tools, no 2,000-character descriptions, no missing `type: object` schemas.

**Error hygiene.** An unknown method should come back as JSON-RPC `-32601`. On the 20 November 2026 scan, AWS Knowledge scored 90 in part because unknown methods did not return that code. Clients and gateways rely on standard errors; a 5xx or a bare HTTP failure is harder to debug and easier to mis-handle.

**Transport security, especially Origin.** For Streamable HTTP, the transport specification requires `Origin` validation on incoming connections. If `Origin` is present and invalid, return HTTP 403. When you run locally, bind to `127.0.0.1` rather than `0.0.0.0`. Remote servers should be served over HTTPS and should not expose `tools/list` or tool calls with no credentials if the data is not public.

**Authorization discovery, if you require login.** A protected server is an OAuth 2.1 resource server. Walk the [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html) path: `401`, `WWW-Authenticate` with `resource_metadata`, a protected-resource document that lists `authorization_servers`, then [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html) or OpenID Connect Discovery on the issuer. See the companion [OAuth discovery checklist](./mcp-oauth-discovery-checklist.md). Fourteen of the fifteen OAuth-protected servers in the popular-server scan had a clean pre-login surface; Atlassian was still on the older 2025-03-26 discovery (AS metadata on the MCP host, no RFC 9728).

**Annotations and token cost.** State-changing tools should declare `destructiveHint` or the absence of `readOnlyHint` as appropriate. Two of the eight open popular servers declared no annotations at all. Separately, measure how many tokens `tools/list` adds to every turn: the open servers ranged from about 80 tokens (Astro Docs) to about 4,967 (Hugging Face).

**One real tool call, by hand.** Surface scans do not call tools. Before you ship, call at least one read path and one write path (if you have them) with valid and invalid arguments.

## Interactive testing: MCP Inspector

The official tool for this last step is [MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) (`@modelcontextprotocol/inspector`). It provides a browser UI, a scriptable CLI, and a terminal UI, all of which speak the same transports and OAuth flow:

```bash
npx @modelcontextprotocol/inspector node path/to/server/index.js
npx @modelcontextprotocol/inspector --cli node path/to/server/index.js --method tools/list
```

Use the web UI while you are writing a tool. Use the CLI to assert that `tools/list` still returns the expected names in a smoke job. Inspector is the right place to invoke `tools/call`, inspect the JSON-RPC exchange, and — if you need it — run a load test against a single tool. It is not, by itself, a readiness score or a token-budget gate.

## Automated testing: fail the PR

Interactive testing does not stop the next pull request from reintroducing a foreign-Origin accept, a legacy OAuth header, or a 3,000-character description. For that, start the server in GitHub Actions and scan it.

The [MCP Readiness Scan](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=test-mcp-server-before-shipping) Action is free on a documented allowance (50 runs/day per repository on the free tier, with a score gate, a context-token budget, and the top issues per run). A typical job starts the server, waits for it to listen, then scans `http://127.0.0.1`:

```yaml
jobs:
  mcp-readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start MCP server
        run: |
          npm ci
          npm start -- --port 8787 &
          npx --yes wait-on http://127.0.0.1:8787/mcp
      - uses: Om3rr/mcp-readiness-check@v1
        with:
          url: http://127.0.0.1:8787/mcp
          fail-under: 80
          max-context-tokens: 8000
```

Point `url` at a public HTTPS endpoint if that is what you ship, or pass `token` from a GitHub secret if the server requires a test-tenant bearer token. `fail-under` defaults to 70; the README example uses 80. `max-context-tokens` defaults to off (`0`). Scoring starts at 100, minus 15 per failing check and minus 5 per warning; treat that as a regression signal, not a security rating.

The Action connects the way Claude, ChatGPT, and Cursor do and checks OAuth discovery, annotations, Origin and CORS, schemas, JSON-RPC hygiene, and the token cost of the tool list. It does not replace Inspector's tool calls, and it is not a penetration test.

If you do not use GitHub Actions, the same checks are available as a [CLI](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=test-mcp-server-before-shipping) against a URL or a stdio server, or as a [free hosted scan](https://mcp-readiness.omer20sh.workers.dev/?utm_source=blog&utm_medium=content&utm_campaign=test-mcp-server-before-shipping) for a public HTTPS endpoint.

Ship with both layers: Inspector for the behavior of your tools, and a CI scan for the surface every client will see on the next release.

## FAQ

**Can I scan a localhost server in CI?**
Yes. The Action is meant to run against a server you start earlier in the same job, for example `http://127.0.0.1:8787/mcp`. That is the most honest test of what you are about to ship, and it works for servers that are not on the public internet.

**Does the Action call my tools?**
The scanner is a surface check: initialize, `tools/list`, an unknown method, a foreign Origin, a CORS preflight, and OAuth discovery. It does not call your tools. Keep Inspector or your own integration tests for `tools/call`.

**What score should I fail under?**
Pick a number from your own baseline, then refuse to go backwards. Popular public servers in the 20 November 2026 set scored 90 to 100 on these checks, but a new server often starts lower. The Action's default is 70; raising `fail-under` to 80 once you are consistently above it is a reasonable next step.

**How is this different from running MCP Inspector in CI?**
Inspector's CLI is excellent for scripted `tools/list` or `tools/call` assertions. The Readiness Action is a fixed battery of interoperability and cost checks with a single score and an optional token budget. Most teams should use both: Inspector for the tools you implemented, the Action for the protocol and metadata around them.
