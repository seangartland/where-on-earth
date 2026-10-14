# woe-pvp: Where on Earth head-to-head service

The small Cloudflare backend for the async PvP mode planned in
`../docs/pvp-mode-plan-sol.md`. The game itself stays a static site on
Vercel; this Worker holds match state and player records, the two things a
static site cannot keep honestly.

## What runs where

- **Worker** (`src/index.js`): HTTP entry point. Routes: `GET /health`,
  `POST /matches`, `GET /matches/:id`. Everything else 404s.
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

## Setup (one time, needs Sean)

1. A Cloudflare account on the Free plan: https://dash.cloudflare.com/sign-up
   No card required. (Skip if one already exists.)
2. An API token so deploys can run from the CLI here:
   Cloudflare dashboard → My Profile → API Tokens → Create Token → use the
   "Edit Cloudflare Workers" template → Continue → Create. Save the token
   through the secure vault link Harry provides (never in chat or in the
   repo).
3. Harry then runs, from this directory:
   - `npm install` (installs wrangler locally)
   - `CLOUDFLARE_API_TOKEN=<from vault> npx wrangler whoami` (auth check)
   - `npx wrangler deploy` (creates the Worker at
     `woe-pvp.<account>.workers.dev` and the two Durable Object classes)

## Local checks that need no account

- `npm run check` bundles the Worker with `wrangler deploy --dry-run` and
  catches config and syntax errors offline.

## Status

Scaffold only (2026-10-13). Routes and storage classes are real but minimal;
the match state machine, auth tokens for players, and the client integration
get their own technical spec before implementation, per the plan.
