# MCP readiness report: agent-commerce-mvp

Target: `agent-commerce-mvp v0.3 (local)` · protocol 2025-06-18 · 13 tools · **score 60/100**

- ❌ **Requests with a foreign Origin header are accepted** — The MCP Streamable HTTP spec says servers MUST validate Origin to prevent DNS-rebinding attacks, which matters most for localhost servers.
  - Fix: Reject requests whose Origin is not on an allow-list (403).
- ⚠️ **"create_listing" sounds state-changing but has no annotations** — Clients use readOnlyHint/destructiveHint/idempotentHint to decide when to ask the human first.
  - Fix: Add annotations, e.g. { destructiveHint: true } or { readOnlyHint: true }.
- ⚠️ **"approve_listing" sounds state-changing but has no annotations** — Clients use readOnlyHint/destructiveHint/idempotentHint to decide when to ask the human first.
  - Fix: Add annotations, e.g. { destructiveHint: true } or { readOnlyHint: true }.
- ⚠️ **"approve_deal" sounds state-changing but has no annotations** — Clients use readOnlyHint/destructiveHint/idempotentHint to decide when to ask the human first.
  - Fix: Add annotations, e.g. { destructiveHint: true } or { readOnlyHint: true }.
- ⚠️ **No tool declares annotations** — 0 of 13 tools have readOnlyHint/destructiveHint.
  - Fix: Annotate every tool; mark reads readOnlyHint: true.
- ⚠️ **CORS allows any origin (Access-Control-Allow-Origin: *)** — Any website the user visits can script calls to this server from the browser.
  - Fix: Allow-list known origins.
- ℹ️ **"search" is a generic name** — With several servers connected, generic names collide or get shadowed by another server's tool.
  - Fix: Prefix tool names with the server or domain, e.g. "acme_search".
- ℹ️ **13 of 13 tools have no human-readable title** — Since 2025-06-18 clients show the title in approval prompts. Missing: create_listing, approve_listing, search, make_offer, counter_offer, accept_offer…
  - Fix: Add title: "…" to each tool.
- ℹ️ **No Mcp-Session-Id issued** — Fine for stateless servers.

_Automated surface checks only. They do not replace a design review of auth, data flows, and human-approval gates._
