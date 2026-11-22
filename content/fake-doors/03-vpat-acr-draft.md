# 3. A pre-filled VPAT draft from a scan of your product

- **Type:** Compliance audit (free check, paid one-time report)
- **Slug / path:** `/vpat-acr-draft/`
- **Target keyword:** vpat report generator (secondary: vpat generator, accessibility conformance report, accessibility conformance reporting tool, vpat audit cost)

## SEO
- **Title tag** (44 chars): VPAT / ACR Draft Generator for SaaS Products
- **Meta description** (153 chars): Free accessibility scan of your SaaS pages, then a pre-filled VPAT 2.5 (WCAG) draft with every manual criterion flagged. One-time price, no subscription.

## Hero
**H1:** A pre-filled VPAT draft from a scan of your product

**Subhead:** Scan a few pages free. Then get a VPAT 2.5 (WCAG edition) draft filled with what automated checks can show, and a clear list of what still needs a human.

> Not built yet. Join the waitlist and we'll email you when it's live.

**Price button(s)** (paid tiers only; each opens the waitlist form and never takes payment): `VPAT draft, one product: $149 one-time` → price_click props.tier=`vpat-draft-149`

## The problem
- Buyers in education, government and larger companies ask for a VPAT or Accessibility Conformance Report before they sign.
- Consultant-written ACRs commonly cost thousands of dollars, and subscription tools charge every month.
- Automated scans cover only part of WCAG, so a 'finished' report from a scanner alone would be misleading.

## Benefits
- Start from a filled draft instead of a blank VPAT template.
- Every criterion marked as auto-checked or needs manual review.
- One payment per product, no subscription.

## What the free check covers
- Scan up to 5 public pages against WCAG 2.2 A and AA machine-checkable rules.
- Show issues grouped by WCAG criterion with the failing element.
- Show which criteria automated testing can't judge.
- Estimate how much of the VPAT can be pre-filled from your results.

## The paid one-time report
One-time VPAT 2.5 (WCAG edition) draft for one product, from a scan of up to 25 pages: pre-filled conformance levels and remarks where automated evidence exists, manual-review criteria flagged, the scan evidence attached, and an editable Word/PDF export. You review and sign it; it is not a conformance claim.

## Planned pricing
- Free scan (5 pages): $0
- VPAT draft, one product: $149 one-time

No payment is taken. Every price button opens the waitlist.

## FAQ
**Is the draft ready to send to a buyer?**
Not on its own. It fills what automated checks can show and flags the rest. Someone on your team must review it and complete the manual criteria.

**Which VPAT edition?**
The plan is the VPAT 2.5 WCAG edition first. Section 508 and EU (EN 301 549) editions may follow if people ask.

**How much of WCAG can a scan check?**
Only part of it. Things like meaningful alt text and full keyboard flows need a person, and the draft says so.

**Is it a subscription?**
No. The planned price is one payment per product.

## Waitlist form
> Not built yet. Join the waitlist and we'll email you when it's live.

- Field: email (required). Button: `Join the waitlist`.
- Privacy note under the form: *We only use your email to tell you when this launches. No spam, unsubscribe anytime, never shared.*
- On submit: send `pro_waitlist_signup` with this page's path.

## Tracking
- `landing_view` on load, `price_click` with props.tier on each price button, `pro_waitlist_signup` on form submit. All via `POST /api/event {event, path: "/vpat-acr-draft/", ref}`.

## Guardrails
- No reviews, testimonials, user counts, logos, social proof or urgency copy.
- No founder name. Nothing transit-related.
