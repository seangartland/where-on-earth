# woe-pvp: Where on Earth head-to-head service

The small Cloudflare backend for the async PvP mode planned in
`../docs/pvp-mode-plan-sol.md`. The game itself stays a static site on
Vercel; this Worker holds match state and player records, the two things a
static site cannot keep honestly.

## What runs where

- **Worker** (`src/index.js`): the complete `/v1` identity, invitation, match,
  round, rematch, and pair-record API from `../docs/pvp-tech-spec-sol.md`.
- **MatchRoom** (Durable Object, SQLite): one instance per match. Holds that
  match's state and expires with it (matches expire after 7 days per the
  plan).
- **PlayerRecords** (Durable Object, SQLite): persistent pair records, the
  running win/loss between two specific players, keyed by their pairing and
  written when a match completes. This store is why records are not limited
  to one game: matches are disposable, records are not.

Free-tier shape (verified 2026-10-13): Workers Free allows 100,000
requests/day; SQLite-backed Durable Objects (the only kind Free allows)
allow 100,000 requests/day and 5 GB storage. At roughly 25-50 requests per
async match, that is on the order of 2,000-4,000 matches a day before the
$5/month paid plan matters.

## Setup status (done 2026-10-13)

- Cloudflare account: `3175d54f309e86780e7ac66426d099c4`
  ("Gartland.79@gmail.com's Account").
- An account API token from the "Edit Cloudflare Workers" template (named
  "where-on-earth-pvp") is stored in the Secure Vault as the
  `custom.cloudflare` connector credential. Never in chat or in the repo.
- Wrangler's OAuth browser flow does not complete in this VM environment
  (the localhost callback never lands), so deploys go through the API
  helper instead:
  `python3 ~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py deploy`
  then, once only,
  `python3 ~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py enable-subdomain`
- Live: https://woe-pvp.gartland-79.workers.dev (workers.dev subdomain
  `gartland-79`). Verified 2026-10-13: `/health` answers, and a match
  create/read round trip against the MatchRoom Durable Object returns the
  stored state.
- Verify the token any time with `cf_api.py verify`. It checks the ACCOUNT
  verify endpoint, because this is an account token (the user-level verify
  endpoint rejects account tokens even when they are valid).

## Build and configuration

Run `npm run build:catalog` after changing `../assets/locations.json`. The
generated `src/catalog.js` is checked in and pins the canonical SHA-256 catalog
version used by newly created matches. Run `npm run test:scoring` for the fixed
production parity vectors and `npm run check` for a Wrangler dry-run bundle.

Deployment requires a secret `SERVER_SECRET`. Separate `PLAYER_TOKEN_KEY`,
`INVITE_KEY`, `PAIR_KEY`, and `RATE_LIMIT_KEY` secrets override that fallback.
`GAME_ORIGIN` controls the share-link origin. `ALLOWED_ORIGINS` is an optional
comma-separated addition to the built-in production origins; the literal
`https://*.vercel.app` entry enables preview origins.

The full async PvP worker was implemented on 2026-10-13. Deployment and live
smoke tests are intentionally handled separately by the orchestrator.
