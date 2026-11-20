# MCP Readiness: landing design and copy notes for Venture Studio

From the CMO, 20 Nov 2026, 18:45 Israel time. These notes are for your design-fix pass. I won't push any `worker/` changes. My earlier branch `cmo/seo-aeo-landing` (PR #5, stacked on #2) has a working reference implementation of everything below under `worker/`. Take what you want. Its event names predate your spec, so follow the spec section here, not that code.

## 1. Problems on the live site today (https://mcp-readiness.omer20sh.workers.dev, checked 18:37 Israel time with curl and headless Chrome at 1280 px and 390 px)

| # | Problem | Fix |
| --- | --- | --- |
| 1 | **The Action YAML block is invisible on desktop.** In `#action`, the left grid cell collapses to a few pixels wide because the badge `<pre>` on the right holds one very long unbroken line. Only a "-" shows. | Add `.grid>*{min-width:0}` and `pre{white-space:pre-wrap;word-break:break-all}`, or use `grid-template-columns:minmax(0,1fr) minmax(0,1fr)`. |
| 2 | The badge and remote-MCP snippets say `YOUR-DOMAIN`. | Use the real origin `https://mcp-readiness.omer20sh.workers.dev`, and link the badge to `/s/<host>/<path>` (the #2 page). |
| 3 | Paid cards show live-looking buttons ("Get Pro (soon)", "Buy 5 reports", "Buy 250 credits"), say "Cancel anytime", and disagree with #2 on credits ($0.04 / 250 for $10 here, $0.05 / 100 for $5 in #2). | Merging #2 fixes the buttons. Pick one credit price, and drop "Cancel anytime" until something is for sale. |
| 4 | The Action snippet comment says `# optional, Org plan`, but no Org plan exists. | Change it to `# Pro (coming soon)`. |
| 5 | At 390 px the nav wraps into three overlapping lines around the logo. | Under 640 px, hide the links except "GitHub Action", or use `overflow-x:auto; white-space:nowrap`. |
| 6 | At 390 px the 4-column comparison table is cramped and the code blocks clip. | Wrap the table in `<div style="overflow-x:auto">`; at narrow widths drop the third column (repo auditors). |
| 7 | The footer says `Contact: [email]`. | Choose an address (needs Omer) or remove the item. |
| 8 | The hero stats (12,926 servers, 45%) don't match `reports/state-of-mcp-2026-11.stats.json`, which says `ok` = 15,067 and `pub_origin` = 44. | Re-derive them from the stats file and use the same figure in the hero, the meta description and the report. AI engines quote these numbers, so they must agree everywhere. |
| 9 | The page has no sample target, so a first-time visitor has nothing to try. | Under the input, add "Try: `mcp.deepwiki.com/mcp` · `huggingface.co/mcp`" as links that fill the field and submit. This is the cheapest lift for scans. |
| 10 | There's no canonical, OG or JSON-LD, no `/llms.txt`, and `robots.txt` (Cloudflare managed) has no rules and no `Sitemap:` line. | See section 4. #2 adds a sitemap and robots; add `llms.txt` and the AI crawler lines. |
| 11 | The State of MCP email box says "(optional)", but the button reads as if the email is required. | Change the button to "Read the report". The email field stays optional, with the privacy line from the spec. |

## 2. Section-by-section copy and layout

1. **Nav**: MCP Readiness · GitHub Action · Popular servers · State of MCP report · Pricing.
2. **Hero** (centered, one input, one button):
   - H1: "Is your MCP server ready for real agents?"
   - Sub: "We connect to your live endpoint the way Claude, ChatGPT and Cursor do, then score OAuth discovery, Origin/CORS, tool annotations, schemas, and how many tokens your tool list costs on every turn."
   - Button: "Scan free". Under it: "No sign-up · public https only · we call initialize and tools/list, never your tools · Try: `mcp.deepwiki.com/mcp`".
3. **Result card** (after a scan):
   - The score, the server name, and "N tools · ~T tokens per turn".
   - The top 3 issues.
   - "Public page for this server →" (the /s/ page).
   - A badge box with a **Copy badge** button (`badge_copied`).
   - A primary button, **Gate it in CI**, which goes to the Marketplace (`action_install_click`).
4. **Proof strip**, 3 KPI cards from the stats file. Each card carries its date and links to the report.
5. **Action**, two equal columns:
   - Left: the YAML, with a Copy button.
   - Right: three bullets: fails PRs under a score; fails over a token budget; scans localhost inside your runner.
   - Buttons: "Install from GitHub Marketplace" (primary, `action_install_click`, link `https://github.com/marketplace/actions/mcp-readiness-scan?utm_source=mcp-readiness&utm_medium=landing&utm_campaign=action`) and "Docs".
6. **Popular servers teaser**: a table of 5 rows (name, score, tokens per turn) built from the data below, linking to the full page "Popular MCP servers: scores and token cost →".
7. **Why live**: keep the comparison table, and add a row "Token cost per turn: measured".
8. **Pricing**: keep #2's version. Under Pro, show the waitlist only behind the flag.
9. **FAQ**: 5 questions, visible on the page and marked up as FAQPage JSON-LD:
   - "How do I test an MCP server in production?"
   - "How many tokens does an MCP server cost per turn?"
   - "Do MCP servers have to validate Origin?"
   - "Is this a security audit?"
   - "Is it free?"
10. **Footer**: source, `/llms.txt`, `/stats.html` (public traffic, a trust signal), and the disclaimer.

## 3. Template: "Popular MCP servers" comparison page (`/mcp-servers/`)

- Title: "Popular MCP servers: readiness scores and token cost (20 November 2026)".
- Blocks, in order:
  1. "Key numbers" (5 computed bullets).
  2. Table A, "Open servers": server, score, tools, tokens per turn, open issues. Sorted by tokens.
  3. Table B, "OAuth servers (pre-login surface)".
  4. CTA card: "Scan my server" and "Add the GitHub Action".
  5. FAQ.
  6. Disclaimer: "automated surface checks, not an audit, not affiliated".
- JSON-LD: Dataset + ItemList + FAQPage. Each row links to its `/s/<host>/<path>` page.
- Data is recorded, never typed by hand: `reports/popular-remote-servers-2026-11-20.json` on branch `cmo/seo-aeo-landing`, built by `reports/build-seo-pages.mjs`.
- Real scans, 20 Nov 2026 about 18:30 Israel time, unauthenticated:

| Server | Score | Tools | Tokens/turn | Open issues |
| --- | ---: | ---: | ---: | --- |
| Astro Docs | 95 | 1 | 80 | no annotations |
| DeepWiki | 95 | 3 | 427 | no annotations |
| Cloudflare Docs | 100 | 2 | 434 | – |
| Exa Search | 100 | 2 | 605 | – |
| Microsoft Learn | 100 | 3 | 1,215 | – |
| Context7 | 95 | 2 | 1,304 | long description |
| AWS Knowledge | 90 | 5 | 1,978 | long description, method-not-found |
| Hugging Face | 95 | 4 | 4,967 | long description |
| 15 OAuth servers (Linear, Notion, Sentry, Stripe, Supabase, Vercel, GitHub, PayPal, Square, Neon, Webflow, Semgrep, Globalping, CF Bindings, Atlassian) | 95–100 | behind login | – | Atlassian: legacy 2025-03-26 discovery |

- Not scored: GitMCP (timeout) and Asana (`/sse` returns 410).
- 7 of 8 open servers accept a foreign Origin. This is info-level in the score.
- **Product note:** big-vendor servers cluster at 90–100, so this page sells on token cost, not on score. The long tail of the registry is where the low scores are, so the `/s/` pages for registry servers are the SEO surface that matters.

## 4. SEO / AEO checklist for the live worker

- Head: canonical, OG title and description, and SoftwareApplication + FAQPage JSON-LD (a ready block is in PR #5's `worker/public/index.html`).
- `/llms.txt` (a ready file is in PR #5).
- `/robots.txt`:
  - `Allow: /` for `*`, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended and Bingbot.
  - `Disallow: /api/`.
  - `Sitemap:` plus a comment pointing at llms.txt.
- Sitemap: add `/mcp-servers/` and every saved `/s/` page (#2 already does the /s/ pages).
- **Request to VS metrics:** don't drop AI crawlers as "bots". Count GPTBot, ClaudeBot, PerplexityBot and OAI-SearchBot hits per day as their own row. That's the leading AEO indicator in the 2-week test.
## CTA and event wiring (Venture Studio spec, 20 Nov 2026)

- Transport: `navigator.sendBeacon('/api/event', JSON.stringify({ event, path, ref }))`, same origin, with a `fetch(..., {keepalive:true})` fallback. No cookies, no raw IPs; storage is the D1 `studio-metrics` database; public counts at `/stats` and `/stats.html`.
- Allowed events: `landing_view`, `scan_started`, `scan_completed`, `scan_failed`, `badge_copied`, `action_install_click`, `pro_waitlist_signup`.
- **Landing and score pages fire only** `landing_view`, `badge_copied`, `action_install_click`, `pro_waitlist_signup`. The server logs `scan_started`, `scan_completed` and `scan_failed` itself, so the page never sends them.
- `path` = `location.pathname`. `ref` = referrer host (empty for direct visits). Proposal for VS to confirm: when the URL has `utm_source`, send `ref = "utm:<source>/<medium>/<campaign>"`, so launch posts, directories and badges are attributable without a new field. Only adopt it if VS agrees; otherwise keep the UTMs on links alone.
- Wiring per element:

| Element | Event | When |
| --- | --- | --- |
| Every landing, leaderboard and score page | `landing_view` | once on load |
| "Copy badge" button (after a scan, and on each score page) | `badge_copied` | after `navigator.clipboard.writeText` resolves |
| "Install from GitHub Marketplace" / "Add the GitHub Action" / "Gate it in CI" links | `action_install_click` | on click, before navigation (sendBeacon survives unload) |
| Pro waitlist form | `pro_waitlist_signup` | only after the server confirms the email was stored |

- **Pro waitlist (approved by Omer as private)**: ship it behind a flag that is off by default (`PRO_WAITLIST=on`). With the flag off, the section isn't rendered and `POST /api/waitlist` returns 404. When it's on, show this privacy line under the field: "We store your email only to tell you once when Pro opens. No marketing list, no sharing, delete on request: reply to that email." Keep emails out of events and logs.
- Minimal client snippet (no other events):

```js
const send=(event)=>{const b=JSON.stringify({event,path:location.pathname,ref:document.referrer?new URL(document.referrer).hostname:''});navigator.sendBeacon?.('/api/event',new Blob([b],{type:'application/json'}))||fetch('/api/event',{method:'POST',headers:{'content-type':'application/json'},body:b,keepalive:true})};
send('landing_view');
document.addEventListener('click',(e)=>{const a=e.target.closest?.('[data-event="action_install_click"]');if(a)send('action_install_click')},true);
```

### UTM conventions (on outbound and inbound links)

| Channel | utm_source | utm_medium | utm_campaign |
| --- | --- | --- | --- |
| README badge link-back | `badge` | `readme` | `badge-loop` |
| Show HN / Reddit / X / LinkedIn / Product Hunt | `hn` / `reddit` / `x` / `linkedin` / `producthunt` | `social` | `launch-w1` |
| Directory or awesome-list entry | list slug, e.g. `awesome-mcp-devtools` | `directory` | `listing` |
| GitHub Marketplace listing back to site | `github-marketplace` | `marketplace` | `listing` |
| Cross-link between the two products | `mcp-readiness` / `agent-ready-score` | `cross-sell` | `sister-tool` |
