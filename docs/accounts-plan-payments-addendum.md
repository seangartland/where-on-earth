# Where on Earth: accounts plan, payments addendum

Date: 2026-10-17 · Author: Claude Opus 5.5, written directly in session (no delegation)
Status: PLAN ONLY. No code or data changed.
Parent: `docs/accounts-plan-opus.md` (section 7 lists this addendum as its own plan; section 5b leaves the `entitlements` table to it).

Scope: payment ENABLEMENT only, at the plumbing level. What gets sold, at what price, and what it unlocks is the later product plan (section 5).

Method: every claim about the system comes from reading the repo at `2b8e1c9` (`account-worker/src/index.js`, `account-worker/src/sync.js`, `account-worker/deploy.py`, `account-worker/wrangler.jsonc`, `account-worker/package.json`, `account-worker/migrations/0001_init.sql`, `src/account/api.js`, `src/account/session.js`, `src/core/config.js`) and from `docs/accounts-phase1-report.md`. Stripe webhook behaviour marked (live 2026-10-17) was read from Stripe's live docs page "Manage webhook endpoints" today. This session was not permitted to fetch the better-auth docs or run web searches, so every better-auth Stripe plugin fact and every other Stripe fact is from the author's knowledge (training data to mid-2026) and marked (unverified). None of the unverified facts can flip the recommendation except the two named in 1c. Recommendations marked (judgment) are mine.

## 0. The as-built system this addendum plugs into

- **Account Worker:** `woe-account` at `https://woe-account.gartland-79.workers.dev`, live since 2026-10-16. better-auth 1.7.10 with the `bearer` and `emailOTP` plugins, native D1 binding `DB` on database `woe-accounts`, rolling 90-day sessions. Google sign-in is wired but dormant until its secrets exist.
- **Routes today** (`account-worker/src/index.js`): `/health`, `POST /v1/auth/email/send`, `POST /v1/auth/email/verify`, `POST /v1/auth/google`, `POST /v1/auth/signout`, `GET /v1/me` (proxies better-auth `get-session` as is; it does **not** return entitlements, unlike the plan's 3b sketch), `GET|POST /v1/sync`, and a passthrough for `/api/auth/*`. CORS allows `where-on.earth`, `www.where-on.earth` and the test origin `game.local`.
- **Account identity on the server:** `auth.api.getSession({ headers })` resolves the bearer token to `session.user.id`, which `sync.js` already uses as `account_id`. Payments reuse exactly that call.
- **Deploy:** `account-worker/deploy.py` bundles with Wrangler locally, uploads `dist/index.js` through the Cloudflare API with a fixed binding list, generates `BETTER_AUTH_SECRET` once and inherits it after, and passes optional secrets from the environment (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`), inheriting them on later deploys. `apply_migrations()` re-runs **every** `migrations/*.sql` file on each run, split on `;`. So a new migration must be fully idempotent (`CREATE TABLE IF NOT EXISTS`, no `ALTER TABLE`, no semicolons inside strings or triggers).
- **Bundle today:** 2,054.36 KiB raw, 354.82 KiB gzip (Phase 1 report, Wrangler dry run).
- **Client:** framework-less ES modules. `src/account/api.js` (`accountApi(path, { method, body, token })`, throws `AccountError`, never into gameplay), `src/account/session.js` (`where-on-earth-account-v1`, `isSignedIn()`). Everything is dark behind `ACCOUNTS_ENABLED`, which is true only with `?accounts=1` (`src/core/config.js:41`).

## 1. Provider route

### 1a. The three candidates

| | A. Stripe direct (our code, Stripe REST over `fetch`) | B. better-auth Stripe plugin | C. Hosted-only shortcut (Stripe Payment Links, no server checkout code) |
|---|---|---|---|
| What it is | Two small routes create Checkout and Billing Portal sessions; one webhook route writes our own D1 tables | `@better-auth/stripe` added to the `betterAuth()` plugins list; it creates customers, sessions and handles its own webhook (unverified) | A dashboard-made link per price, opened with `?client_reference_id=<accountId>`; only the webhook is ours (unverified) |
| New npm dependency in the Worker | None. Stripe's API is form-encoded REST; signature check is WebCrypto HMAC | The plugin plus the `stripe` Node SDK as a peer dependency (unverified) | None |
| Bundle and Workers Free fit | Unchanged in practice | Adds the Stripe SDK to a bundle already at 2 MB raw; on Workers the SDK also needs its fetch HTTP client and async SubtleCrypto verification configured (unverified) | Unchanged |
| Data model | Our tables, keyed by `account_id`; idempotent migration fits `apply_migrations()` | Plugin schema: a `stripeCustomerId` field on the auth `user` row plus a `subscription` table (unverified). A new column on `user` needs `ALTER TABLE`, which the re-run-everything migration helper cannot apply idempotently | Our tables |
| What it covers | Anything Stripe sells: subscriptions, one-time payments, refunds, disputes | Built around subscriptions and plans (unverified); refunds, disputes and one-time purchases would be hand code beside it anyway | Same events as A, but customer binding is weak: a link is not tied to a Stripe customer we created, so repeat buyers can become several customers |
| Coupling | Stripe API only | Pinned to better-auth 1.7.10's plugin API; upgrading either side moves both | Stripe dashboard state becomes part of the code path |
| Code size (estimate) | About 250 lines Worker plus about 60 lines client, plus tests | Less for the subscription happy path, more for everything around it | Least, but the mapping and portal still need A's pieces |

### 1b. Recommendation: A, Stripe direct, with our own account-to-customer mapping (judgment)

The deciding facts:
1. **The deploy path re-applies every migration on every run** (`deploy.py`, `apply_migrations`). Our own `stripe_customers` table is a clean `CREATE TABLE IF NOT EXISTS`; a plugin field on the auth `user` row is an `ALTER TABLE` that breaks the second run. This is the same rule the plan already set in 5a: progress never goes in columns on the auth library's `user` row.
2. **No SDK is needed.** Everything enablement uses (create customer, create Checkout Session, create Billing Portal session, retrieve subscription or charge, verify a webhook signature) is a handful of form-encoded `fetch` calls plus one HMAC. The Worker stays the size it is.
3. **Refund and dispute propagation are required by this brief** and are not what the plugin is for. Owning the webhook means one handler covers subscriptions, one-time payments, refunds and disputes alike, so the product plan is free to pick either model.
4. **The existing session call already gives the account id** (`auth.api.getSession`, as in `sync.js`). No auth integration is needed beyond what Phase 1 shipped.

**Why not C:** Payment Links skip only the checkout-creation route, which is about 40 lines. They lose the customer binding (1a, row "What it covers") and still need A's webhook, tables and portal route. Not worth the split.

**Why not a merchant of record (Paddle, Lemon Squeezy and similar):** they would take sales-tax and VAT handling off Sean in exchange for a larger fee (unverified), but they are a different integration, not a shortcut on this one. It is a business decision, listed in section 6 (decision 2), and the plumbing below changes only in the webhook event names if Sean picks one.

### 1c. What would flip it

- If the product plan turns out to be exactly one monthly subscription forever and the better-auth plugin can store its data without altering the `user` table and without the Stripe SDK on Workers, B becomes reasonable. Both facts are unverified; check them live if Sean wants B.
- Nothing about Clerk applies: the plan's Appendix A is a fallback that was not taken.

## 2. Event flow

### 2a. Checkout creation from the client

```
client (signed in, flag on)                  woe-account                              Stripe
-------------------------------------------  ---------------------------------------  -------------------------
accountApi('/v1/billing/checkout',
  { method:'POST', token, body:{ item } }) -> getSession -> account_id
                                             item in server allow-list? else 400
                                             stripe_customers row for account_id?
                                               no:  POST /v1/customers               -> cus_...
                                                    (Idempotency-Key: cust-<account_id>,
                                                     metadata[account_id])
                                                    INSERT stripe_customers
                                             GET /v1/prices?lookup_keys[]=<item>     -> price_...
                                             POST /v1/checkout/sessions              -> { id, url }
                                               customer, client_reference_id=account_id,
                                               metadata[account_id],
                                               subscription_data[metadata][account_id] (subscriptions)
                                               or payment_intent_data[metadata][account_id] (one-time),
                                               success_url, cancel_url
            { url } <-
location.assign(url)                                                                 hosted Checkout page
```

- **The client never names a price.** It sends an opaque `item` (for the proof, `woe_enablement_test`); the Worker checks it against a server-side allow-list and resolves it through the price's Stripe `lookup_key`. Changing a price is then a dashboard action with no deploy, and nobody can buy a price the game does not offer.
- **Return URLs:** `success_url = https://www.where-on.earth/?billing=success` and `cancel_url = https://www.where-on.earth/?billing=cancel`, each with `&accounts=1` appended while payments are dark. The return page never grants anything; it only triggers an entitlement refresh (3c). The webhook is the only writer of entitlement state.
- **Customer race:** two taps at once could create two customers. The Stripe `Idempotency-Key` on customer creation returns the same customer for 24 hours (unverified), and `stripe_customers.account_id` is the primary key, so the second insert is ignored and the Worker re-reads the row.
- **Card-only for enablement:** limit `payment_method_types` to card (Apple Pay and Google Pay ride on card in hosted Checkout, unverified). That keeps delayed-notification methods, and their extra events, out of the first build.
- **Manage and cancel:** `POST /v1/billing/portal` creates a Stripe Billing Portal session for the account's customer and returns its `url`, with `return_url` back to the game. Subscriptions need this from day one so a player can cancel without emailing Sean.

### 2b. Hosted versus embedded surfaces

| | Hosted Checkout (`url`, a stripe.com page) | Embedded Checkout (`ui_mode: embedded`, mounted in our page with Stripe.js) |
|---|---|---|
| Client code | One `location.assign` | Load `https://js.stripe.com/v3` at tap time (it must be loaded from Stripe, never vendored, unverified), mount into a panel |
| Leaves the page | Yes | No |
| The plan's "no redirects" rule (accounts plan 2b) | That rule exists because an auth session must land in the app's own storage. Payment does not have that constraint: the bearer token never leaves the app, and the result arrives by webhook into D1, so the app learns it on its next refresh wherever the Checkout page happened to open | Satisfied |
| iOS home-screen app | The stripe.com page opens out of scope, likely in an in-app browser sheet (unverified, test on Sean's iPhone in the proof). Closing it returns to the app, whose `visibilitychange` refresh picks up the entitlement | Stays inside the app |
| Apple Pay | Works on stripe.com without setup (unverified) | Needs `where-on.earth` registered as a payment method domain (unverified) |
| Look | Stripe's page with Sean's branding settings | Stripe's form inside the game's panel |

**Recommendation (judgment): hosted Checkout for enablement.** It is the smallest proof and does not depend on anything that must land back in the app. Embedded is a polish choice for the product plan once real items exist; it changes only the client and one session parameter, not the webhook or the tables.

### 2c. Webhooks into the account Worker

**Route:** `POST /v1/stripe/webhook` on `woe-account`. No CORS headers, no bearer auth; the signature is the authentication. It must be matched before the `/api/auth/*` passthrough and must read the raw body with `await request.text()` before any JSON parse, because the signature covers the exact bytes (live 2026-10-17).

**Events to subscribe** (only these; Stripe advises listening only to what the integration needs, live 2026-10-17):

| Event | Why |
|---|---|
| `checkout.session.completed` | Confirms the customer and account link; grants a one-time purchase when `payment_status` is `paid` |
| `customer.subscription.created` | First subscription state |
| `customer.subscription.updated` | Renewals, `past_due`, `unpaid`, cancel-at-period-end, plan changes |
| `customer.subscription.deleted` | The subscription ended: lapse |
| `invoice.payment_failed` | Logged only, for support visibility; the status change itself arrives as `subscription.updated` |
| `charge.refunded` | Refund propagation (3e) |
| `charge.dispute.created` | Dispute propagation (3e) |
| `charge.dispute.closed` | Dispute outcome, won or lost (3e) |

**Signature verification** (header format live 2026-10-17; algorithm details unverified, from the author's knowledge of Stripe's scheme):
1. Read the `Stripe-Signature` header: `t=<unix seconds>,v1=<hex>[,v1=<hex>...]` (live 2026-10-17). There can be several `v1` values while a secret is being rolled, since Stripe signs once per active secret for up to 24 hours (live 2026-10-17). Ignore `v0`.
2. Compute `HMAC-SHA256(key = STRIPE_WEBHOOK_SECRET, message = t + "." + rawBody)` with `crypto.subtle`, hex-encode it, and compare in constant time against each `v1`. Accept on any match.
3. Reject if `|now - t|` exceeds 300 seconds (Stripe's library default tolerance, unverified), against replay.
4. On any failure return `400` and write nothing.
5. Reject an event whose `livemode` does not match the key in use (`sk_test_` or `rk_test_` versus live), so test and live can never mix in one database.

**Idempotency and ordering:**
- Stripe can deliver an event more than once, retries undelivered events for up to three days, and can even emit two distinct events for one change (live 2026-10-17).
- Table `stripe_events` with `event_id` as primary key. On arrival: `INSERT OR IGNORE` the row with `processed_at` null. If the row already has `processed_at`, return `200` at once (stops retries, live 2026-10-17). Otherwise process, then set `processed_at`. A failure leaves it null and returns `500`, so Stripe retries and the retry processes it.
- **Fetch, then write.** For subscription, charge and dispute events, the handler re-reads the current object from the Stripe API (`GET /v1/subscriptions/<id>`, `GET /v1/charges/<id>`) and writes that state, instead of trusting the payload's snapshot. Out-of-order arrival then cannot move state backwards, and two events for one change produce the same row. Each write is an upsert of the full derived state, so processing twice is harmless even without the events table; the table is there to skip the extra Stripe read and to give support a log.
- **Respond fast** (live 2026-10-17): the work is one Stripe GET and two or three D1 statements, well inside the request. No queue is needed at this volume (judgment).
- **Finding the account:** `metadata.account_id` on the customer, subscription or payment intent; fall back to `stripe_customers` by `customer` id. An event that maps to no account is stored with an `error` note and returns `200` (a retry cannot fix it).

### 2d. How entitlement state lands in D1

New migration `account-worker/migrations/0002_billing.sql`, idempotent by construction (section 0):

```sql
CREATE TABLE IF NOT EXISTS stripe_customers (
  account_id   TEXT PRIMARY KEY,            -- better-auth user.id, same id sync.js uses
  customer_id  TEXT NOT NULL UNIQUE,        -- 'cus_...'
  livemode     INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entitlements (
  account_id          TEXT NOT NULL,
  entitlement         TEXT NOT NULL,        -- a key from the server's item map; real names belong to the product plan
  source_type         TEXT NOT NULL,        -- 'subscription' | 'payment' | 'grant'
  source_id           TEXT NOT NULL,        -- 'sub_...' | 'pi_...' | a manual grant id
  status              TEXT NOT NULL,        -- Stripe subscription status, or 'paid' | 'refunded' | 'disputed' | 'revoked'
  active              INTEGER NOT NULL,     -- derived by the rule in 3b, stored so reads are one indexed lookup
  current_period_end  INTEGER,              -- ms; null for lifetime purchases and grants
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  livemode            INTEGER NOT NULL,
  stripe_updated_at   INTEGER NOT NULL,     -- the Stripe object's state time, for support
  updated_at          INTEGER NOT NULL,
  PRIMARY KEY (account_id, entitlement, source_id)
);
CREATE INDEX IF NOT EXISTS entitlements_account_idx ON entitlements (account_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     TEXT PRIMARY KEY,            -- 'evt_...'
  type         TEXT NOT NULL,
  created      INTEGER NOT NULL,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER,
  error        TEXT
);
```

- One row per source, so a player who holds the same entitlement from a subscription and a manual grant keeps it if either is active.
- The item map (server code) ties each Stripe `lookup_key` to the entitlement key it grants. The product plan fills it; enablement has one entry: `woe_enablement_test -> enablement_test`.
- The `grant` source lets Sean hand an entitlement to a tester or a refunded-but-goodwill player with one SQL insert, no Stripe object needed.

## 3. The entitlement seam

### 3a. Server endpoint

`GET /v1/entitlements` (bearer) returns:

```json
{ "entitlements": { "enablement_test": { "active": true, "until": 1763000000000 } },
  "checkedAt": 1760700000000 }
```

Only active entitlements are listed; `until` is `current_period_end` or `null` for lifetime and grants. A separate route rather than extending `/v1/me`, because `/v1/me` today is a raw passthrough of better-auth's `get-session` and changing its shape would touch the sign-in client (judgment). Signed out: `401`, as sync does.

**Server-side features** (anything the Worker itself serves behind payment, such as a future archive read) never trust the client. They call one Worker function, `hasEntitlement(env, accountId, key)`, which reads `entitlements` with `active = 1` and, for timed rows, `current_period_end` in the future. Same rule, same table, no cache.

### 3b. The active rule (server truth)

| Source | `active = 1` when |
|---|---|
| Subscription | status is `active` or `trialing`; or `past_due` and still inside the grace window (decision 4) |
| One-time payment | status `paid` (no full refund, no open or lost dispute) |
| Grant | always, until deleted |

`canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `refunded`, `disputed`, `revoked`: inactive. Cancel-at-period-end stays active until `current_period_end`, then `customer.subscription.deleted` arrives and the row goes inactive.

### 3c. The client helper (the one call the product plan uses)

New module `src/account/entitlements.js`:

```js
// The single entitlement check. Synchronous, never throws, never awaits the network.
// Signed out, never fetched, or expired cache: { active: false, until: null, stale: true|false }.
export function entitlement(key) {
  // reads where-on-earth-entitlements-v1, applies the offline rule below
  return { active, until, stale };
}

// Called by the account layer only, never by gameplay:
export async function refreshEntitlements() { /* GET /v1/entitlements, write cache */ }
```

- **Product code calls only `entitlement('<key>').active`.** Gameplay never imports `api.js` or awaits anything; a gate decision is a synchronous read, like every other saved state in the game.
- **Cache key** `where-on-earth-entitlements-v1`, device-local: `{ _v: 1, accountId, fetchedAt, items: { key: { until } } }`. It carries the `where-on-earth-` prefix, so Settings Reset clears it. It is **not** on the sync allow-list (`sync.js` `isAllowedKey` refuses it already), so it can never be uploaded as if it were progress. Sign-out and an `accountId` mismatch clear it.
- **Refresh moments**, reusing the sync cadence that `src/main.js` already wires for Phase 1: after the first frame when signed in; on `visibilitychange` to visible when the cache is older than 5 minutes; immediately after sign-in; and on load with `?billing=success`, then every 3 seconds for up to 30 seconds until the item appears (webhook latency).
- **Offline rule** (decision 5): a cached item counts as active while `until` is null or in the future, and the cache was fetched within the last 7 days. `stale: true` once older than 24 hours, so the product plan can choose to show a quiet "checking your membership" note. A failed refresh never downgrades a valid cache; only a successful response does.
- **Flag:** all of it sits behind `ACCOUNTS_ENABLED`. With the flag off, `entitlement()` returns inactive without reading anything.

### 3d. Caching on the server

None for enablement. The read is one indexed D1 query per call. A per-isolate memo is a later optimization if a paid feature ever calls it per request at volume (judgment).

### 3e. Lapse, refund and dispute propagation

| Stripe change | Event(s) | D1 effect | Reaches the game |
|---|---|---|---|
| Renewal fails | `subscription.updated` (`past_due`), `invoice.payment_failed` | Active until the grace window ends, then inactive by the 3b rule | Next refresh |
| Player cancels in the portal | `subscription.updated` (`cancel_at_period_end`) | Still active, `cancel_at_period_end = 1` | Unchanged until the period ends |
| Period ends or Sean cancels now | `subscription.deleted` | `status = canceled`, inactive | Next refresh; offline devices at the latest when `until` passes |
| Full refund of a one-time payment | `charge.refunded` | `status = refunded`, inactive | Next refresh |
| Refund of a subscription payment | `charge.refunded` | No entitlement change on its own: a refund does not cancel the subscription (unverified). Sean cancels in the dashboard if that is the intent, which then arrives as `subscription.deleted` | As above |
| Dispute opened | `charge.dispute.created` | `status = disputed`, inactive (decision 6) | Next refresh |
| Dispute won | `charge.dispute.closed` (`won`) | Back to the prior status, re-derived by fetching the charge and subscription | Next refresh |
| Dispute lost | `charge.dispute.closed` (`lost`) | `revoked`; for a subscription, also cancel it through the API | Next refresh |

The worst case for a device that never comes online is the offline rule: at most 7 days after its last successful refresh, and never past a known `until`.

**Account deletion** (`/v1/account/delete`, a Phase 2 item not yet built) must cancel any active subscription through the API before deleting rows, or the player keeps being charged with no account. This addendum adds that as a requirement on Phase 2.

## 4. Definition of "enabled"

### 4a. The smallest end-to-end test-mode proof

Payments count as enabled when all of these pass in Stripe **test mode** against the live `woe-account` Worker, with the client dark behind `?accounts=1`:

1. A signed-in test account (email code through the mail sink, as the existing `account-worker/test/live-email.mjs` does) calls `POST /v1/billing/checkout { item: 'woe_enablement_test' }` and gets a `checkout.stripe.com` URL.
2. The checkout is completed with Stripe's test card `4242 4242 4242 4242` (unverified test number), once from a desktop browser and once from Sean's iPhone home-screen app.
3. Stripe's dashboard shows the webhook deliveries to `/v1/stripe/webhook` returning `200`.
4. D1 holds one `stripe_customers` row and one active `entitlements` row for that account, and `stripe_events` rows with `processed_at` set.
5. `GET /v1/entitlements` lists `enablement_test`, and in the game (`?accounts=1`), `entitlement('enablement_test').active` is true. For a human-visible check, a flag-gated line in the Settings Account row shows "Test entitlement: active". That line is enablement scaffolding and is removed or replaced by the product plan.
6. Cancelling immediately in the dashboard (or in the portal with "cancel now") delivers `customer.subscription.deleted`, and after a refresh the helper reads inactive.
7. Negative checks, scripted: a request with a bad signature gets `400` and writes nothing; replaying the same signed event twice leaves one `stripe_events` row and an unchanged entitlement row; an event older than the tolerance is refused.
8. A refund of a test one-time payment is not needed for the proof if the test price is recurring; the refund and dispute paths are covered by unit tests that feed recorded event payloads through the handler with a fixed test secret. Stripe's test dispute card can exercise disputes live if Sean wants it (unverified).

**Test price shape:** one recurring monthly price (for example 1.00 USD) with lookup key `woe_enablement_test`. Recurring proves more of the seam (subscription states, portal, lapse) than one-time. It says nothing about real pricing.

### 4b. What Sean must do in the Stripe dashboard (test mode)

1. Have a Stripe account (does one exist for Where on Earth? decision 1) and stay in test mode.
2. **Product and price:** create a product "Enablement test" with one recurring monthly price; set the price's **lookup key** to `woe_enablement_test`.
3. **Webhook endpoint:** add `https://woe-account.gartland-79.workers.dev/v1/stripe/webhook`, select exactly the eight events in 2c, then reveal its signing secret (`whsec_...`).
4. **API key:** create a **restricted key** (recommended over the full secret key) with write access to Customers, Checkout Sessions and Customer portal, read access to Prices, Subscriptions, Charges and Disputes, and write access to Subscriptions only if decision 6 keeps "cancel on lost dispute" (permission names unverified; adjust to the dashboard's list).
5. **Customer portal:** open the portal settings once and save a configuration that allows cancellation (the API cannot create portal sessions until a configuration is saved, unverified).
6. **Branding (optional):** business name and colours for the hosted page.

Hand-off to the orchestrator: the `whsec_...` value and the restricted key value, passed as environment variables to one deploy. Never committed, never pasted into a doc.

### 4c. What is code or Worker secrets (no dashboard work)

| Item | Where |
|---|---|
| `STRIPE_SECRET_KEY` (the restricted `rk_test_...` key) | Worker secret, added to `deploy.py`'s optional list as `secret_text`, inherited on later deploys like `RESEND_API_KEY` |
| `STRIPE_WEBHOOK_SECRET` (`whsec_...`) | Worker secret, same mechanism |
| `0002_billing.sql` | `account-worker/migrations/`, applied by `apply_migrations()` |
| `billing.js` (checkout, portal, webhook, `hasEntitlement`, item map) | `account-worker/src/`, routed from `index.js` before the `/api/auth/*` passthrough |
| `/health` gains `billingAvailable` (both secrets present) and `billingMode` (`test` or `live`) | `index.js`; never exposes the values |
| `src/account/entitlements.js` and the refresh hooks | client, flag-gated |
| `test/billing-webhook.test.mjs` (signature, replay, ordering, refund, dispute, with fixed payloads) | added to `scripts/regression.sh` as a named suite, like the merge suite |
| `account-worker/test/live-billing.mjs` (steps 1, 4, 5, 7 of 4a against the live Worker) | beside `live-email.mjs` |

Build estimate: one builder session for the Worker side and tests, part of a second for the client helper and the iPhone proof (estimate). Banked per milestone, per the standing rule.

## 5. Out of scope here (the later product plan)

- **What is sold:** prices, currencies, tiers, monthly versus yearly versus lifetime, bundles, gifting.
- **What is gated:** which features or content check `entitlement()`, the paywall and offer surfaces, copy, placements. The earlier candidates (paid weekly catch-up and archive, `docs/expeditions-rethink-opus.md` recommendation 11; the `daily_results` archive hook in plan 5d) are inputs to that plan, not decisions here.
- **Trials, coupons, promotion codes,** student or regional pricing.
- **Embedded Checkout** and any in-game purchase sheet design.
- **Tax configuration** beyond the decision in section 6 (decision 2), receipts and invoice branding, and the switch from test to live mode.
- **Native app stores:** if the game ever ships as an App Store app, Apple's in-app purchase rules apply to digital goods, a separate problem from web payments (author's knowledge).
- **External gate Sean already knows:** commercial launch waits on the **Sentinel-2 2025 imagery licence verification**. The repo's own source notes record that EOX's free 2018 to 2025 cloudless layers are CC BY-NC-SA (non-commercial) while 2016 is CC BY 4.0 (`docs/eox-bulk-and-base.md`, `docs/opus-satellite-review.md`). Test-mode enablement can proceed now; nothing goes live-mode or takes real money until that licence question is settled.

## 6. Decisions for Sean

1. **Stripe account.** Does a Stripe account exist that Where on Earth should use (FFO's, or a new one)? Recommend a separate account for Where on Earth, so payouts, branding, disputes and tax are not mixed with FFO.
2. **Merchant of record.** Stripe direct makes you the seller, responsible for sales tax and VAT where thresholds apply; a merchant of record (Paddle, Lemon Squeezy) takes that on for a larger fee (unverified). Recommend Stripe direct for enablement now (test mode costs nothing either way) and decide tax handling in the product plan, with Stripe Tax as the default to evaluate.
3. **Provider route.** Recommend Stripe direct over `fetch` with our own tables (1b), not the better-auth plugin. Tradeoff: about 250 lines of our own Worker code, in exchange for no SDK in the bundle, a migration that fits the deploy helper, and refund and dispute handling the plugin would not give.
4. **Past-due grace.** Recommend 7 days of access while Stripe retries a failed renewal, then inactive. Tradeoff: a few days of free access for genuine non-payers versus not punishing an expired card on day one.
5. **Offline trust.** Recommend honouring a cached entitlement for 7 days since the last successful check, never past its known end date. Tradeoff: a refunded player offline for a week keeps access for that week.
6. **Disputes.** Recommend suspending access when a dispute opens, restoring it if won, and on a lost dispute revoking and cancelling the subscription. Tradeoff: an honest player whose bank misfiles a dispute loses access until it is won.
7. **Surface.** Recommend hosted Checkout for enablement, with embedded left to the product plan. Tradeoff: a stripe.com page opens over the game, most noticeably as a sheet in the home-screen app, in exchange for the smallest proof.
8. **When to build.** Recommend building enablement now, in test mode and dark, so the product plan starts with working plumbing; live mode waits on the Sentinel-2 licence gate and the product plan. Tradeoff: one to two build sessions spent before anything is for sale.
