# Where on Earth accounts Phase 1 report

Date: 2026-10-17 UTC

Status: local implementation complete, live milestones blocked by this managed session. No production resource was changed.

## Baseline audit

Local `main` and `origin/main` both began at `afc6a83`. The account Phase 0 scout was already banked in `7ad35d3`, `d4c2230`, and `4a03b54`. Its proven stack is better-auth 1.7.10 with a native D1 binding and `storeOTP: "hashed"`.

The working tree already contained unrelated changes and untracked files. They were not staged, deleted, reformatted, or otherwise included in this work. The pre-existing modification to `scripts/regression.sh` was preserved and the account suite was added narrowly.

## M1: account Worker

### Built

- `account-worker/src/index.js`: email-code, Google, sign-out, session, health, CORS, rolling 90-day sessions, bearer support, five attempts per code, 10-minute code expiry, and an atomic D1 limit of five code emails per normalized address per hour.
- `account-worker/src/sender.js`: sender interface with a D1 mail sink and Resend implementation. Sink is the default. Resend activates only when its secret has been configured.
- `account-worker/migrations/0001_init.sql`: better-auth tables, mail sink, email send limits, devices, progress documents, Daily results, PvP links, history conflicts, and corrupt backups.
- `account-worker/deploy.py`: Phase 0 deploy-helper pattern, D1 listing, database creation, migrations, local bundle, secret-only initial generation of `BETTER_AUTH_SECRET`, inherited secrets on later deploys, and Worker upload.
- `account-worker/test/live-email.mjs`: send, D1 sink read, hashed verification check, verify, and bearer get-session round trip.
- `account-worker/package.json`, `package-lock.json`, `wrangler.jsonc`, and `.gitignore`.

The planned live URL is `https://woe-account.gartland-79.workers.dev`. It is not live from this work. The database name is `woe-accounts` and it was not created from this work.

### Verification

Static parsing passed for the Worker and deploy helper. The local Wrangler bundle completed:

```text
Total Upload: 2054.36 KiB / gzip: 354.82 KiB
env.DB (woe-accounts) D1 Database
env.EMAIL_SENDER ("sink") Environment Variable
--dry-run: exiting now.
```

The mandatory D1 list check stopped before an API request because the managed session cannot open the credential surrogate socket:

```text
PermissionError: [Errno 1] Operation not permitted
```

Therefore database creation, migration application, Worker deployment, and the live email round trip were not run. No secret was generated or exposed.

### Commit

No milestone commit exists. M1 is not complete until the live resource and round trip pass, and this session has read-only access to `.git`.

## M2: sync and merge

### Built

- `src/account/merge.js`: pure passport, best score, history, streak, Daily, expedition, and weekly merge functions plus the server allow-list pattern.
- `src/account/api.js`, `session.js`, and `sync.js`: bearer API wrapper, device session state, premerge snapshot, allow-listed progress sync, persistent queue, corrupt-backup upload, first-sign-in merge, Daily stored-row handling, boot sync, and five-minute visibility refresh.
- `account-worker/src/sync.js`: authenticated GET and POST sync, 512 KB document limit, allow-listed keys, version bumps, conflict merge, device rows, Daily first-write storage, future-date guard, and corrupt backup storage.
- `test/account-merge.test.mjs`: every section 4c merge row and all section 7a edge cases.
- `scripts/regression.sh`: account merge suite and a writable `REGRESSION_LOGS_DIR` override.

Only the four keys from section 7a were added: `where-on-earth-account-v1`, `where-on-earth-sync-queue-v1`, `where-on-earth-account-offer`, and `where-on-earth-premerge-v1`. Existing key names and saved shapes were not changed.

### Merge suite output

```text
✔ test/account-merge.test.mjs (160.278105ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 176.689034
```

The regression wrapper's account suite also passed:

```text
... Account merge rules (test/account-merge.test.mjs)
PASS  Account merge rules (test/account-merge.test.mjs)

=== Regression summary
PASS  Account merge rules (test/account-merge.test.mjs)  (/tmp/woe-shots/regression-logs/account-merge.log)
ALL SUITES PASSED
```

The full browser regression could not start Chromium in this sandbox, so an all-suite pass is not claimed.

### Commit

No milestone commit exists because M1 remains blocked and `.git` is read-only in this session.

## M3: dark client surfaces

### Built

- `src/core/config.js`: `ACCOUNTS_ENABLED`, false by default with `?accounts=1`, account origin, and the four new keys.
- `src/core/storage.js`: sync queue hook that is a no-op when the flag is off or no session exists.
- `src/account/sheet.js`: existing glass-panel styling, email and six-digit code states, Google availability state, inline errors, loading labels, successful merge, and signed-in completion state.
- `src/main.js`: flag-gated Settings Account row, Sign in, masked email, Sign out, reset-copy addition, first-frame sync, and visibility refresh.
- `src/styles/game.css`: account row and sheet styling using the existing Settings card and shared button conventions.

Nothing account-related is reachable in the UI with the flag off. Account modules are dynamically loaded only after a flagged account action or flagged signed-in sync.

### Captures

The 390 by 844 harness was prepared at `/tmp/accounts-phase1-shot.mjs`. Chromium failed before opening a page:

```text
browserType.launch: Target page, context or browser has been closed
[chrome] setsockopt: Operation not permitted (1)
```

No captures were produced or copied to `~/workspace/map-game/shots/accounts-phase1/`.

### Commit

No milestone commit exists because required captures are blocked and `.git` is read-only in this session.

## M4: PvP request diet

### Built locally

- `src/pvp/home.js`: terminal match state already read during the session is reused on later Challenge-home opens.
- `pvp-worker/src/index.js`: authenticated rate-limit checks use one `PlayerRecords` Durable Object call instead of separate auth and rate calls.
- `src/pvp/play.js` and `src/pvp/group.js`: reveal and waiting polls defer while the document is hidden.

Worker syntax passed, scoring parity passed 6 of 6, and the Wrangler dry-run passed with a 478.33 KiB upload and the existing three Durable Object bindings.

### Live safety gate

Before and after request counts are unavailable because Chromium and the Cloudflare credential socket are blocked. The changed PvP Worker was not deployed. The live `pvp` and `group` regression suites were not run, so rollback was neither needed nor attempted. The production `woe-pvp` Worker remains unchanged.

### Commit

No milestone commit exists. M4 is intentionally not committed or deployed as complete without counts and live regression evidence.

## Deviations and source-of-truth decisions

- The brief says the database name is `woe-account`; section 3a of the approved plan says `woe-accounts`. The plan wins, so the implementation uses `woe-accounts`.
- Section 3c describes Apple and passkeys, but Sean's binding ruling moves both to Phase 2. They were not built.
- Section 4b describes offer moments and the account-offer key, but Sean's ruling moves offer moments to Phase 2. The key is reserved exactly as section 7a requires, with no offer behavior.
- Section 5b sketches `push_subscriptions`, but notifications are explicitly excluded from this phase. No notification table or behavior was built.
- Section 5e describes delete and export endpoints, while the Phase 1 scope limits client surfaces and Sean's rulings put the account surface work beyond the Settings row into Phase 2. Delete and export were not built.
- The required external operations could not run because this managed session denies the credential surrogate socket, Chromium startup, writes outside the repo and `/tmp`, and writes to `.git`.

## Blocked on Sean and environment

- Resend secret: adding `RESEND_API_KEY`, and optionally `EMAIL_FROM`, switches the sender from the D1 sink to production email.
- Google OAuth values: adding `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` enables the Google button and live Google sign-in.
- DNS answer: determines whether the client origin later moves from `workers.dev` to `api.where-on.earth`. Bearer auth does not depend on it.
- A session with Cloudflare credential-socket access: unblocks D1 list, D1 creation, migrations, Worker deployment, the live mail-sink round trip, analytics counts, and guarded PvP deployment.
- A session allowed to launch Chromium and write to `~/workspace/map-game/shots/accounts-phase1/`: unblocks the three captures and all browser regressions.
- Writable `.git` plus origin credentials: unblocks the required milestone commits, pushes, and `origin/main` verification.

## Commit hashes

No Phase 1 commit hashes were created in this managed session. `HEAD` and `origin/main` remained at the audited baseline `afc6a83`.

## Orchestrator addendum (2026-10-16 night): banking and live verification

Sol's managed session could not commit (read-only .git), reach Cloudflare (credential socket), or launch Chromium, so the orchestrator banked and verified the phase directly. The implementation above is unchanged from Sol's report.

Banked on origin/main: 3593ef3 (M1+M2), 5ac64f2 (M3), 76ccd70 (M4 code).

M1 live completion by the orchestrator: D1 list check passed; database woe-accounts created (64f9059b-4de7-4d63-903a-5b688c476640); 17 migration statements applied; Worker deployed to https://woe-account.gartland-79.workers.dev. Health returns ok with emailSender sink and googleAvailable false. The live email round trip (account-worker/test/live-email.mjs against the deployed Worker) PASSES all five checks: send, mail sink read, hashed verification storage contains no live code, verify, get-session.

M2 verification: node --test test/account-merge.test.mjs passes 11 of 11 from the orchestrator environment.

Full regression (scripts/regression.sh, all suites incl. the new account suite, run by the orchestrator): ALL SUITES PASSED, including the PvP and group suites against the new client code and the live (unchanged) PvP Worker.

M3 captures: produced by the orchestrator at ~/workspace/map-game/shots/accounts-phase1/ (0-sheet-error, 1-sheet-email, 2-sheet-code, 3-sheet-signed-in). Headless Chromium in this sandbox cannot open a proxy tunnel to workers.dev (ERR_TUNNEL_CONNECTION_FAILED), so capture 0 is the sheet's genuine error state against the unreachable network (it fails gracefully with "Sign-in isn't available right now"), and captures 1 to 3 use a route-level stub of the Worker transport to exercise the real sheet code through the email, code and signed-in states, ending with the Settings row showing the masked email and Sign out. The real transport is covered by the live round trip above and by Sean's iPhone acceptance check with ?accounts=1.

M4 status: code banked; the PvP Worker deploy remains held for the before/after request-count gate, as the brief requires. Production PvP is unchanged.

Remaining Phase 1 item: the M4 deploy with counts. Blocked on Sean, unchanged: Resend secret, Google OAuth values, the DNS zone answer.
