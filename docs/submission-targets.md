# Next submission targets for MCP Readiness

Drafts only. Nothing in this file has been submitted, posted, or emailed. Every item still needs Omer's yes (or, for GitHub Marketplace, his already-approved release-checkbox click) before anyone acts. No paid plans, no fast-track fees.

Product to list: **MCP Readiness** — free hosted scan at https://mcp-readiness.omer20sh.workers.dev, source and GitHub Action at https://github.com/Om3rr/mcp-readiness-check. Do not link GitHub Marketplace until the listing is live (it was not, as of 20 November 2026). Contact email, when a form requires one: `omer20sh@gmail.com` (already approved for directory forms).

Already done, skip:

- [punkpeye/awesome-mcp-devtools#484](https://github.com/punkpeye/awesome-mcp-devtools/pull/484)
- [apisyouwonthate/openapi.tools#881](https://github.com/apisyouwonthate/openapi.tools/pull/881) (Agent-Ready Score)
- directory.llmstxt.cloud and llmstxt.site (both products, free Standard, submitted 20 November 2026)

Checked on 20 November 2026. Several well-known MCP *server* directories do not list developer tools. Those are called out below rather than recommended blindly.

## Ranked shortlist (expected traffic per effort)

| Rank | Target | How to submit | Why it ranks here |
| --- | --- | --- | --- |
| 1 | GitHub Marketplace (MCP Readiness Scan) | Omer ticks "Publish this Action to the GitHub Marketplace" on the [v1.0.1 release edit page](https://github.com/Om3rr/mcp-readiness-check/releases/edit/v1.0.1) | Already approved. One checkbox. The Action is how CI users find us. The current Marketplace URL 404s. |
| 2 | [mcp.so](https://mcp.so/submit) | Free web form (repo URL + name). Skip the $39 paid listing. | The form explicitly accepts MCP clients, CLI tools, and AI products, not only servers. One form, no PR. |
| 3 | [sdras/awesome-actions](https://github.com/sdras/awesome-actions) (28,452 stars) | GitHub PR from Om3rr, one entry at the end of **Static Analysis → Testing** | Large, well-known Actions list. A short PR; high lasting referral potential for the Action. |
| 4 | [MCP Newsletter](https://www.mcpnewsletter.com/submit) | Form, or email `contact@mcpnewsletter.com` | Niche, high-intent MCP audience. A short tip is enough. Needs Omer's identity on the form or email. |
| 5 | [Puliczek/awesome-mcp-security](https://github.com/Puliczek/awesome-mcp-security) (751 stars) | GitHub PR, **Tools and code** section | Active list that already includes other scanners (`mcp-scan`, MCP-Shield, MCP Watch). Keep the blurb honest: surface readiness, not a pentest. |
| 6 | [Changelog News](https://changelog.com/news/submit) | Web form after signing in to Changelog | Broad developer readership. They reject how-tos and "commercial products"; pitch the 20 November measurement (token cost of popular servers), not a product launch ad. Needs a Changelog account. |
| 7 | Latent Space | Email `tips@latent.space` | AI-engineering audience. One short tip email. Needs Omer (or an approved send). |
| 8 | Official MCP Registry | `mcp-publisher` CLI after `server.json` + GitHub login, only if we publish a first-class scan MCP server | Canonical index, and PulseMCP says it will pick registry servers up when it reopens. Not a fit for a bare Action/CLI repo. |
| 9 | [mcpservers.org/submit](https://mcpservers.org/submit) | Free form (Development category, contact email). Skip the $39 Premium plan. | Easy form, but the site is a *server* directory. Weaker fit unless we also list a remote scan endpoint. Review "within 2 weeks" on the free plan. |
| 10 | [tuanone123/awesome-mcp-testing](https://github.com/tuanone123/awesome-mcp-testing) (0 stars) | GitHub PR, both `README.md` and `README.vi.md`, **Continuous Integration** and/or **Conformance** | Perfect topical fit — the list even says there is not yet a dedicated "test my MCP server" GitHub Action. Tiny current traffic; almost no effort. |

## Full list

### A. Do next (tools, Actions, or news)

#### 1. GitHub Marketplace — MCP Readiness Scan

- URL: https://github.com/Om3rr/mcp-readiness-check/releases/edit/v1.0.1 (checkbox). Target listing, once live: https://github.com/marketplace/actions/mcp-readiness-scan — confirm the slug is still free before relying on that URL.
- Method: release checkbox + Marketplace agreement, as Omer. No PR.
- Identity: yes, Omer must click it (already approved 20 November 2026).
- Draft: use the existing `MARKETPLACE.md` in this repo. No new copy needed here.
- Note: do not add Marketplace links to posts or articles until the listing returns 200.

#### 2. mcp.so — CLI / tool listing (free)

- URL: https://mcp.so/submit
- Method: web form. Fields seen on 20 November 2026: Repository URL, Name, optional $39 paid submission. The page states you can list MCP servers, remote MCP servers, MCP clients, AI products, CLI tools, Agent Skills and Loops.
- Identity: the public form does not require a login to start; use `omer20sh@gmail.com` if a contact field appears. Do not pay $39.
- Draft:

```
Repository URL: https://github.com/Om3rr/mcp-readiness-check
Name: MCP Readiness
Description: Free open-source scanner and GitHub Action that connects to a live MCP server the way a client does, then scores OAuth discovery, Origin/CORS, tool annotations, JSON-RPC hygiene, and the token cost of tools/list. Hosted scan, CLI, and a CI gate. No Marketplace link yet.
Website: https://mcp-readiness.omer20sh.workers.dev/?utm_source=mcpso&utm_medium=directory&utm_campaign=listing
```

#### 3. sdras/awesome-actions

- URL: https://github.com/sdras/awesome-actions
- Method: GitHub PR. [Contributing](https://github.com/sdras/awesome-actions/blob/master/contributing.md): one suggestion per PR, useful title, add at the **end** of the relevant category, short description, format `[Name](link)`, commit body should contain a link to the repository.
- Identity: yes, PR from Om3rr.
- Category: `#### Testing` under Static Analysis (after the last Testing entry).
- Draft PR title: `Add MCP Readiness Scan for MCP server readiness and token-cost CI`
- Draft entry:

```
- [MCP Readiness Scan](https://github.com/Om3rr/mcp-readiness-check) - Score a live MCP server in CI: OAuth discovery, Origin checks, tool annotations, and a tools/list token budget.
```

#### 4. MCP Newsletter

- URL: https://www.mcpnewsletter.com/submit — or email contact@mcpnewsletter.com
- Method: form or email. The page invites MCP servers, launches, repos, tutorials, news, feedback, or sponsorship inquiries. Do not pitch sponsorship.
- Identity: yes (email or form).
- Draft subject: `Tip: MCP Readiness — token cost and a CI gate for MCP servers`
- Draft body:

```
Hi,

Tip for the newsletter: I scanned 23 popular remote MCP servers on 20 November 2026. Among the 8 that answer tools/list without login, the tool-list cost ranged from about 80 tokens per turn (Astro Docs) to about 4,967 (Hugging Face). 7 of those 8 accepted a foreign Origin header.

I also open-sourced a free scanner and GitHub Action that fails a PR on a readiness score or a token budget.

Table: https://mcp-readiness.omer20sh.workers.dev/mcp-servers/?utm_source=mcpnewsletter&utm_medium=newsletter&utm_campaign=listing
Repo (MIT): https://github.com/Om3rr/mcp-readiness-check?utm_source=mcpnewsletter&utm_medium=newsletter&utm_campaign=listing

Omer Shacham
```

#### 5. Puliczek/awesome-mcp-security

- URL: https://github.com/Puliczek/awesome-mcp-security
- Method: GitHub PR, section `## 🧑‍🚀 Tools and code`. The section already lists scanners such as mcp-scan, MCP-Shield, and MCP Watch. Describe us as a live surface scanner, not a security audit.
- Identity: yes, PR from Om3rr.
- Draft PR title: `Add MCP Readiness — live surface scanner and CI gate for MCP servers`
- Draft entry:

```
- [MCP Readiness](https://github.com/Om3rr/mcp-readiness-check) - Live surface scanner and GitHub Action for MCP servers: OAuth discovery, Origin/CORS, tool annotations, JSON-RPC hygiene, and tools/list token cost. Not a penetration test.
```

#### 6. Changelog News

- URL: https://changelog.com/news/submit
- Method: web form after Changelog sign-in / sign-up. Their rules (checked 20 November 2026): they are not interested in how-tos, commercial products/services (sponsorship is that path), or reader-hostile sites. Pitch the measurement, not a paid plan.
- Identity: yes, a Changelog account in Omer's name.
- Draft title: `Popular MCP servers add between ~80 and ~4,967 tool-list tokens to every agent turn`
- Draft body:

```
On 20 November 2026 I ran unauthenticated scans of 23 well-known remote MCP servers. The 8 that expose tools/list without login cost between about 80 tokens per turn (Astro Docs) and about 4,967 (Hugging Face). 7 of those 8 accepted a foreign Origin header, which the MCP transport spec says servers MUST validate.

Method and table (open data): https://mcp-readiness.omer20sh.workers.dev/mcp-servers/?utm_source=changelog&utm_medium=newsletter&utm_campaign=listing
Open-source scanner and CI Action (MIT): https://github.com/Om3rr/mcp-readiness-check
```

#### 7. Latent Space

- URL: https://latent.space/about — tips address `tips@latent.space`
- Method: email.
- Identity: yes, send from Omer (or an approved send).
- Draft subject: `Tip: what popular MCP servers cost in tool-list tokens`
- Draft body: same facts and links as the MCP Newsletter tip, signed by Omer Shacham. Use `utm_source=latentspace&utm_medium=newsletter&utm_campaign=listing`.

#### 8. tuanone123/awesome-mcp-testing

- URL: https://github.com/tuanone123/awesome-mcp-testing
- Method: GitHub PR. [CONTRIBUTING](https://github.com/tuanone123/awesome-mcp-testing/blob/main/CONTRIBUTING.md): real project, about testing MCP servers, one item per PR, add to **both** `README.md` and `README.vi.md`, one-line factual description, note language/type.
- Identity: yes, PR from Om3rr.
- Categories: **Continuous Integration (CI)** (primary) and, if they prefer a single entry, that section only. Their CI section currently says there is not yet a dedicated maintained "test my MCP server" GitHub Action.
- Draft PR title: `Add MCP Readiness Scan (hosted scanner, CLI, and GitHub Action)`
- Draft English entry (CI section):

```
- [MCP Readiness](https://github.com/Om3rr/mcp-readiness-check) — Hosted scan, CLI and GitHub Action that scores a live MCP server on OAuth discovery, Origin/CORS, annotations, JSON-RPC hygiene and tools/list token cost, with fail-under and max-context-tokens gates. (TypeScript / Node.js)
```

- Vietnamese README: add a faithful one-line translation of the same entry in the matching section when the PR is opened. Do not invent a translation here without a native pass; have Omer or a speaker review the `README.vi.md` line before opening the PR.

### B. Server-only registries (only if we publish a scan MCP server)

These indexes are for MCP *servers* (a process that speaks the protocol), not for a GitHub Action or a website. The hosted product mentions a `scan_mcp` remote tool on the workers.dev subdomain, but there is no documented, first-class public MCP endpoint and `server.json` in the repo today. Do not submit the Action repo to these until that exists.

#### 9. Official MCP Registry

- URL: https://modelcontextprotocol.io/registry/quickstart — API https://registry.modelcontextprotocol.io
- Method: create `server.json`, then `mcp-publisher login github` and `mcp-publisher publish`. GitHub-authenticated names use the `io.github.Om3rr/` prefix.
- Identity: yes, Omer authorizes `mcp-publisher` via GitHub device login.
- Draft `description` (registry limit is 100 characters): `Scan a live MCP server for OAuth discovery, Origin checks, annotations, and tool-list token cost.`
- Why wait: this is the canonical index, and [PulseMCP](https://www.pulsemcp.com/submit) (paused since 3 September 2026) says it will pick official-registry servers up automatically when it reopens.

#### 10. Glama

- URL: https://glama.ai/mcp/servers — add-server flow is a GitHub-authenticated form for a public repo (Dockerfile, server starts and answers introspection, per Glama's listing guidance).
- Method: form, GitHub login. Glama also indexes from the official registry.
- Identity: yes, GitHub account with write access to the repo.
- Fit: servers only. Prefer official-registry publish, then claim or wait for index, rather than forcing a non-server repo through the Dockerfile path.

#### 11. PulseMCP

- URL: https://www.pulsemcp.com/submit
- Method: none right now. Page checked 20 November 2026: "submissions and changes are temporarily paused," last updated 3 September 2026. They ask people to publish to the Official MCP Registry instead.
- Identity: n/a until it reopens.
- Draft: do not submit. Revisit after a registry publish, or when the page reopens.

#### 12. Smithery

- URL: https://smithery.ai/future and https://smithery.ai
- Method: no current submit path for a devtool. Smithery's proxy, API, accounts, CLI, and hosted URLs shut down on 31 October 2026. The site remains a public, non-proxied directory of MCP servers (now powered by Arcade.dev).
- Identity: n/a.
- Draft: do not submit a scanner/Action here.

#### 13. mcpservers.org

- URL: https://mcpservers.org/submit
- Method: web form. Fields: Server Name, Category (includes Development), Short Description, Repository/Website/Documentation, optional Official MCP Registry Name, "This server supports remote connections," Contact Email, free vs $39 Premium. Free plan: review within 2 weeks. Do not pay.
- Identity: contact email (`omer20sh@gmail.com`).
- Fit: labeled "Submit Your MCP Server." Weaker than mcp.so. Only send if we are also listing a remote scan endpoint.
- Draft (free plan only):

```
Server Name: MCP Readiness
Category: Development
Short Description: Live scanner and CI gate for MCP servers: OAuth discovery, Origin checks, annotations, and tools/list token cost.
Repository, Website or Documentation: https://github.com/Om3rr/mcp-readiness-check
This server supports remote connections: no (unless a public MCP scan endpoint is documented)
Contact Email: omer20sh@gmail.com
```

#### 14. mcpmarket.com

- URL: https://mcpmarket.com/submit
- Method: form, GitHub repo URL. The page is "Submit an MCP Server" / "MCP server or Agent Skill."
- Identity: unclear; likely just the repo URL.
- Fit: servers and skills only. Skip until we publish a server.

#### 15. LobeHub MCP Market

- URL: https://market.lobehub.com/s/publish-mcp (also referenced from lobehub.com/mcp)
- Method: "Submit MCP" or `npx @lobehub/market-cli plugin publish <github-url>` after login and a GitHub connection.
- Identity: yes, LobeHub + GitHub accounts.
- Fit: MCP plugins/servers. Skip until we publish a server.

#### 16. Cursor Directory

- URL: https://cursor.directory/plugins/new?type=mcp_server
- Method: form after sign-in, MCP server plugin.
- Identity: yes, a Cursor Directory / relevant account.
- Fit: MCP servers. Skip until we publish a server.

#### 17. punkpeye/awesome-mcp-servers

- URL: https://github.com/punkpeye/awesome-mcp-servers (98,316 stars)
- Method: GitHub PR, with a Glama badge, in alphabetical order, for installable servers. Remote-only servers are redirected to awesome-remote-mcp-servers. [CONTRIBUTING](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md).
- Identity: yes, PR from Om3rr.
- Fit: servers only. Do not PR the scanner repo as a server.

#### 18. appcypher/awesome-mcp-servers

- URL: https://github.com/appcypher/awesome-mcp-servers (5,839 stars)
- Method: would be a GitHub PR, but the repository is **archived**.
- Identity: n/a.
- Draft: skip. The list is archived.

### C. Other lists and notes

#### 19. punkpeye/awesome-mcp-clients

- URL: https://github.com/punkpeye/awesome-mcp-clients
- Method: GitHub PR.
- Fit: MCP *clients* (ChatGPT, Cursor, Claude Desktop, and similar). We are not a client. Skip.

#### 20. Docker MCP catalog / Docker MCP Registry

- Method: typically a GitHub PR with a Dockerfile for an installable MCP server.
- Fit: servers only. Skip.

#### 21. Official MCP Registry GitHub sync / GitHub MCP Registry

- Some writers note that GitHub's MCP registry syncs from the official registry. No separate submission once (9) is done.
- Fit: follows (9). No extra action.

Ready-to-open PRs and forms above are drafts. Open or send them only after Omer approves each one, and after any dependent deploy (for example a public MCP scan endpoint, or a live Marketplace listing).
