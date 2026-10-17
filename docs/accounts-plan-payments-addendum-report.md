# Payments addendum report

Date: 2026-10-17 · Author: Claude Opus 5.5, written directly in session (no delegation)
Brief: `~/hooks/state/agent-watchdog/briefs/accounts-plan-payments-addendum.sh` (orchestrator-corrected version: better-auth, Phase 1 live)
Baseline: `main` at `2b8e1c9`. Plan documentation only; no code or data changed.

## What was written

- **`docs/accounts-plan-payments-addendum.md`**, a sibling document (form choice: sibling, because the plan is already 527 lines and the addendum is a standalone plan, as plan section 7 describes it). Sections: 0 as-built system, 1 provider route, 2 event flow, 3 entitlement seam, 4 definition of enabled, 5 out of scope, 6 decisions.
- **Pointer in `docs/accounts-plan-opus.md`**: one sentence added to the "Payment addendum" row of the section 7 table. No other line of the plan changed.
- Zero em dashes in either file (checked with grep).

## Method

- As-built facts read from the repo: `account-worker/src/index.js`, `src/sync.js`, `deploy.py`, `wrangler.jsonc`, `package.json`, `migrations/0001_init.sql`, `src/account/api.js`, `session.js`, `merge.js`, `src/core/config.js`, `src/main.js`, and `docs/accounts-phase1-report.md` including the orchestrator corrections.
- Stripe webhook behaviour (signature header format, three-day retries, duplicate delivery, fast 2xx, secret rolling with a 24-hour overlap, listen only to needed events) was read live from Stripe's "Manage webhook endpoints" docs page on 2026-10-17 and marked (live 2026-10-17).
- WebFetch of the better-auth docs and WebSearch were denied in this session, so every better-auth Stripe plugin fact and remaining Stripe detail (HMAC construction, 300 s tolerance, idempotency-key window, portal configuration requirement, restricted-key permission names, test card numbers) is author's knowledge, marked (unverified) in the addendum.

## The recommendation

**Stripe direct, called over `fetch` with no SDK, with our own `stripe_customers` (better-auth `user.id` to `cus_...`), `entitlements` and `stripe_events` tables in D1, hosted Checkout, and the webhook at `POST /v1/stripe/webhook` on `woe-account`.** The deciding facts:
1. `deploy.py`'s `apply_migrations()` re-runs every migration file on every deploy, so new schema must be `CREATE TABLE IF NOT EXISTS` only. The better-auth plugin's field on the auth `user` row would need `ALTER TABLE`, which fails on the second run.
2. Everything enablement needs is a handful of form-encoded REST calls plus one WebCrypto HMAC, so the bundle (2,054 KiB raw / 355 KiB gzip) does not take on the Stripe SDK.
3. The brief requires refund and dispute propagation; the plugin is built around subscriptions (unverified), so that code would be ours anyway.
4. `auth.api.getSession` already resolves the account id, exactly as `sync.js` does.

Hosted Checkout is acceptable even though the accounts plan bans auth redirects. That rule exists because a session must land in the app's own storage. A payment result arrives by webhook into D1 and reaches the app on its next entitlement refresh, wherever the Checkout page happened to open.

The client seam is one synchronous helper, `entitlement(key)` in `src/account/entitlements.js`, returning `{ active, until, stale }` from a device cache `where-on-earth-entitlements-v1`. The cache is refreshed by `GET /v1/entitlements` on the existing sync cadence, never synced as progress, and cleared on sign-out and Reset. Server features use `hasEntitlement(env, accountId, key)` against D1 directly.

"Enabled" means a test-mode proof: a test checkout from desktop and from Sean's iPhone home-screen app, webhook 200s, D1 rows, the helper reading active, an immediate cancel flipping it inactive, and scripted negative checks (bad signature, replay, stale timestamp). Sean's dashboard list is: product plus recurring test price with lookup key `woe_enablement_test`, the webhook endpoint with eight named events, a restricted key, and one saved portal configuration. Everything else is code plus two Worker secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) added to `deploy.py`'s optional list.

## Decision list for Sean (full text in addendum section 6)

1. Stripe account: recommend a separate one for Where on Earth, not FFO's.
2. Merchant of record: recommend Stripe direct for enablement; settle tax handling (Stripe Tax as the default to evaluate) in the product plan.
3. Provider route: recommend Stripe direct over `fetch`, not the better-auth plugin.
4. Past-due grace: recommend 7 days.
5. Offline trust: recommend 7 days since the last successful check, never past a known end date.
6. Disputes: recommend suspending on open, restoring if won, revoking and cancelling if lost.
7. Surface: recommend hosted Checkout now, embedded left to the product plan.
8. Timing: recommend building enablement now in test mode, dark; live mode waits on the Sentinel-2 2025 imagery licence gate and the product plan.

New requirement flagged for Phase 2: the not-yet-built `/v1/account/delete` must cancel any active subscription before deleting rows.

## Git

- Committed locally in `pay-work` on `main` with subject starting "Payments addendum". Git had no default identity in this session, so the commit uses the repo's existing author (`Sean Gartland`) through `-c` flags; no git config was changed.
- **Push to `main` blocked:** `origin` for this worktree is the non-bare local repo `/home/hatch/workspace/map-game/demo`, which has `main` checked out, so git refuses the update (`remote rejected: branch is currently checked out`). I did not change that repo's `receive.denyCurrentBranch` setting or touch its working tree.
- Instead the commit was pushed to branch `payments-addendum` on that same origin, so the orchestrator can fast-forward `main` from it (`git merge --ff-only payments-addendum` inside `demo`). `origin/main` is still `2b8e1c9`.
