# 4. Find and fix risky GitHub Actions workflows

- **Type:** Free scan, paid fix
- **Slug / path:** `/github-actions-hardening/`
- **Target keyword:** github actions security scanner (secondary: github actions security scan, pin github actions to commit shas, github actions security hardening, github actions vulnerability scanner)

## SEO
- **Title tag** (48 chars): GitHub Actions Security Scan and One-Time Fix PR
- **Meta description** (153 chars): Free scan of your GitHub Actions workflows for unpinned actions, broad token permissions and script injection. Optional one-time fix PR, no subscription.

## Hero
**H1:** Find and fix risky GitHub Actions workflows

**Subhead:** A free scan of your workflow files, then an optional pull request that pins actions to commit SHAs and tightens permissions. One-time price, private repos included.

> Not built yet. Join the waitlist and we'll email you when it's live.

**Price button(s)** (paid tiers only; each opens the waitlist form and never takes payment): `Fix PR, one repo: $19 one-time` → price_click props.tier=`gha-fix-19` · `Fix PRs, up to 10 repos: $49 one-time` → price_click props.tier=`gha-fix-49`

## The problem
- Actions referenced by a tag can change under you. Pinning to a full commit SHA is the usual fix, and it's tedious by hand.
- Many workflows still run with broad GITHUB_TOKEN permissions they never use.
- Free hardening tools often cover public repos only, and private-repo plans are usually per-developer subscriptions.

## Benefits
- See every risky line in your workflows, with why it matters.
- Get the fixes as a reviewable pull request, not a to-do list.
- Pay once per repo, including private repos.

## What the free check covers
- Find actions referenced by tag or branch instead of a full commit SHA.
- Flag workflows with missing or overly broad permissions blocks.
- Flag untrusted event data used inside run: steps (script injection risk).
- Flag risky pull_request_target and checkout patterns, and persisted credentials.

## The paid one-time fix
A one-time pull request per repo that pins every action to a full commit SHA with the version as a comment, adds least-privilege permissions, sets persist-credentials: false where safe, and explains each change. Nothing merges without your review.

## Planned pricing
- Free scan: $0
- Fix PR, one repo: $19 one-time
- Fix PRs, up to 10 repos: $49 one-time

No payment is taken. Every price button opens the waitlist.

## FAQ
**Will the fix break my workflows?**
Every change arrives as a pull request with an explanation, so your CI runs on it before you merge.

**Do you need write access to my code?**
The scan only reads workflow files. The planned fix PR would need permission to open a pull request on the repos you choose.

**Does it work for private repos?**
That's the plan: the same one-time price for public and private repos.

**Is this a subscription?**
No. You pay once per repo or per 10-repo pack.

## Waitlist form
> Not built yet. Join the waitlist and we'll email you when it's live.

- Field: email (required). Button: `Join the waitlist`.
- Privacy note under the form: *We only use your email to tell you when this launches. No spam, unsubscribe anytime, never shared.*
- On submit: send `pro_waitlist_signup` with this page's path.

## Tracking
- `landing_view` on load, `price_click` with props.tier on each price button, `pro_waitlist_signup` on form submit. All via `POST /api/event {event, path: "/github-actions-hardening/", ref}`.

## Guardrails
- No reviews, testimonials, user counts, logos, social proof or urgency copy.
- No founder name. Nothing transit-related.
