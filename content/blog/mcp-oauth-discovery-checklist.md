---
title: "The MCP OAuth discovery checklist"
description: "A step-by-step checklist for MCP OAuth: RFC 9728 protected resource metadata, authorization server metadata, the 401 WWW-Authenticate hint, and the legacy 2025-03-26 flow to avoid."
date: 2026-11-20
slug: mcp-oauth-discovery-checklist
---

# The MCP OAuth discovery checklist

> **TL;DR:** A protected MCP server is an OAuth 2.1 resource server. Clients find the authorization server through [OAuth 2.0 Protected Resource Metadata (RFC 9728)](https://www.rfc-editor.org/rfc/rfc9728.html), not by guessing a login URL. On an unauthenticated request the server should return `401 Unauthorized` with a `WWW-Authenticate` header whose `resource_metadata` parameter points at that document. The document must include `authorization_servers`. The authorization server must then advertise itself with [Authorization Server Metadata (RFC 8414)](https://www.rfc-editor.org/rfc/rfc8414.html) or OpenID Connect Discovery. In our 20 November 2026 unauthenticated scans of 23 popular remote MCP servers, 15 required OAuth and 14 of those 15 had a clean pre-login discovery surface. The one exception, Atlassian, still used the older 2025-03-26 discovery (authorization-server metadata on the MCP host, no RFC 9728).

This checklist is for people shipping a *remote* MCP server that requires login. It follows the [MCP authorization specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and the official [authorization tutorial](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/authorization). It is not legal advice and not a substitute for a review of your identity provider.

## What "discovery" means here

An MCP client is an OAuth 2.1 client. When it first connects with no token, it does not already know which authorization server (AS) your deployment uses, which scopes you support, or where to register itself. The MCP specification is explicit about how that information is found:

- MCP servers **must** implement RFC 9728 Protected Resource Metadata (PRM).
- MCP clients **must** use that metadata to discover the authorization server.
- The PRM document **must** include an `authorization_servers` field with at least one issuer URL.
- Authorization servers **must** offer at least one of RFC 8414 metadata or OpenID Connect Discovery 1.0, and clients **must** support both.

That split matters. The MCP host advertises *which* authorization server to use. The authorization server advertises *how* to talk to it (authorization endpoint, token endpoint, supported grants, and so on). Putting authorization-server metadata on the MCP host, and skipping RFC 9728, is the older 2025-03-26 shape. It still appears in the wild.

## The checklist

**1. Unauthenticated MCP requests get a real HTTP 401.**
A protected resource should challenge the client. A `200` that hides "please log in" inside a JSON-RPC result, or a `404` that looks like the endpoint does not exist, will stall clients that are trying to start the OAuth flow. The [authorization tutorial](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/authorization) describes this first response as `401 Unauthorized` plus a pointer to the PRM document.

**2. The 401 includes `WWW-Authenticate` with `resource_metadata`.**
[RFC 9728 Section 5.1](https://www.rfc-editor.org/rfc/rfc9728.html#name-www-authenticate-response) is the mechanism MCP names first. The header should carry the URL of your protected resource metadata, for example:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
```

Clients must use this URL when it is present.

**3. Serve Protected Resource Metadata, at the header URL and at the well-known locations.**
MCP servers must implement one of the RFC 9728 discovery mechanisms, and clients must support both: the header above, and the well-known URIs. The well-known document can live at the path of the MCP endpoint or at the root. The specification's example is that `https://example.com/public/mcp` may host metadata at `https://example.com/.well-known/oauth-protected-resource/public/mcp`, with `https://example.com/.well-known/oauth-protected-resource` as the root fallback. Clients try the header first, then those well-known URIs in that order.

The document itself is JSON. A minimal, specification-shaped example looks like this (field set taken from the [tutorial](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/authorization)):

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["mcp:tools", "mcp:resources"]
}
```

`resource` should identify *this* MCP server. `authorization_servers` should list issuer URLs the client can follow. Do not leave `authorization_servers` empty; the MCP specification requires at least one entry.

**4. The authorization server publishes its own metadata.**
Once the client has an issuer from `authorization_servers`, it fetches Authorization Server Metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html)) or OpenID Connect Discovery. That is the AS's job, not the MCP server's. Confirm the issuer's well-known document is reachable, that its `issuer` matches, and that the authorization and token endpoints it advertises actually work.

**5. Clients send the `resource` parameter, and every MCP request carries the token.**
MCP clients must implement [Resource Indicators for OAuth 2.0 (RFC 8707)](https://www.rfc-editor.org/rfc/rfc8707.html). The `resource` parameter must be included in authorization requests and token requests, and it must identify the canonical URI of the MCP server the token is for. That is how a token minted for server A is kept from being used on server B. On the wire, MCP requests use `Authorization: Bearer <access-token>`, and the specification says authorization must be included in every HTTP request from client to server, even inside the same logical session.

**6. Plan for how clients register.**
The MCP authorization specification says authorization servers and clients **should** support OAuth Client ID Metadata Documents, and **may** support Dynamic Client Registration ([RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html)). Pick one story and document it. "Our server requires OAuth" is not enough if a new MCP client has no client_id and no registration path.

**7. Do not ship the 2025-03-26 discovery shape on a new server.**
The legacy flow advertised authorization-server metadata on the MCP host and skipped RFC 9728 protected-resource metadata. Current MCP clients are required to discover the AS through RFC 9728. If you only publish AS metadata next to the MCP endpoint, a client following the current spec will not find you the way you expect.

## What the popular-server scan shows

On 20 November 2026 we scanned 23 well-known remote MCP servers without logging in, and published the results at [Popular MCP servers](https://mcp.pacerai.fit/mcp-servers/). Fifteen of the 23 require OAuth, so the public scan can only see the pre-login surface: the 401, `WWW-Authenticate`, and protected-resource discovery. Fourteen of those fifteen had no open pre-login issue on that surface. The one open issue was Atlassian (`https://mcp.atlassian.com/v1/mcp`), which scored 95 and "uses the older 2025-03-26 discovery (AS metadata on the MCP host, no RFC 9728)."

That is a useful baseline: the well-known vendors mostly get discovery right, and the remaining miss is the exact legacy shape this checklist tells you to avoid. These are automated surface checks, not a security audit and not an endorsement of any listed vendor.

## How to verify before you ship

Walk the path a client walks. Request the MCP endpoint with no `Authorization` header and read the status and `WWW-Authenticate` value. Fetch the `resource_metadata` URL and the well-known fallbacks. Confirm `authorization_servers`, then fetch RFC 8414 or OpenID Connect Discovery from the issuer. Only then try a token.

To catch regressions, [scan the server](https://mcp.pacerai.fit/?utm_source=blog&utm_medium=content&utm_campaign=mcp-oauth-discovery-checklist) and add the [MCP Readiness Scan GitHub Action](https://github.com/Om3rr/mcp-readiness-check?utm_source=blog&utm_medium=content&utm_campaign=mcp-oauth-discovery-checklist) to the pull request that changes auth. The Action connects the way a client does and checks the 401, `resource_metadata`, RFC 9728, RFC 8414, and whether the server is still on the 2025-03-26 flow.

## FAQ

**Is RFC 9728 optional if I already publish RFC 8414 on the MCP host?**
No. The MCP authorization specification requires servers to implement protected resource metadata, and it requires clients to use that metadata to discover the authorization server. RFC 8414 still matters, but it belongs on the authorization server. Publishing only AS metadata on the MCP host is the legacy 2025-03-26 shape.

**Where should `/.well-known/oauth-protected-resource` live if my MCP path is not `/`?**
Serve the document at the URL you put in `resource_metadata`, and also follow RFC 9728's well-known insertion so a client that never saw the 401 can still find it. The MCP specification allows the well-known document at the MCP path (`/.well-known/oauth-protected-resource` plus the endpoint path) and at the root. Supporting both, plus the header, is the interoperable option.

**Why does a public scan not show tools for OAuth servers?**
Without a token, `tools/list` is behind the 401. The public comparison page therefore reports pre-login discovery only, and lists token cost as n/a for those fifteen servers. To score the tool list, use a test-tenant token or scan a local instance in CI.

**Does a clean discovery score mean the OAuth implementation is safe?**
No. A clean pre-login surface means clients can *find* your authorization server. It does not prove token validation, audience checks, PKCE, redirect-URI hygiene, or scope design. Use this checklist to get discovery right, then review the resource-server rules in the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and in OAuth 2.1 itself.
