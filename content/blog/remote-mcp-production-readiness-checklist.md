---
title: "A production-readiness checklist for remote MCP servers"
description: "A practical checklist for shipping a remote MCP server: Origin validation, OAuth discovery, tool annotations, JSON-RPC errors, and a token budget, with figures from 23 popular servers."
date: 2026-11-20
slug: remote-mcp-production-readiness-checklist
---

# A production-readiness checklist for remote MCP servers

> **TL;DR:** A remote MCP server is production-ready when a client can complete `initialize` and `tools/list` over HTTPS, when an invalid `Origin` is rejected with HTTP 403, when protected endpoints advertise OAuth through RFC 9728, when tools are annotated and their list is small enough to attach to every turn, and when unknown methods return JSON-RPC `-32601`. Popular vendors already score 90–100 on those surface checks; the remaining misses are consistent. In unauthenticated scans of 23 well-known remote servers on 20 November 2026, 7 of 8 open servers accepted a foreign `Origin`, 2 of 8 declared no tool annotations, 3 of 8 had at least one overly long description, and 1 of 15 OAuth-protected servers still used the older 2025-03-26 discovery flow. Walk this checklist, then [scan the endpoint](https://mcp-readiness.omer20sh.workers.dev/?utm_source=blog&utm_medium=content&utm_campaign=remote-mcp-production-readiness-checklist) and gate it in CI.

This is a shipping checklist for *remote* Streamable HTTP (or HTTP+SSE) servers, not a security audit and not a review of your business logic. The protocol sources are the [MCP transports specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), the [tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), and the [authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization). The numbers are from the live page [Popular MCP servers: readiness and token cost](https://mcp-readiness.omer20sh.workers.dev/mcp-servers/) (20 November 2026). Token counts are estimates of about ±10%.

## 1. Transport and Origin

Serve the public endpoint on HTTPS. A remote server that only answers plain HTTP is not ready for real clients.

Validate the `Origin` header on incoming connections. The transport specification says servers **must** do this to prevent DNS rebinding, and **must** respond with HTTP 403 Forbidden when the header is present and invalid. The response body may be a JSON-RPC error with no `id`. This matters most for servers that also run on localhost, but the MUST is not limited to local dev: seven of the eight open popular servers in the 20 November 2026 scan accepted a foreign `Origin`. Do not confuse "our API is public" with "any website may drive this endpoint from a browser." If you deliberately allow a set of web clients, allow-list those origins; do not silently accept everything.

When you run the same server on a laptop, bind to `127.0.0.1` rather than `0.0.0.0`, as the transport specification recommends. Confirm CORS is not a wildcard next to an unauthenticated write tool.

## 2. Handshake and JSON-RPC hygiene

A client must be able to complete `initialize` and, if you declared the tools capability, `tools/list`. Return `protocolVersion` and `serverInfo`. Keep the tool set stable for a given authorization: the tools specification says the list may be empty and may change over time, and it may vary with the caller's credentials, but it must not wobble as a side effect of other requests on the connection.

Unknown methods should fail as JSON-RPC `-32601` (method not found), not as an HTTP 5xx or a silent drop. On the popular-server scan, AWS Knowledge scored 90 with an open issue that unknown methods did not return `-32601`. That is a small bug with a large debugging cost once a gateway or an older client is in the path.

## 3. Authorization, if the server is not public

If `tools/list` or tool calls require a user, the server is an OAuth 2.1 resource server. Follow the [OAuth discovery checklist](./mcp-oauth-discovery-checklist.md): unauthenticated requests get HTTP 401, `WWW-Authenticate` carries `resource_metadata`, the protected-resource document ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html)) includes `authorization_servers`, and the issuer publishes [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html) or OpenID Connect Discovery. Clients must send the `resource` parameter ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html)) and must attach `Authorization: Bearer` on every HTTP request.

Do not ship the 2025-03-26 shape (authorization-server metadata on the MCP host, no RFC 9728) on a new server. In the 20 November 2026 scan, 15 of 23 popular servers required OAuth, 14 of those 15 had a clean pre-login surface, and the one miss was Atlassian, still on that older discovery flow.

If the server *is* public, be honest about it: a documentation or search MCP that answers `tools/list` without a token is a product choice, not a bug. It is still subject to Origin checks and to everything in the tool-list section below.

## 4. Tool annotations, schemas, and size

Every tool needs a clear `name`, a short `description`, and an `inputSchema` that is a JSON Schema object with a `required` list where it matters. Add annotations: `readOnlyHint` on tools that do not change state, `destructiveHint` on tools that do. The tools specification treats these as hints for clients, not as a security boundary, but a write tool with no hints is how agents skip a confirmation they should have shown. Two of the eight open popular servers declared no tool annotations at all (Astro Docs and DeepWiki).

Then look at size. The tool list is attached to the model on every turn. Among the open servers, cost ranged from about 80 tokens per turn (Astro Docs, one tool) to about 4,967 (Hugging Face, four tools, with an `hf_fs` description of 3,674 characters). Context7 and AWS Knowledge were flagged for descriptions of 2,006 and 2,118 characters. The long tail, from the 13 November 2026 official-registry scan cited on the same page, included a single description of 27,638 characters. Set a budget, and keep descriptions to routing text — what the tool does and when to choose it.

## 5. Prove it in CI, not only in a chat client

A single successful session in Cursor or Claude is not a release test. Start the server in GitHub Actions and scan it, including on localhost:

```yaml
- uses: Om3rr/mcp-readiness-check@v1
  with:
    url: http://127.0.0.1:8787/mcp
    fail-under: 80
    max-context-tokens: 8000
```

The free [MCP Readiness Scan Action](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=remote-mcp-production-readiness-checklist) checks the surface in this checklist and can fail the job on a score or a token budget. It does not call your tools. Before you tag a release, also run [MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) (or an equivalent client) against one read path and one write path.

For a public HTTPS URL, you can get a first reading from the [free hosted scan](https://mcp-readiness.omer20sh.workers.dev/?utm_source=blog&utm_medium=content&utm_campaign=remote-mcp-production-readiness-checklist) and keep a badge on the README that points at the public report page.

## What this checklist does not cover

It does not prove that tool implementations are correct, that output cannot prompt-inject the model, that tokens are audience-restricted, or that your rate limits will hold. Those need Inspector (or integration tests), a security review, and load tests. The popular-server scores of 90–100 mean the well-known vendors get the basics right; they are not a certificate, and they are not an endorsement.

If you work through the five sections above and the CI gate is green, you have a remote MCP server that clients can find, authorize, and afford to install. That is the production-ready bar this checklist is willing to set.

## FAQ

**We scored 100 on a hosted scan. Are we done?**
No. A 100 on a surface scan means the handshake, discovery, Origin, annotations, and list-size checks we run did not fail. It does not mean your tools are safe or correct. Call them with Inspector, and run a security review if the tools take untrusted input or perform writes.

**Should a documentation MCP require OAuth?**
Not necessarily. Several of the open servers in the 20 November 2026 set are docs or search endpoints that answer `tools/list` without login and score 95–100 on surface checks. If the data is public, that can be appropriate. You still need HTTPS, Origin handling, a slim tool list, and clean JSON-RPC errors.

**How do I keep this from regressing after launch?**
Add the [GitHub Action](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=remote-mcp-production-readiness-checklist) with a `fail-under` at or just below your current score and a `max-context-tokens` close to today's list size. Re-scan when you add a tool or change auth. The cheap failures — a missing annotation, a 3,000-character description, a dropped `WWW-Authenticate` header — are the ones CI is good at catching.
