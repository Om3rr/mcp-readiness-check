# Public remote MCP servers, unauthenticated surface scan (13 Nov 2026, ~17:30 Israel time)

| Server | Tools | Score | Main ⚠️ |
|---|---|---|---|
| Cloudflare docs (`docs.mcp.cloudflare.com/mcp`) | 2 | 100 | (CORS `*` noted as info: public read-only) |
| DeepWiki (`mcp.deepwiki.com/mcp`) | 3 | 95 | no tool annotations |
| Context7 (`mcp.context7.com/mcp`) | 2 | 95 | one tool description ≈2,000 chars |
| Hugging Face (`huggingface.co/mcp`) | 4 | 95 | one tool description ≈3,700 chars |
| Semgrep (`mcp.semgrep.ai/mcp`) | n/a | n/a | requires auth (401 + WWW-Authenticate), good |
| agent-commerce-mvp v0.3 (ours, local) | 13 | **60** | foreign Origin accepted, wildcard CORS, no annotations on write tools |
| agent-commerce-mvp v0.3.1 (ours, after fixes) | 13 | 100 | none |

Takeaway: the big public read-only servers are in good shape. The risk sits in **internal and localhost servers with write tools**, the kind teams build in a sprint, where a foreign Origin or missing approval hints actually matter. Our own prototype is the example.
