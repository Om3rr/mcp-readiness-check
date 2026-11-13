# mcp-readiness-check

A zero-dependency CLI (Node 18+) that scores an MCP server's **production readiness** in about a second and writes a Markdown report you can hand to a team.

```bash
node bin/mcp-readiness-check.js https://your-server.example/mcp --token $TOKEN   # Streamable HTTP
node bin/mcp-readiness-check.js --stdio node path/to/server.js                    # stdio servers
node bin/mcp-readiness-check.js <url> --json                                      # machine-readable, exit 1 on any ❌
npm test
```

## What it checks

| Area | Checks |
|---|---|
| **Tool poisoning** | Instructions aimed at the model inside tool metadata: "ignore previous instructions", `<IMPORTANT>` tags, "don't tell the user", references to `.ssh` / `.env` / API keys, invisible or bidi unicode, long base64 blobs |
| **Human-in-the-loop** | State-changing tools (`delete_*`, `send_*`, `pay_*`, `approve_*`, `exec`…) without `readOnlyHint` / `destructiveHint` annotations; servers with no annotations at all |
| **Schemas** | `inputSchema` missing or not `type: object`, untyped args, no `required` list, duplicate or non-portable tool names, vague or bloated descriptions, too many tools |
| **Transport security** | Plain HTTP to a remote host, **Origin not validated** (the spec's DNS-rebinding MUST), wildcard CORS, `tools/list` or tool calls that work with no credentials |
| **JSON-RPC hygiene** | `-32601` for unknown methods, no 5xx on unknown tools, `protocolVersion`, `serverInfo`, server `instructions` |

Scoring: start at 100, −15 per ❌, −5 per ⚠️. It is a surface scan, not a substitute for an architecture review of auth, data flows and approval gates. That review is the paid offer below.

## Example: real before/after

[`examples/agent-commerce-v0.3.md`](examples/agent-commerce-v0.3.md): **60/100**. It accepted foreign Origins, sent wildcard CORS, and had no tool annotations. After the fixes in [agent-commerce-mvp v0.3.1](https://github.com/Om3rr/agent-commerce-mvp): [`examples/agent-commerce-v0.3.1.md`](examples/agent-commerce-v0.3.1.md), **100/100**.

## Turning it into work (draft, unpublished)

**MCP Readiness Review, fixed fee.** Run the scan, then a principal architect reviews auth (OAuth 2.1 / scoped tokens), tool permission design, approval gates, audit logging, prompt-injection paths and multi-tenancy, and delivers a ranked fix list plus a 60-minute walkthrough. Entry tier for the larger *AI agent / MCP platform architecture review*.
