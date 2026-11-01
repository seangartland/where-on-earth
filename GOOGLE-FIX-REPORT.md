# Report: Google sign-in, third attempt

## Diagnosis verdict

All three parts of the brief's diagnosis were verified against the code before building:

1. `src/account/api.js` was a bare fetch with no timeout, and `enableGoogle()` in `src/account/sheet.js` awaited `accountApi('/health')` before anything else. A hanging health check meant the promise never settled, the catch never fired, and the button, rendered disabled, stayed disabled with the stock note. Wave 13 timed only the GSI script load, a step this flow reaches only after the health check returns.
2. When the button did enable, its click called `google.accounts.id.prompt()` (One Tap), which on iOS Safari routinely displays nothing.
3. The wave-13 fallback navigated to the worker's social sign-in with a callbackURL of the game origin. Nothing in the game consumed that return: the localStorage session is populated only by `completeSignIn(result)` from a JSON response, and no code read a token or code from the URL or fetched a session after a redirect. The fallback could never complete a sign-in.

## What the flow is now

One path, no Google script on the game page at any point:

1. The sheet's Google button, once armed, navigates the browser to `GET /v1/auth/google/start?return=<game origin>/?accounts=1` on the account worker.
2. Start validates the return origin against the worker's allowed origins, records a sign-in attempt in D1 (10 minute expiry), sets the attempt id in an HttpOnly cookie, asks better-auth for the Google sign-in URL with its callbackURL pointed at the worker's own land endpoint, and 302s the browser to Google, forwarding better-auth's state cookies.
3. Google's consent round trip ends at better-auth's callback on the worker, which sets the session cookie and redirects to `GET /v1/auth/google/land?attempt=<id>`.
4. Land requires the attempt cookie to match the attempt id, the attempt to be unused and unexpired, and a live better-auth session on the request. It then marks the attempt used, mints a one-time exchange code (only its SHA-256 hash is stored, bound to the attempt and the session, 5 minute expiry), and 302s to the game with the code in the URL fragment: `https://www.where-on.earth/?accounts=1#woe_auth=<code>`. Any failure lands back on the game with `#woe_auth_error=1` and no code.
5. At boot, with accounts enabled, the game consumes the fragment before anything else can read it: `consumeAuthReturn()` strips it with `history.replaceState`, POSTs the code to `POST /v1/auth/exchange`, and finishes the sign-in through the same save, merge, and session-change path the email code flow uses. Exchange claims the code atomically (single-use) and returns `{ token, session: { token, expiresAt }, user }`, the shape the existing session code already consumes. The localStorage session key and shape are unchanged.

Supporting changes:

- `accountApi` now aborts every call at 6 seconds (AbortController, covering the body read), so no account request can hang forever. The email send and verify calls get the same bound for free.
- `enableGoogle()` is bounded under every network behavior. Health OK and Google configured: button enabled, note cleared. Health OK and Google off: button stays disabled with the specific note "Google sign-in is turned off right now." Health check fails or times out: the button is still enabled with the redirect as its action, with the note "Couldn't check the sign-in service — tap Continue to try in your browser." A permanently disabled button with a stock note is no longer a reachable state.
- The sheet's initial note now reads "Checking Google sign-in..." instead of the old "not available yet" text.

## Choice on the GSI path (brief part C)

Removed entirely. The GSI script load, the One Tap initialize/prompt handler, and the client's use of `/v1/auth/google` are gone from `sheet.js`. Reason: One Tap displaying nothing on iOS Safari was failure mode 2, and keeping it as an optional in-page route means keeping a second path that can half-work and can gate or confuse the one path that completes. The worker's `/v1/auth/google` id-token endpoint still exists and is unchanged; the game client simply no longer uses it. The email-code path is untouched apart from gaining the api timeout; sender config was not touched.

## Worker changes

- `account-worker/migrations/0002_auth_exchange.sql`: two tables, `auth_attempts` and `auth_exchange_codes` (hash only, never the raw code).
- `account-worker/src/index.js`: the three endpoints above, placed before the better-auth catch-all. Codes are 32 random bytes, base64url; fragments are never sent to a server, so codes appear in no server log. The attempt cookie is HttpOnly, Secure, SameSite=Lax (Lax so it survives the top-level return from Google).
- Deliberate tradeoff: exchange does not re-verify the session against better-auth's session table. The code lives 5 minutes, is single-use, and was minted seconds after better-auth issued the session; a revocation inside that window would still exchange. Accepted for the pilot; noted here so it is a decision, not an oversight.

## Verification (all local, all run against this worktree)

Harness sources are in `account-google-check/`.

1. Hang simulation (`hang-check.mjs`, Playwright driving the real sheet module): with `/health` never answered at all, the Google button became enabled at 6,045 ms (the 6 s timeout plus overhead, inside the ~7 s budget), with the honest fallback note, and clicking it issued the navigation to `/v1/auth/google/start` with the correct return parameter. With `/health` refused, enabled at 131 ms. With a healthy 800 ms `/health`, enabled at 898 ms with the note cleared and the same redirect on click. With Google reported off, the button stayed disabled with the turned-off note. 12 of 12 checks pass. This is the test the earlier fixes lacked: they aborted requests, they never hung them.
2. Worker legs (`worker-legs.mjs`, wrangler dev with local D1, sink sender, dummy Google client): start returned 302 to accounts.google.com carrying the dummy client id, the worker callback as redirect_uri, and an OAuth state, and set the attempt cookie. Land minted a fragment code only when the request carried both the matching attempt cookie and a real session (created through the email code path against the local sink); a used attempt, a session-less request, and a mismatched attempt cookie each minted nothing and landed with the error fragment. Exchange returned a session whose token authenticated `/v1/me`; replaying the same code returned 401; an unknown code returned 401. 20 of 20 checks pass.
3. Game leg (`game-leg.mjs`, Playwright booting the real game at the fake origin with the worker origin proxied to the local worker): landed on the exact URL land produced, and the game ended signed in: a session under the frozen `where-on-earth-account-v1` key with an unexpired expiry and the pilot account's masked email hint, `isSignedIn()` true, the fragment stripped from the URL, the game-stored token authenticating `/v1/me`, and the code's D1 row marked used. 8 of 8 checks pass.
4. Existing suite: `node --test test/*.test.mjs` from the repo root, 83 pass, 0 fail.

## What remains phone-only

The real Google consent round trip on Sean's iPhone, and only that. The local worker ran with a dummy Google client id and secret, so the legs on both sides of Google were verified independently: start provably builds the correct Google authorization URL against better-auth 1.7.10, and land plus exchange plus the game boot provably complete a sign-in from the state land receives (a live session cookie). The middle leg, Google's consent screen to better-auth's `/api/auth/callback/google` to land, is better-auth's own stock code path and needs the production Google client and a real account to exercise. The production worker already has the real Google client id and secret set (verified in an earlier session), so no new credential work is needed.

## Deployment notes for the orchestrator

- Apply `account-worker/migrations/0002_auth_exchange.sql` to the production D1 (`woe-accounts`) before or with the worker deploy; the new endpoints fail closed without the tables.
- Deploy the worker, then the game. Everything stays behind the existing `?accounts=1` gate; signed-out and non-gated play are untouched.
- Local-only artifacts were not committed: `account-worker/.dev.vars` (dummy secrets), `account-worker/.wrangler/`, and the harnesses' `e2e-state.json`.
