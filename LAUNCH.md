# Launch checklist: MCP Readiness (self-serve)

Everything below is built and tested (`npm test`: 24 passing; CI also runs an Action self-test and `wrangler deploy --dry-run`). Each step that spends money, publishes, or creates an account needs Omer's yes.

| # | Step | Who | Cost | Time |
|---|---|---|---|---|
| 1 | Decide the license: MIT for the CLI and Action (as competitors do), keeping the Worker private, or keep everything UNLICENSED | Omer | — | 1 min |
| 2 | Make `mcp-readiness-check` public, tag `v1.0.0` and move the `v1` tag | Omer yes, then the bot runs `gh` | free | 5 min |
| 3 | Publish the Action to the GitHub Marketplace (text in [MARKETPLACE.md](MARKETPLACE.md)) | Omer (needs 2FA and accepting the Marketplace agreement) | free | 10 min |
| 4 | Cloudflare: create KV `LICENSES` and deploy the Worker (`worker/README.md`); optionally a custom domain | Omer adds `CLOUDFLARE_API_TOKEN`; the bot deploys | Workers Paid $5/mo recommended | 15 min |
| 5 | Payments: create the Lemon Squeezy store (merchant of record, which handles VAT; best for an Israeli sole trader) **or** Stripe; 5 products (Pro, Team, Verified, Pack, Credits); webhook secret | Omer (KYC and bank details) | ~5% + 50¢ per sale (LS) | 30–60 min |
| 6 | Paste checkout URLs and plan maps into `wrangler.toml`, `wrangler secret put …`, redeploy, make a test-mode purchase | bot | — | 15 min |
| 7 | Replace `mcp-readiness.example.workers.dev` in `action.yml` and the README with the real domain | bot | — | 5 min |
| 8 | Content magnet: publish `reports/state-of-mcp-2026-11.pdf` (it's also served at `/state-of-mcp-2026-11.html`) with a LinkedIn / r/mcp post | Omer yes | free | — |
| 9 | Optional: list `scan_mcp` (the remote MCP at `/mcp`) in the official MCP registry and on mcp.so | Omer yes | free | 20 min |

**Prices** (CMO verdict, 13 Nov): Free (daily cap) · **Pro $19/mo** · Team $99/mo · Verified badge $79 one-off · Report pack $9 · pay-per-scan $0.04 (250 credits for $10). Org $29/mo is reserved for later. Marketing and launch are owned by the CMO bot.

**Break-even:** $5/mo of Workers plus payment fees, so one Pro subscription covers it.
