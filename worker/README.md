# MCP Readiness: hosted service (Cloudflare Worker)

Free web scan (score + top 3 issues), a paid full report (HTML, plus PDF when Browser Rendering is set up), a README badge, GitHub Action metering, and a pay-per-scan remote MCP tool (`scan_mcp`). Payments arrive through **Stripe Payment Links** or **Lemon Squeezy** webhooks. Both are ready to connect and both are off until their env vars are set. Nothing is deployed and no payment accounts exist yet.

## Routes

| Route | What it does | Access |
|---|---|---|
| `GET /` | Landing page with a scan form, pricing and the report magnet | public |
| `GET /s/<host>/<path>` | Indexable server page (server-rendered, stable URL, title/meta/canonical, JSON-LD). Badges link here. Runs a free scan if the cached one is older than 24 h | public |
| `GET /scan?url=…` | 301 to the server page | public |
| `GET /sitemap.xml`, `/robots.txt` | Every scanned server page, for search engines | public |
| `POST /api/scan {url}` | Free: score, context tokens, top 3 issues. With `Authorization: Bearer <key>`: full findings with fixes (1 unit) | public, 10/h per IP |
| `GET /api/report?url=…&format=html\|pdf` | Full report | license |
| `GET /badge.svg?url=…` | Score badge, cached 6 h | public |
| `POST /api/ci/run {repo}` | GitHub Action metering: `free` (50/day per repo), `capped` or `full` | public / license |
| `POST /mcp` | Remote MCP server with one tool, `scan_mcp` (1 credit per call) | license |
| `POST /api/monitor {url, webhook?, remove?}` | Daily re-scan (cron 06:17 UTC). On score, findings or context-cost drift, POSTs `mcp_readiness.drift` to your webhook. Pro 10, Team 200 servers | license |
| `GET /api/license` | Plan, status, remaining | license |
| `POST /api/subscribe {email}` | Report-magnet email capture (KV `lead:*`) | public, 5/h per IP |
| `POST /webhooks/stripe` | `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` | Stripe signature |
| `POST /webhooks/lemonsqueezy` | `order_created`, `subscription_created`, `subscription_payment_success`, `subscription_cancelled`, `subscription_expired` | HMAC `X-Signature` |
| `GET /thanks?session_id=…` / `?ls_order=…` | Shows the new license key once | — |

## Plans (src/license.js)

| Plan | Price | Units |
|---|---|---|
| Free | $0 | paste-a-URL scan 10/h with no sign-up, Action 50 runs/day per repo (top 3 issues), badge + indexable server page |
| `pro` | $19/mo | 2,000 runs or scans/mo, every finding with its fix, ToolSlim rewrite, hosted report, scans behind a test token, 10 monitors |
| `team` | $99/mo | 20,000 hosted scans/mo, 200 monitors, multiple API keys |
| `verified` | $79 one-time | fresh re-audit + directory listing; Verified badge only if it passes |
| `pack` | $9 one-off | 5 full reports |
| `credits` | $5 one-off | 100 pay-per-scan credits ($0.05 each, floor $0.03; API or `scan_mcp`) |
| `org` | $29/mo | added later (SARIF, 5,000 CI runs, seats); not shown at launch |

Paid plans are **coming soon**. GitHub Marketplace has no paid plans for Actions, so the Action stays free and any paid plan will be billed on the hosted site. No checkout is wired up yet: server pages and the landing page show "coming soon" with no links.

The ToolSlim hook works like this: when the tool list costs more than `TOOLSLIM_THRESHOLD_TOKENS` (default 5,000) or descriptions are oversized, `/api/scan` returns `fix: { tool: "toolslim", command, url }`. The landing page and the Action summary show it as the "fix" step.

License keys look like `mrc_live_<40 hex>`. Only their SHA-256 hash is stored in KV.

## Launch steps (Omer approves each)

1. **Cloudflare**: `npx wrangler kv namespace create LICENSES`, then paste the id into `wrangler.toml`. Set `PUBLIC_URL`, then run `npx wrangler deploy`. Workers Paid ($5/mo) is recommended because large tool lists can exceed the Free plan's 10 ms CPU limit.
2. **Pick one payment provider.**
   - **Stripe**: create 5 Payment Links (Pro $19/mo, Team $99/mo, Verified $79, Pack $9, Credits $5). Set each link's success URL to `https://<domain>/thanks?session_id={CHECKOUT_SESSION_ID}`. Put the links in `CHECKOUT_URL_*` and the `plink_…` → plan map in `STRIPE_PLAN_BY_LINK`. Add a webhook endpoint at `/webhooks/stripe` with the 4 events above, then `wrangler secret put STRIPE_WEBHOOK_SECRET`.
   - **Lemon Squeezy** (merchant of record, so it handles VAT): create the same 5 variants. Set the redirect URL to `https://<domain>/thanks?ls_order=[order_id]`, map variants in `LEMON_PLAN_BY_VARIANT`, add the webhook at `/webhooks/lemonsqueezy`, then `wrangler secret put LEMON_WEBHOOK_SECRET`.
3. **Optional PDF**: set `CF_ACCOUNT_ID` and `wrangler secret put CF_BROWSER_TOKEN` (Browser Rendering).
4. Smoke test: `curl https://<domain>/api/health`. Then make a test-mode purchase and confirm the key appears on `/thanks` and that `GET /api/license` returns it.

## Test

`npm test` at the repo root covers signatures, idempotency, licensing, quotas, metering, the SSRF guard and the MCP endpoint. `npx wrangler@4 deploy --dry-run` runs in CI.
