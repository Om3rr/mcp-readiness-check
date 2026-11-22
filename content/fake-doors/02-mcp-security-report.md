# 2. A security report for your remote MCP server

- **Type:** Compliance audit (free check, paid one-time report)
- **Slug / path:** `/mcp-security-report/`
- **Target keyword:** mcp server security audit (secondary: mcp server security scanner, mcp security audit, mcp security auditor, mcp server security testing)

## SEO
- **Title tag** (45 chars): MCP Server Security Report for Remote Servers
- **Meta description** (154 chars): Free security check for your remote MCP server: auth, OAuth metadata, transport and risky tool definitions. Optional one-time report for security reviews.

## Hero
**H1:** A security report for your remote MCP server

**Subhead:** Run a free check on your own MCP endpoint, then get a one-time report you can hand to a customer's security review.

> Not built yet. Join the waitlist and we'll email you when it's live.

**Price button(s)** (paid tiers only; each opens the waitlist form and never takes payment): `Security report, one server: $79 one-time` → price_click props.tier=`mcp-security-report-79`

## The problem
- Enterprise buyers now ask MCP vendors security questions, and a CLI log is not something you can attach to a questionnaire.
- The free scanners are CLIs that need local setup, an account token or a paid engine for some checks.
- Auth details like the WWW-Authenticate header and OAuth protected-resource metadata are easy to miss and hard to explain later.

## Benefits
- A browser-based check of your own endpoint. Nothing to install.
- Plain-language findings with the spec section behind each one.
- A dated report you can attach to a security questionnaire.

## What the free check covers
- Check transport and TLS on your remote endpoint (Streamable HTTP or SSE).
- Check auth behaviour: 401 responses, WWW-Authenticate, OAuth protected-resource metadata.
- Read tool definitions for missing destructive/read-only annotations and instruction-like text inside descriptions.
- Check CORS and origin handling on the MCP endpoint.
- Show each finding with severity and the spec section it relates to.

## The paid one-time report
One-time report for one server: every finding with evidence, severity, the related MCP spec section, fix steps, and a summary page written for a customer's security reviewer. Re-check included after you ship fixes.

## Planned pricing
- Free check: $0
- Security report, one server: $79 one-time

No payment is taken. Every price button opens the waitlist.

## FAQ
**Can I scan someone else's server?**
The report is meant for servers you own or run. Checks only read what the endpoint exposes publicly or with the auth header you provide.

**Is this a penetration test?**
No. It's an automated configuration and definition review. It doesn't attempt exploits and doesn't replace a pentest.

**Do you store my auth header?**
The plan is to use it for that single check and never write it to storage or logs.

**Does it cover local stdio servers?**
Not at first. It targets remote servers reachable over HTTP.

## Waitlist form
> Not built yet. Join the waitlist and we'll email you when it's live.

- Field: email (required). Button: `Join the waitlist`.
- Privacy note under the form: *We only use your email to tell you when this launches. No spam, unsubscribe anytime, never shared.*
- On submit: send `pro_waitlist_signup` with this page's path.

## Tracking
- `landing_view` on load, `price_click` with props.tier on each price button, `pro_waitlist_signup` on form submit. All via `POST /api/event {event, path: "/mcp-security-report/", ref}`.

## Guardrails
- No reviews, testimonials, user counts, logos, social proof or urgency copy.
- No founder name. Nothing transit-related.
