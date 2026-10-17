# Accounts plan section 2e: live recheck

Checked: 2026-10-16. Every value below was read from the vendor's own pricing or docs page on that date. This file is the recheck that section 2e of `docs/accounts-plan-opus.md` asked for before Sean decides. Where the live value differs from what the plan assumed, the last column says so.

## Clerk

| Item | Plan assumed | Verified value (2026-10-16) | Source |
|---|---|---|---|
| Hobby retained-user cap | 50,000 (recalled) | 50,000 monthly retained users per app, free. A retained user is one who returns 24 or more hours after signing up, so one-time sign-ups do not count. Hobby session lifetime stays fixed at 7 days. | https://clerk.com/pricing |
| Pro price | About $25 a month | $25 a month billed monthly, or $20 a month billed annually. Includes 50,000 retained users per app, then $0.02 per extra retained user per month. | https://clerk.com/pricing |
| Clerk Billing fee | 0.7% (recalled) | 0.7% of billing volume, on top of Stripe processing at 2.9% plus $0.30 per transaction. Included in all plans. | https://clerk.com/pricing |
| Apple sign-in without a redirect | Redirect flow, as far as the author knew | Clerk's sign-in components accept an OAuth flow setting of redirect, popup, or auto. With popup, the Apple flow opens in a popup window instead of navigating the page away, so it can run without a full-page redirect. It is still a popup window rather than an ID token handed straight back to the page, and a popup inside an iOS home-screen web app still needs the Phase 0 device test. | https://clerk.com/docs/react-router/reference/components/unstyled/sign-in-button |

## Supabase

| Item | Plan assumed | Verified value (2026-10-16) | Source |
|---|---|---|---|
| Free MAU | 50,000 | 50,000 monthly active users on the Free plan. Pro at $25 a month includes 100,000 MAU, then $0.00325 per MAU. | https://supabase.com/pricing |
| Pause rule | Free projects pause after a week without activity | Confirmed: free projects are paused after 1 week of inactivity, limit of 2 active projects. | https://supabase.com/pricing |
| Built-in email limits | Rate limited; custom SMTP required for production | Built-in email provider sends at most 2 emails per hour across the whole project, and only to addresses belonging to the project's organization members. With custom SMTP the auth email limit starts at 30 per hour and can be raised. | https://supabase.com/docs/guides/auth/rate-limits |
| Passkey status | Unknown | Supported and documented. Passkey registration requires an existing, confirmed, non-anonymous user; sign-in then works with discoverable credentials, no email or username needed up front. Anonymous users and SSO users cannot register passkeys. | https://supabase.com/docs/guides/auth/passkeys |

## Firebase Auth

| Item | Plan assumed | Verified value (2026-10-16) | Source |
|---|---|---|---|
| MAU tiers | Free to 50,000 MAU for standard providers | With Identity Platform: no cost up to 50,000 MAUs for standard providers, then Google Cloud pricing. SAML and OIDC MAUs: no cost up to 50 MAUs only. Phone auth is billed per SMS sent. | https://firebase.google.com/pricing |
| Email-code support | Magic link only, no email code for primary sign-in | Confirmed. The built-in passwordless email flow is the email link (magic link) via `sendSignInLinkToEmail`. There is no built-in email one-time-code provider; code flows seen in the wild are hand-rolled on custom tokens. | https://firebase.google.com/docs/auth/android/email-link-auth |

## Cloudflare

| Item | Plan assumed | Verified value (2026-10-16) | Source |
|---|---|---|---|
| Workers Free CPU limit per request | About 10 ms | 10 ms of CPU time per HTTP request on Workers Free. Workers Paid allows up to 5 minutes (30 seconds by default). Free plan also allows 100,000 requests per day. | https://developers.cloudflare.com/workers/platform/limits/ |
| Worker script size cap | A capped script size (no number given) | 64 MiB uncompressed, on both Free and Paid. The docs state there is no compressed size limit; only the uncompressed bundle counts. Startup time limit is 1 second. This is far more headroom than the small compressed caps older write-ups quote, so bundle size is unlikely to be the Phase 0 blocker; CPU time and the 1 second startup limit are the numbers to test. | https://developers.cloudflare.com/workers/platform/limits/ |
| D1 free limits | About 5 GB storage and millions of row reads a day | 5 million rows read per day, 100,000 rows written per day, 5 GB total storage. Limits reset daily at 00:00 UTC; hitting a daily limit blocks queries until reset. | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 paid limits | Covered by the $5 Workers Paid plan | First 25 billion rows read per month included, then $0.001 per million rows. First 50 million rows written per month included, then $1.00 per million rows. First 5 GB storage included, then $0.75 per GB per month. | https://developers.cloudflare.com/d1/platform/pricing/ |

## better-auth

| Item | Plan assumed | Verified value (2026-10-16) | Source |
|---|---|---|---|
| D1 support on Workers | Via an adapter (Drizzle or Kysely) | Since better-auth 1.5, D1 is a native first-class database option: pass the D1 binding directly as the database and no adapter setup is required. The built-in D1 dialect uses D1's batch API for atomicity because D1 has no interactive transactions. | https://better-auth.com/blog/1-5 |
| Email OTP plugin | Exists (unverified in the plan) | Confirmed: the `emailOTP` plugin from `better-auth/plugins` covers sign-in, email verification and password reset by one-time code, with a `sendVerificationOTP` hook the app implements. | https://better-auth.com/docs/plugins/email-otp |
| Passkey plugin | Exists (unverified in the plan) | Confirmed: the passkey plugin now ships as its own package, `@better-auth/passkey`, with conditional UI (autofill) support. | https://better-auth.com/docs/plugins/passkey |
| Social ID-token sign-in | Yes (unverified in the plan) | Confirmed: social provider options include `verifyIdToken` and `disableIdTokenSignIn`, meaning providers accept an ID token sent from the client by default, which is the no-redirect Google and Apple pattern the plan wants. | https://better-auth.com/docs/reference/options |
| Stripe plugin | Exists (unverified in the plan) | Confirmed: `@better-auth/stripe` handles Stripe customer creation on sign-up, subscription plans, checkout and webhooks. | https://better-auth.com/docs/plugins/stripe |

## Email sender and Apple

| Item | Plan assumed | Verified value (2026-10-16) | Source |
|---|---|---|---|
| Resend free tier | An email sender's free tier, Resend named as the example | Free plan: 3,000 emails per month with a 100 emails per day cap, 3 domains. Pro is $20 a month for 50,000 emails with no daily limit. | https://resend.com/pricing |
| Apple Developer Program | About $99 a year | $99 annual membership. Required by every candidate for production Sign in with Apple. | https://developer.apple.com/programs/ |

## What differs from the plan, in short

- Clerk Apple sign-in: the plan treated it as redirect-only. Clerk offers a popup OAuth flow, so the page itself need not navigate away. The plan's caution stands in a weaker form, because a popup is still not an in-page ID-token flow and its behaviour inside an iOS home-screen web app is untested.
- Supabase passkeys: the plan marked them unknown. They exist and are documented, with the caveat that a passkey can only be registered on an already confirmed account.
- Workers script size: the current official cap is 64 MiB uncompressed with no compressed limit, so the bundled-size worry in the Phase 0 scout is smaller than the plan implied. The 10 ms Free CPU limit and the 1 second startup limit are the real gates.
- better-auth on D1: better than the plan assumed. No adapter is needed in current versions; the D1 binding goes straight into the config.
- D1 free writes are 100,000 rows a day. The plan's section 5 estimate of about 50,000 row writes a day at 10,000 daily signed-in players fits inside that, but with less headroom than the reads side (5 million a day).
- Everything else the plan named checked out as written: Clerk's 50,000 retained-user Hobby cap, Pro at $25 a month ($20 annual), Clerk Billing at 0.7%, Supabase's 50,000 free MAU, 1-week pause and 2-emails-per-hour built-in sender, Firebase's 50,000 free MAU with email link only and no email code, Workers Free at 10 ms CPU per request, Resend free at 3,000 emails a month, and Apple at $99 a year.
