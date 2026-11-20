---
title: "How to reduce MCP tool-list token cost"
description: "A practical guide to shrinking the tokens an MCP server adds on every agent turn, with live measurements from 8 open popular servers and a CI budget you can enforce."
date: 2026-11-20
slug: reduce-mcp-tool-list-token-cost
---

# How to reduce MCP tool-list token cost

> **TL;DR:** Every MCP client has to show the model the server's tool list — names, descriptions, and JSON Schemas — so the model can decide what to call. That payload is paid for on every agent turn, not just once. In our unauthenticated scans of popular remote MCP servers on 20 November 2026, the open servers ranged from about 80 tokens per turn (Astro Docs, one tool) to about 4,967 tokens (Hugging Face, four tools). The gap is almost never "too many tools." It is long descriptions and bulky schemas. Measure the list, cut the text the model does not need, split or scope tools, and fail CI when the list blows a budget.

An MCP tool is more than a function name. The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) says a server that supports tools must answer `tools/list` with the tools the caller can see. Each item carries a `name`, a `description`, an `inputSchema` (typically a JSON Schema object), and optional annotations such as `readOnlyHint` and `destructiveHint`. MCP clients put that list into the model's context so the model can pick a tool and fill in arguments.

That is the token cost people underestimate. The tool list is not a one-time handshake; it is part of the prompt for every turn. Add a second MCP server, and you add a second list. A 4,967-token list is context you cannot spend on the user's question or the tool result.

## What popular servers actually cost

These figures are from the live comparison page [Popular MCP servers: readiness scores and token cost](https://mcp-readiness.omer20sh.workers.dev/mcp-servers/), based on unauthenticated scans on 20 November 2026. Token counts are estimates (about ±10%). Only the eight servers that answered `tools/list` without login have a token number; the fifteen OAuth-protected servers on that page do not, because we did not log in.

| Server | Tools | Tokens per turn | Notes on the list |
| --- | ---: | ---: | --- |
| [Astro Docs](https://mcp.docs.astro.build/mcp) | 1 | ~80 | Lean baseline |
| [DeepWiki](https://mcp.deepwiki.com/mcp) | 3 | ~427 | |
| [Cloudflare Docs](https://docs.mcp.cloudflare.com/mcp) | 2 | ~434 | |
| [Exa Search](https://mcp.exa.ai/mcp) | 2 | ~605 | |
| [Microsoft Learn](https://learn.microsoft.com/api/mcp) | 3 | ~1,215 | |
| [Context7](https://mcp.context7.com/mcp) | 2 | ~1,304 | `resolve-library-id` description is 2,006 characters |
| [AWS Knowledge](https://knowledge-mcp.global.api.aws) | 5 | ~1,978 | `aws___read_documentation` description is 2,118 characters |
| [Hugging Face](https://huggingface.co/mcp) | 4 | ~4,967 | `hf_fs` description is 3,674 characters |

Three of those eight servers have at least one tool description the scanner flags as too long. Hugging Face's four tools cost roughly sixty times what Astro Docs costs, mostly because one description is 3,674 characters — around 900 tokens at four characters per token, before the schema or the other tools.

The long tail is worse. The same comparison page points to our [State of public MCP servers](https://mcp-readiness.omer20sh.workers.dev/state-of-mcp-2026-11.html) report (official registry scan, 13 November 2026), where the longest single tool description was 27,638 characters.

Cite as: MCP Readiness, popular remote MCP servers, 20 November 2026, [https://mcp-readiness.omer20sh.workers.dev/mcp-servers/](https://mcp-readiness.omer20sh.workers.dev/mcp-servers/).

## Why descriptions and schemas dominate

Tool *count* is the number people look at first, and it is the wrong leading indicator. Context7 exposes two tools and still costs about 1,304 tokens. Microsoft Learn exposes three and costs about 1,215. DeepWiki also exposes three and costs about 427. The difference is how much text travels with each tool.

A description that tries to be the manual is billed on every turn, including turns where the model never calls that tool. Property descriptions on `inputSchema` have the same problem: a dozen fields, each with a long explanation and a large enum, will outweigh a short top-level description.

Annotations such as `readOnlyHint` and `destructiveHint` are small, useful hints for clients (see the [tools spec](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)). They are not a substitute for a short description, and they will not fix a 2,000-character blurb. Two of the eight open servers in the 20 November 2026 scan declared no tool annotations at all; that is a readiness issue, not a token issue.

## A practical reduction sequence

**1. Measure the live list, not the source file.** What the model sees is the `tools/list` response after initialize, not your TypeScript comments. Paste the server URL into the [free MCP Readiness scan](https://mcp-readiness.omer20sh.workers.dev/?utm_source=blog&utm_medium=content&utm_campaign=reduce-mcp-tool-list-token-cost) and read the tokens-per-turn figure. If the server requires login, scan from CI against a local process, or with a test-tenant token, so you see the same list a signed-in client would get.

**2. Rewrite descriptions as routing text.** A good tool description answers two questions: what does this tool do, and when should the model choose it instead of a sibling tool? One or two short paragraphs are enough. Move tutorials and copy-pasted API docs out of `tools/list`. If a tool truly needs a long contract, put that contract behind a resource or a doc URL the model can fetch when it needs it.

**3. Tighten `inputSchema`.** Keep `type: object`, name the required properties, and describe each argument in a sentence. Drop unused properties. If an enum has dozens of values the model rarely needs, consider a smaller enum plus a documented extension, or a search tool that looks up valid values, rather than inlining a catalog into every prompt.

**4. Ship fewer tools to each caller.** The tools spec allows the set returned by `tools/list` to vary with the authorization on the request — for example, returning only the tools the caller's scopes permit. That is both a least-privilege practice and a token cut. If one process has become a toolbox for "everything our company does," split it into focused servers and let the user install only what the agent needs.

**5. Put a budget in CI so the list cannot quietly grow.** The free [MCP Readiness Scan GitHub Action](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=reduce-mcp-tool-list-token-cost) can fail a pull request when the tool list exceeds a token budget. Start the server in the job, then scan it:

```yaml
- uses: Om3rr/mcp-readiness-check@v1
  with:
    url: http://127.0.0.1:8787/mcp
    fail-under: 80
    max-context-tokens: 8000
```

`max-context-tokens` is estimated at about four characters per token. Pick a budget from your own baseline: an 8,000-token cap would still let a Hugging Face-sized list through. If your server looks more like Astro Docs or DeepWiki, a lower cap will catch a single bloated description before it ships.

**6. On the client side, install less.** Even a perfectly slim server is charged again if the user stacks five of them. Prefer one focused server over a bundle.

Shrinking `tools/list` does not reduce the tokens in a large *tool result*, and it does not replace authorization or Origin checks. The public numbers are surface measurements, not a security audit. Token figures can move when a vendor ships a new list.

If you want a first measurement today, [scan your MCP server](https://mcp-readiness.omer20sh.workers.dev/?utm_source=blog&utm_medium=content&utm_campaign=reduce-mcp-tool-list-token-cost) (free, no sign-up) and add the [GitHub Action](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=reduce-mcp-tool-list-token-cost) so the next bloated description fails the PR instead of the agent's context window.

## FAQ

**How is "tokens per turn" estimated?**
We estimate the size of the `tools/list` payload the model would see, at about four characters per token. The comparison page states that these counts are estimates of about ±10%. They are for comparing lists and setting a CI budget, not for invoicing a model provider.

**Does a short tool list make the model worse at calling tools?**
Not if you keep the routing information: a clear name, a short "when to use this" description, and a schema that names required arguments. What usually hurts quality is a wall of text that crowds out the user request, or several tools whose descriptions overlap so the model cannot tell them apart.

**Why don't OAuth-protected servers show a token cost on the public page?**
Without a login, a public scan can only see the pre-login surface: the 401, the `WWW-Authenticate` header, and OAuth protected-resource metadata. It cannot download `tools/list`. To measure those servers, scan a local instance in CI or pass a test-tenant token to the Action.

**Can I paginate `tools/list` to cut tokens?**
The tools specification supports pagination with a cursor, which helps clients that fetch the list in pages. It does not, by itself, stop a client from installing the full set into the model context. Treat pagination as a transport convenience. The reliable cuts are a smaller list, shorter descriptions, tighter schemas, and a CI budget.
