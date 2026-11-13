# Registry-wide scan, 2026-11-13

Every streamable-HTTP remote listed in the official MCP registry
(`registry.modelcontextprotocol.io`, name prefixes `ac.*`–`com.g*`, plus all
`*.co.il` / Israel-related entries), probed once, unauthenticated, with
`mcp-readiness-check` v0.2.1. One server per host. 24 parallel probes, 20 s timeout.

| | |
|---|---|
| Endpoints probed | 4,622 |
| Reachable | 4,346 (276 down, 404 or timed out) |
| Public (tools/list without login) | 2,438 |
| Behind a 401 | 1,908 |
| Scored 100 | 60% |

Public servers:

| Gap | Share |
|---|---|
| Accept a foreign `Origin` header (DNS-rebinding guard missing) | 46% |
| No tool annotations at all, or write-sounding tools without them | 24% |
| `Access-Control-Allow-Origin: *` | 22% |
| Unknown JSON-RPC method doesn't return -32601 | 15% |
| At least one tool description over 1,500 chars | 10% |
| More than 40 tools | 5% |
| Median tool count | 7 (max 453) |
| Longest single tool description | 18,021 chars |

Servers behind a 401:

| Gap | Share |
|---|---|
| No RFC 9728 protected-resource metadata, or only the legacy 2025-03-26 flow | 10% |
| 401 without a `WWW-Authenticate` header | 6% |

Note: v0.2 over-matched "credential" wording ("needs no API key") as tool
poisoning. v0.2.1 narrows the rule; 20 public servers are still flagged and
need a human read before anyone calls them poisoned.

Reproduce: `IN=remotes.json OUT=results.json node scan.mjs 5000 0`
(remotes.json = the registry export: name, url, website).
