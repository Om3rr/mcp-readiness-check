# GitHub Marketplace listing

Steps: tag `v1`, then **Draft a release → Publish this Action to the GitHub Marketplace**. Category: *Code quality* (primary), *Security* (secondary).

**Name:** MCP Readiness Scan (the name "MCP Readiness Check" is already taken on the Marketplace)

**Short description (≤125 chars):**
Live readiness + context-cost scan for MCP servers: OAuth discovery, annotations, Origin/CORS, schemas, token budget.

**Long description:**

> Your MCP server passes its unit tests. Will it work for real agents?
>
> MCP Readiness Check connects to your **running** server the way Claude, ChatGPT and Cursor do, and fails the PR when it isn't ready:
>
> - **OAuth discovery:** a 401 with `WWW-Authenticate`, RFC 9728 protected-resource metadata, broken or relative `resource_metadata` pointers, RFC 8414, PKCE S256, DCR
> - **Safety annotations:** `readOnlyHint` / `destructiveHint` on every tool, and write tools that are missing them
> - **Context cost:** how many tokens your `tools/list` costs on every agent turn, plus oversized descriptions. Set a `max-context-tokens` budget.
> - **Transport:** Origin validation (a spec MUST), wildcard CORS, JSON-RPC `-32601`, error leaks
> - **Schemas and poisoning:** untyped inputs, hidden-instruction patterns
>
> Built on a scan of 12,900+ live servers from the official MCP registry. 45% of public servers accept requests from any Origin.
>
> **Free:** score gate, token budget, top 3 issues, 50 runs/day per repo.
>
> Heavy tool list? Set `fix: safe` to run [ToolSlim](https://github.com/Om3rr/toolslim) after the scan and write a slimmer drop-in tools.json. Its free lossless optimizer cut Notion's official server from 17,477 to 5,213 tokens per call (70.2%, 13 Nov 2026).

**Usage:**

```yaml
name: mcp-readiness
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && (npm start &) && npx wait-on tcp:8787
      - uses: Om3rr/mcp-readiness-check@v1
        with:
          url: http://127.0.0.1:8787/mcp
          fail-under: 80
          max-context-tokens: 8000
          api-key: ${{ secrets.MCP_READINESS_KEY }}   # optional
```

**Tags / keywords:** mcp, model-context-protocol, ai-agents, oauth, security, ci, llm, claude, cursor, context-window

**Comparison blurb (README / listing FAQ):** Config scanners such as snyk/agent-scan check the clients and configs on your developers' machines. Repo auditors such as checkmcp.dev grade source repositories. MCP Readiness Check probes the *live endpoint* in your CI runner, including localhost, and measures what agents actually see and pay for. Use them together.
