# Fake-door test pages: niche evidence and ranking

Collected on 22 Nov 2026 (Asia/Jerusalem). Free checks only. Raw autocomplete JSON and Trends output are in `raw/`.

## Method
- **Google autocomplete:** `suggestqueries.google.com/complete/search?client=firefox&hl=en`. I checked about 55 seed phrases across 18 candidates. Phrases below are copied verbatim from the responses.
- **Google Trends:** I used the unofficial endpoint via `pytrends` (worldwide, last 12 months, weekly).
  - Values are **relative within each 5-term comparison group only**, so don't compare numbers across groups.
  - "First 13w → last 13w" is the average interest in the first and last quarter of the window.
  - Three groups returned data. One group (`llms.txt`, `european accessibility act`, `eu ai act`, `content security policy`, `mcp security`) failed with HTTP 429, so I have **no Trends data for those exact terms**.
- **Competitor pricing:** taken from the vendors' own pages via web search and fetch on 22 Nov 2026. Where a price came only from a search snippet because the page fetch failed, it's marked as such.
- **No search volumes:** autocomplete and Trends give no absolute numbers, so none are claimed here.
- **Competition:** every niche checked already has competitors (late-2026 market). I picked spots where competitors are either free with no deliverable, monthly subscriptions, or expensive manual services, which leaves room for a one-time self-serve product.

### Trends groups that returned data
| Group | Term | First 13w → last 13w | 12-mo mean |
|---|---|---|---|
| A | eaa compliance | 0.1 → 0.7 | 1.1 |
| A | llms.txt | 30.3 → 24.6 | 44.4 |
| A | eu ai act compliance | 27.5 → 10.4 | 29.4 |
| A | openapi linter | 0.2 → 0.1 | 0.2 |
| A | dmarc checker | 6.7 → 6.1 | 7.1 |
| B | llms.txt | 30.3 → 24.6 | 44.4 |
| B | ai crawler | 20.5 → 21.4 | 30.9 |
| B | mcp server security | 21.2 → 11.8 | 26.9 |
| B | security headers | 34.5 → 16.2 | 38.6 |
| B | vpat | 12.1 → 10.4 | 13.4 |
| C | llms.txt | 19.9 → 16.1 | 29.0 |
| C | github actions security | 20.1 → 6.4 | 24.2 |
| C | sbom generator | 0.3 → 0.4 | 0.8 |
| C | accessibility statement | 26.4 → 17.3 | 29.0 |
| C | cookie consent checker | 0.0 → 0.0 | 0.0 |
| D | vpat | 11.3 → 9.6 | 12.5 (peak wk 2026-07-19) |
| D | ai act article 50 | 13.8 → 10.5 | 20.5 (peak wk 2026-06-28) |
| D | openapi validator | 0.9 → 0.0 | 1.1 |
| D | github actions security | 28.7 → 8.8 | 34.4 (peak wk 2026-06-14) |
| D | mcp server security | 19.7 → 10.9 | 24.9 (peak wk 2026-06-14) |

In most terms the 12-month mean is above both the first and the last quarter, which means interest peaked mid-year (June–July 2026) and has cooled since. Treat these as "real but past-peak" signals.

## Ranking (the 5 picks)

### 1. `/ai-chatbot-disclosure-check/`: EU AI Act Article 50 chatbot disclosure check, $49 one-time evidence report (compliance audit)
- **Autocomplete:**
  - "ai act article 50": guidelines, code of practice, transparency, guidance, 50 1/2/4 (10 suggestions)
  - "eu ai act chatbot disclosure", "ai chatbot disclosure laws"
  - "ai act transparency obligations / requirements / guidelines / template"
- **Trends:** "ai act article 50" scored 13.8 → 10.5, mean 20.5, peak in late June 2026, ahead of the 2 Aug 2026 application date.
- **Competitors:**
  - ClearLabel (https://clearlabel.eu/): free in-browser scan plus a "Compliance Pack" whose price wasn't shown on the page I read.
  - ActEvidence (https://actevidence.tech/article-50-review/): human-reviewed review at **€990 per system**, +€390 for each additional system.
  - Halvus (https://halvus.io/tools/ai-chatbot-checker): free checker. No price found.
  - Disclosed (https://disclosed.sh/check): free checker. No price found.
  - pyroplast/ai-disclosure-scan: open source.
- **Why it ranks first:**
  - The duty is fresh and not deferred.
  - The market has a wide gap between free scanners and a €990 manual review.
  - It's AI-agent adjacent and fully automatable: headless browser plus phrase matching plus a PDF.

### 2. `/mcp-security-report/`: MCP server security report, $79 one-time (compliance audit)
- **Autocomplete:**
  - "mcp server security": best practices, risks, testing, scanner, issues, scanning, controls
  - "mcp security audit", "mcp security auditor", "mcp server security audit"
  - "mcp scanner cisco", "mcp scan snyk", "mcp scan invariant labs"
- **Trends:** "mcp server security" scored 21.2 → 11.8 (group B) and 19.7 → 10.9 (group D). Both peaked mid-June 2026.
- **Competitors:**
  - Snyk Agent Scan, formerly Invariant mcp-scan (https://github.com/snyk/agent-scan): free CLI that needs a Snyk token and has daily limits on the free tier. Fleet features are enterprise, by quote.
  - Cisco MCP Scanner (https://github.com/cisco-ai-defense/mcp-scanner): free CLI. Its strongest engine needs a paid Cisco AI Defense key.
  - MCP Scoring (https://mcpscoring.com/): free, focused on conformance and documentation, not a security report.
  - MCProbe (https://www.mcprobe.org/): free conformance audit. No price found.
  - **I found no hosted, one-time, shareable security report.**
- **Why:**
  - It's the closest fit to MCP Readiness, which already does the HTTP checks, including the WWW-Authenticate finding.
  - The buyer is a server vendor facing customer security questionnaires.
  - Copy must stay neutral: the page is for servers you own, and it names no third-party servers.

### 3. `/github-actions-hardening/`: GitHub Actions scan with a one-time fix PR, $19 per repo or $49 for 10 repos (free scan, paid fix)
- **Autocomplete:**
  - "github actions security": best practices, scanner, vulnerability, hardening, checks, scan
  - "pin github actions to commit shas"
  - "github actions harden runner", "github actions vulnerability scanner"
- **Trends:** "github actions security" scored 20.1 → 6.4 (group C) and 28.7 → 8.8 (group D), with a June 2026 spike. It's cooling but still has the largest mean in group D.
- **Competitors:**
  - StepSecurity (https://www.stepsecurity.io/pricing): Secure Workflow is free for **public** repos. Private repos need Enterprise at **$16 per contributing developer per month**.
  - zizmor: free, open-source linter with no auto-PR. This one I know from memory; I didn't re-check it this session.
- **Why:**
  - It's a clear "free scan, paid fix".
  - The gap is a one-time fix for private repos without a per-seat subscription.
  - It's automatable as a GitHub App and adjacent to the mcp-readiness GitHub Action audience.

### 4. `/vpat-acr-draft/`: VPAT / ACR draft generator, $149 one-time (compliance audit)
- **Autocomplete:**
  - "vpat generator", "vpat report generator", "vpat cost", "vpat audit cost"
  - "vpat template / report / testing"
  - "accessibility conformance report": (acr), template, example, vpat, wcag edition, vs vpat, reporting tool
- **Trends:** "vpat" scored 12.1 → 10.4 (group B) and 11.3 → 9.6 (group D). Interest is the most stable of all candidates, with no hype spike.
- **Competitors:**
  - AccessLedger (https://theaccessledger.com/vpat): **$499 one-time** per site.
  - ACR Index (https://acrindex.com/draft-acr/): **$299 per product**. This comes from a search snippet only; the page fetch returned HTTP 500.
  - VPATify (https://vpatify.com/vpat-generator): export on Starter at **$49 a month**.
  - Consultancies: $2,000–$10,000, as quoted on the AccessLedger page.
- **Why:**
  - It's a B2B procurement need with a high willingness to pay.
  - It's priced under the one-time competitors.
  - It's web-compliance adjacent and self-serve with axe-core plus a template. The copy is honest that only part of WCAG is machine-checkable.

### 5. `/ai-crawler-fix/`: AI crawler access check and llms.txt fix pack, $19 one-time (free scan, paid fix)
- **Autocomplete:**
  - "block ai crawlers robots txt", "robots txt allow / disallow / block ai bots"
  - "block gptbot": robots txt, nginx, cloudflare, "should i block gptbot"
  - "llms.txt checker": online, tool, validator, tester
  - "llms.txt generator": free, wordpress, shopify, online free
- **Trends:**
  - "llms.txt" has the highest interest of any term tested: mean 44.4 in groups A and B, and 29.0 in group C. It's cooling (30.3 → 24.6).
  - "ai crawler" is flat: 20.5 → 21.4.
- **Competitors:**
  - Crawlmind (https://crawlmind.ai/): free tools, Pro at $29 a month.
  - CiteTrack AI validator: free.
  - CrawlPact (https://crawlpact.com/): free audit with paid monitoring. Price not shown.
  - Lab451 (https://lab451.org/checker): free for 3 sites a day, with paid Pro.
  - BugViso: $1.49 per report or from $29 a month. This comes from its own comparison post.
  - Semrush AI Visibility: $99 a month.
- **Why:**
  - It has the strongest demand and is directly adjacent to Agent-Ready Score.
  - Competition is heavy on free tools and monthly plans. This page tests whether a one-time "done right and verified" pack sells.
  - **Highest competition risk of the five**, so it ranks last.

## Rejected candidates
| Candidate | Why rejected | Evidence |
|---|---|---|
| EAA website accessibility report | Crowded at a low price | AccessProof €29, EAA Proof €29, EAA Comply €69, RampCheck €79, Inkluso €149, all with a free scan plus a one-time report. "eaa compliance" Trends 0.1 → 0.7 (low). |
| General EU AI Act compliance checker | Free official tool plus cheap SaaS | Free EC checker (ai-act-service-desk.ec.europa.eu) and FLI checker. SetAIComply from €39/mo with a free snapshot. DiscloseAI from €29/mo. "eu ai act compliance" Trends 27.5 → 10.4. |
| Security headers fix | The fix is already free | securityheaders.com and MDN Observatory are free. Canopy (canopystack.dev/fix) and FixSecurityHeaders give free per-stack configs. |
| OpenAPI "agent-ready" fix | Low demand, free fixers | "openapi validator" Trends 0.9 → 0.0. "openapi linter" 0.2. Latitude 10 CLI fixes free (Pro $150/mo). Speakeasy Suggest also exists. |
| MCP server tester / fix pack | Free tools with fix prompts, overlaps MCP Readiness | MCP Scoring (free, fix prompts), MCProbe (free), Fixzi checker (free) |
| AI agent readiness checker | Many free tools, overlaps Agent-Ready Score | StartupHub (free / $5 mo), AIScan (free / $99 yr), AgentVisibly ($19/mo), Backlinko (free) |
| DMARC / SPF / DKIM checker | Not adjacent, entrenched free tools | Autocomplete is strong ("dmarc checker mxtoolbox"), Trends 6.7 → 6.1. Competitor pricing not checked. |
| Cookie consent checker | No demand signal | Trends 0.0 |
| SBOM generator | Low Trends, free OSS tools | Trends 0.3 → 0.4. Competitor pricing not checked. |
| License compliance checker | Wrong intent | Autocomplete dominated by liquor/business licensing |
| Accessibility statement generator | Free generators exist (W3C) | Autocomplete: "w3c accessibility statement generator", "...free". Folded into the VPAT idea. |
| Schema markup validator | Google's free validators dominate | Autocomplete only. Not further checked. |

## Win rule (agreed)
- **Primary metric:** waitlist emails per outside visitor, i.e. `pro_waitlist_signup` ÷ outside `landing_view` uniques, per page path.
- **Secondary metric:** `price_click`, by props.tier.
- **Win:** 10+ emails, **or** 5%+ conversion with 100+ outside visitors.
- **No result:** under 100 outside visitors and under 10 emails. That is not a loss.
- **Loss:** 100+ outside visitors, conversion under 5% and fewer than 10 emails.
- **Read-out:** around **3 Jan 2027**.
- **Traffic:** SEO only. No community or launch posts before 4 Dec 2026, and any later public post still needs Omer's yes.
- **Excluded from "outside":** internal probes (header `x-studio-internal: 1` or UA `studio-agent`), bots and AI crawlers. AI crawlers have their own row.

## Tracking notes for Venture Studio
- Each page sends its own path (`/<slug>/`) in `POST /api/event {event, path, ref}`.
- `landing_view` fires on load.
- `price_click` fires on each paid price button, with `props.tier`:
  - `article50-report-49`
  - `mcp-security-report-79`
  - `vpat-draft-149`
  - `gha-fix-19` and `gha-fix-49`
  - `ai-crawler-fix-19`
- The price button opens or scrolls to the waitlist form and never takes payment.
- `pro_waitlist_signup` fires on form submit.
- Venture Studio adds the "Not built yet" line (near the top and by the form), the privacy note and the form. Those are left out of `ideas.json` but are spelled out in each page's markdown.
