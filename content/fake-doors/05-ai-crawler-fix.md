# 5. See which AI crawlers can read your site, then fix it

- **Type:** Free scan, paid fix
- **Slug / path:** `/ai-crawler-fix/`
- **Target keyword:** block ai crawlers robots txt (secondary: llms.txt checker, llms.txt generator, ai crawler robots txt, robots txt allow ai bots)

## SEO
- **Title tag** (45 chars): AI Crawler Access Check and llms.txt Fix Pack
- **Meta description** (145 chars): Free check of which AI crawlers your robots.txt allows or blocks and whether your llms.txt is valid. Optional one-time fix pack you can paste in.

## Hero
**H1:** See which AI crawlers can read your site, then fix it

**Subhead:** A free check of your robots.txt, llms.txt and bot responses, then an optional one-time pack of ready-to-paste files that match the policy you choose.

> Not built yet. Join the waitlist and we'll email you when it's live.

**Price button(s)** (paid tiers only; each opens the waitlist form and never takes payment): `Fix pack, one domain: $19 one-time` → price_click props.tier=`ai-crawler-fix-19`

## The problem
- One robots.txt line or a CDN bot setting can quietly block the crawlers behind AI answers, or let in ones you meant to block.
- llms.txt is new, and small format mistakes make it useless to the tools that read it.
- Most monitoring tools are monthly subscriptions when you only need the files done right once.

## Benefits
- See per crawler (search, training, user-triggered) what your site allows.
- Choose a policy in plain words and get files that match it.
- Re-check after you publish to confirm it worked.

## What the free check covers
- Read robots.txt and resolve, per known AI crawler, whether it's allowed or blocked.
- Validate llms.txt and llms-full.txt format and check their links.
- Check whether your CDN or firewall returns blocks or challenges to AI crawler user-agents.
- Check sitemap and X-Robots-Tag signals that conflict with robots.txt.

## The paid one-time fix
A one-time fix pack for one domain: a robots.txt section for your chosen AI-crawler policy, a generated llms.txt (and llms-full.txt) from your sitemap, notes for common CDN bot settings, and a re-check after you publish.

## Planned pricing
- Free check: $0
- Fix pack, one domain: $19 one-time

No payment is taken. Every price button opens the waitlist.

## FAQ
**Do AI crawlers have to obey robots.txt?**
No. Well-behaved crawlers follow it, but it's voluntary. The check shows what your site asks for, not what every bot does.

**Should I block AI crawlers?**
It depends on your goals. The fix pack lets you choose, for example allow answer crawlers and block training crawlers.

**Does llms.txt help?**
It's an emerging convention and support varies by tool. The pack makes sure that if you publish one, it's valid.

**Is it a subscription?**
No. The planned fix pack is a one-time payment per domain.

## Waitlist form
> Not built yet. Join the waitlist and we'll email you when it's live.

- Field: email (required). Button: `Join the waitlist`.
- Privacy note under the form: *We only use your email to tell you when this launches. No spam, unsubscribe anytime, never shared.*
- On submit: send `pro_waitlist_signup` with this page's path.

## Tracking
- `landing_view` on load, `price_click` with props.tier on each price button, `pro_waitlist_signup` on form submit. All via `POST /api/event {event, path: "/ai-crawler-fix/", ref}`.

## Guardrails
- No reviews, testimonials, user counts, logos, social proof or urgency copy.
- No founder name. Nothing transit-related.
