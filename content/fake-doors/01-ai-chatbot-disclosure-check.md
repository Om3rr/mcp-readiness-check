# 1. Does your website chatbot say it's an AI?

- **Type:** Compliance audit (free check, paid one-time report)
- **Slug / path:** `/ai-chatbot-disclosure-check/`
- **Target keyword:** ai act article 50 chatbot disclosure (secondary: eu ai act chatbot disclosure, ai chatbot disclosure, ai act transparency obligations, ai act article 50 transparency)

## SEO
- **Title tag** (50 chars): AI Chatbot Disclosure Check (EU AI Act Article 50)
- **Meta description** (147 chars): Check whether your website chatbot tells visitors they're talking to an AI, as EU AI Act Article 50 requires. Free check, one-time evidence report.

## Hero
**H1:** Does your website chatbot say it's an AI?

**Subhead:** A free check of your public pages for AI chat widgets and a visible AI disclosure, plus an optional dated evidence report for your compliance file.

> Not built yet. Join the waitlist and we'll email you when it's live.

**Price button(s)** (paid tiers only; each opens the waitlist form and never takes payment): `Evidence report, one site: $49 one-time` → price_click props.tier=`article50-report-49`

## The problem
- Many support tools now switch on AI answers inside the same chat widget, so the duty to disclose can land on you without anyone noticing.
- Article 50 of the EU AI Act has applied to AI systems that talk to people since 2 August 2026, including for non-EU companies serving EU users.
- A screenshot in someone's inbox is not a record. You need a dated, repeatable check of what visitors actually see.

## Benefits
- Find out in a minute whether a known chat or voice-AI widget runs on your pages.
- See whether disclosure wording is visible before or at the first message.
- Get a dated record you can file, and re-run after you change the wording.

## What the free check covers
- Load the public pages you list (home, contact, help) and detect known chat and voice-AI widgets.
- Look for AI-disclosure wording in the launcher, header and first message.
- Flag widgets it can't open or read as 'not checked' instead of guessing.
- Suggest plain disclosure wording and where it usually goes for your chat vendor.

## The paid one-time report
One-time evidence report for one site (up to 10 pages): dated screenshots of each widget, the exact disclosure text found or missing, file hashes, vendor-specific placement steps, and a draft transparency notice. A technical record, not legal advice.

## Planned pricing
- Free check: $0
- Evidence report, one site: $49 one-time

No payment is taken. Every price button opens the waitlist.

## FAQ
**Is this legal advice?**
No. It records what your public pages show and suggests wording. For a legal view of your obligations, ask a qualified adviser.

**Does it apply if a human answers our chat?**
Article 50(1) is about AI systems that interact with people. If only humans answer, it doesn't bite, but check whether your vendor's AI mode is on.

**Can it see logged-in areas or what the bot says later?**
No. It checks public pages and the first visible message only, and it says so in the report.

**Is it a subscription?**
No. The planned report is a one-time payment per site. Re-checks would be priced separately.

## Waitlist form
> Not built yet. Join the waitlist and we'll email you when it's live.

- Field: email (required). Button: `Join the waitlist`.
- Privacy note under the form: *We only use your email to tell you when this launches. No spam, unsubscribe anytime, never shared.*
- On submit: send `pro_waitlist_signup` with this page's path.

## Tracking
- `landing_view` on load, `price_click` with props.tier on each price button, `pro_waitlist_signup` on form submit. All via `POST /api/event {event, path: "/ai-chatbot-disclosure-check/", ref}`.

## Guardrails
- No reviews, testimonials, user counts, logos, social proof or urgency copy.
- No founder name. Nothing transit-related.
