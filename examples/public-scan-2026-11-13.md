# Public remote MCP servers: readiness scan (13 Nov 2026, about 17:35 Israel time)

Unauthenticated surface scan of 25 public MCP endpoints. No tools were executed. Servers that require OAuth were checked for the 2025-06-18 discovery flow: 401 + `WWW-Authenticate`, RFC 9728 protected-resource metadata, RFC 8414 authorization-server metadata, PKCE S256, and dynamic client registration. HTML report: [public-scan/index.html](public-scan/index.html).

| Server | Access | Tools | Score | Warnings |
|---|---|---|---|---|
| `docs.mcp.cloudflare.com/mcp` | Public | 2 | 100 | — |
| `learn.microsoft.com/api/mcp` | Public | 3 | 100 | — |
| `mcp.api.coingecko.com/mcp` | Public | 2 | 100 | — |
| `mcp.svelte.dev/mcp` | Public | 4 | 100 | — |
| `mcp.exa.ai/mcp` | Public | 2 | 100 | — |
| `mcp.semgrep.ai/mcp` | OAuth | — | 100 | — |
| `mcp.linear.app/mcp` | OAuth | — | 100 | — |
| `mcp.notion.com/mcp` | OAuth | — | 100 | — |
| `mcp.sentry.dev/mcp` | OAuth | — | 100 | — |
| `api.githubcopilot.com/mcp/` | OAuth | — | 100 | — |
| `mcp.stripe.com` | OAuth | — | 100 | — |
| `mcp.supabase.com/mcp` | OAuth | — | 100 | — |
| `mcp.neon.tech/mcp` | OAuth | — | 100 | — |
| `bindings.mcp.cloudflare.com/mcp` | OAuth | — | 100 | — |
| `mcp.vercel.com` | OAuth | — | 100 | — |
| `mcp.paypal.com/mcp` | OAuth | — | 100 | — |
| `mcp.asana.com/mcp` | OAuth | — | 100 | — |
| `mcp.intercom.com/mcp` | OAuth | — | 100 | — |
| `mcp.webflow.com/mcp` | OAuth | — | 100 | — |
| `mcp.jam.dev/mcp` | OAuth | — | 100 | — |
| `mcp.deepwiki.com/mcp` | Public | 3 | 95 | annotations.none |
| `mcp.context7.com/mcp` | Public | 2 | 95 | tools.description_long |
| `huggingface.co/mcp` | Public | 4 | 95 | tools.description_long |
| `mcp.atlassian.com/v1/mcp` | OAuth | — | 95 | auth.legacy_discovery |
| `knowledge-mcp.global.api.aws` | Public | 5 | 90 | tools.description_long, rpc.method_not_found |

Our own prototype, for contrast: [agent-commerce-mvp v0.3](agent-commerce-v0.3.md) scored **60**: foreign Origins accepted, wildcard CORS, no annotations on its write tools. [v0.4](agent-commerce-v0.4.md) scores **100**.

Takeaways:

1. The big vendors (Stripe, Notion, Linear, Sentry, GitHub, Supabase, Vercel, PayPal, Cloudflare and others) all publish RFC 9728 metadata and advertise PKCE S256. No dynamic client registration: api.githubcopilot.com/mcp/. Atlassian still uses the older 2025-03-26 flow.
2. Among public read-only servers, the common gaps are bloated tool descriptions (2,000–3,700 characters, which costs context on every turn) and missing readOnly/destructive annotations.
3. The real risk is not in these servers. It is in **internal and localhost servers with write tools**, which teams build in a sprint and nobody scans.
