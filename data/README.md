# MCP servers expansion (CMO scan set)

Scanned unauthenticated with mcp-readiness-cli 0.1.0 (same probe as the hosted scanner) on 20 November 2026, Israel time. These are additional public remote MCP servers, not already on the live /mcp-servers/ list of 23.

## Results

- Attempted: 53 URLs from official vendor docs, the official MCP registry lists, well-known remote lists, and this repo's earlier examples/servers.txt (excluding the current 23).
- Scored successfully: 52 (17 answered tools/list without login; 35 require authentication).
- Failed: 1 — Asana v1 at https://mcp.asana.com/mcp, which reports it has been permanently shut down. The current v2 endpoint and the Asana Command endpoint both scored 100 (authentication required).
- Browserbase and Higgsfield AI are recorded at their working `/mcp` paths (`https://mcp.browserbase.com/mcp`, `https://mcp.higgsfield.ai/mcp`). The bare host URLs did not accept initialize.

## File

- `data/mcp-servers.json` — array of `{ slug, name, url, score, tools, tokens_per_turn, warnings, scanned_at, title, meta_description, summary, faqs:[{q,a}] }`
- Plain text only in every field. No HTML. No FAQPage JSON-LD (generate that in the worker template).
- `score`, `tools`, and `tokens_per_turn` are null when a scan failed. For authentication-required servers, `tools` and `tokens_per_turn` are null and `score` is the pre-login surface score. Numbers come from the real CLI report (`tokens.total` for token cost). Do not invent replacements.
- `warnings` are fail/warn findings from the scan, excluding Origin / CORS claims (those are intentionally omitted from this public copy).
- Failed scans stay in the file, with the scanner error in `warnings` and in the summary.

## What Venture Studio needs to do to ship

1. Do not treat this branch as a deploy. Leave `worker/` untouched on this branch; there are no worker edits here.
2. Copy `data/mcp-servers.json` into the worker page builder that already renders `/mcp-servers/` (today that builder is `reports/build-seo-pages.mjs`, which still reads the older `reports/popular-remote-servers-2026-11-20.json` shape). Adapt the builder to this schema, or map fields: `tools` to tool count, `tokens_per_turn` to token cost, `warnings` to open issues, plus `title`, `meta_description`, `summary`, and `faqs` for per-server SEO pages.
3. Suggested public path for a per-server page: `/mcp-servers/<slug>/` (or reuse `/s/<host>/<path>` and attach this copy). Generate FAQPage JSON-LD from `faqs`.
4. Append these rows to the comparison table on `/mcp-servers/`. Keep the existing 23 rows; this file is the expansion set only. Deduplicate by `url` if a server is later added twice.
5. Rebuild sitemap, robots, and llms.txt so the new per-server URLs are listed.
6. Deploy only after Omer OKs the merge. Do not post or submit anything from this data.

Scan method: `node mcp-readiness-cli --json --timeout 20000 <url>`, no token, no login.
