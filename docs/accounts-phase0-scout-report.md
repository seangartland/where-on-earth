# Where on Earth accounts Phase 0 scout report

Date: 2026-10-17 UTC

## Overall verdict

**Update, 2026-10-16 evening (orchestrator): one gate PASSED, the rest blocked on a token permission.** The agent sessions were blocked by their sandbox (no npm registry, no credential socket, read-only `.git`), so the orchestrator ran the prepared resume procedure directly. `npm install` completed (better-auth 1.7.10) and the bundle gate PASSED with a measured size (see the gate table). Creating the D1 database then failed with HTTP 401 from the D1 API: the account token (created from the "Edit Cloudflare Workers" template) can manage Workers (verified: script list returns 200) but has no D1 permission (D1 list returns 401 code 10000). Creating the database needs Sean to add D1 Edit permission to the token in the Cloudflare dashboard, or to create the empty database there. After that one step, the remaining commands are `python3 deploy.py create-db` (or record the dashboard-created ID), `apply-schema`, `deploy`, and the two test commands in the resume procedure.

**Original agent verdict: BLOCKED by the execution environment.** The local scout source, schema, API deploy helper, and test harness are prepared and banked, but the resumed session still could not install dependencies, access the Cloudflare credential surrogate, or write to the repository's `.git` directory. No Cloudflare resource was created or changed. No game file, existing Worker, existing database, DNS record, or production resource was changed.

This is not a pass or fail verdict for better-auth. The measurements required to choose Worker-native auth have not run.

## Intended isolated resources

- Worker name: `woe-account-scout`
- D1 database name: `woe-account-scout`
- Scout URL: not assigned because deployment was blocked
- Existing `woe-pvp` Worker: untouched

## Gate verdicts

| Gate | Verdict | Evidence and method |
|---|---|---|
| Bundle size | PASS (orchestrator run, 2026-10-16) | `npm install` completed from the orchestrator's shell and `python3 deploy.py bundle` (Wrangler dry-run) produced `dist/index.js` at **2,084,257 bytes uncompressed**, about 3% of the 64 MiB cap from the live recheck. |
| Startup | BLOCKED | No Worker was deployed. The applicable startup limit is 1 second. A successful upload and first public request are required before judging this gate. |
| CPU | BLOCKED | No Worker was deployed, and no Cloudflare CPU telemetry was available. Wall time is not CPU time. The harness labels its repeated public request measurements as wall-clock proxies only. A Cloudflare dashboard, Workers Logs field, or API metric exposing CPU time for this Worker would settle this gate against the 10 ms Free limit. |
| Email-code round trip | BLOCKED | The Worker and D1 database do not exist. The prepared flow uses better-auth 1.7.10 with the native D1 binding and `emailOTP`. better-auth stores its non-plaintext verification value in D1, while the send hook records the simulated delivery in a D1-only mail sink. The harness reads that sink through the authenticated D1 API, asserts that the verification value excludes the live code, submits the code, requires a bearer token, and calls `get-session` to prove the user session. No public endpoint returns a live code. |
| Google rejection paths | BLOCKED live, PASS static syntax | The deployed test could not run. The prepared endpoint rejects a missing token with 400, malformed JWT shape with 400, and a wrong audience with 401 before passing a candidate token to better-auth for signature and claim verification. `node --check` passed for the Worker and harness. |
| Google real sign-in | BLOCKED | Exact prerequisite: Sean must create a Google Cloud OAuth 2.0 Web client for the scout origin and provide its client ID and client secret through the Worker secret/configuration path. No client exists yet. A real ID-token sign-in must not be marked passed until Google issues a token for that audience and better-auth verifies it. |
| iPhone Safari and home-screen sign-in | PENDING | Sean must open the eventual scout URL in iPhone Safari, complete email-code sign-in, confirm the session endpoint remains signed in, add the page to the Home Screen, open that installed app, repeat the email-code flow, and confirm its session. After the Google OAuth client exists, repeat Google ID-token sign-in in Safari and the installed home-screen app. Record iOS version, device model, success or error, and whether each context retains its own session after closing and reopening. |

## What was honestly measured

- Repository baseline before the scout: `24e90da`.
- Banked scout source milestone: `7ad35d3`, also `origin/main` at the resumed audit time.
- Local static validation: `python3 -m py_compile deploy.py`, `node --check src/index.js`, and `node --check test/live-scout.mjs` passed.
- Local test command: `node --test test/rejection.test.mjs` exited successfully. The live test body was skipped because `SCOUT_URL` was not set, so this is not evidence for the live rejection gate.
- Dependency attempt: `npm install` again had no output or completion for about 90 seconds and was interrupted. The npm cache contains Wrangler but not better-auth, and no other workspace has an installed better-auth package.
- Cloudflare credential attempt: the unchanged connector helper again failed while opening its credential surrogate socket with `PermissionError: [Errno 1] Operation not permitted`.
- Git attempt: exact-path staging failed because `.git/index.lock` could not be created on the read-only `.git` mount. The scaffold milestone was already committed and pushed by the orchestrator before this audit.

No cold response time, warm response time, startup duration, CPU time, bundle byte count, D1 query time, or auth round-trip time was measured. None is inferred.

## Bundle production method

Once dependencies can be installed, run from `account-scout/`:

```sh
npm install
python3 deploy.py bundle
```

The helper runs `wrangler deploy --dry-run --outdir dist --config wrangler.jsonc`. The report must use the exact byte length of the resulting uncompressed `dist/index.js`, not its transfer-compressed size. The pinned dependencies are better-auth 1.7.10 and Wrangler 4.45.0.

## Resume procedure

Use a session that can access the npm registry, the `custom.cloudflare` dynamic credential socket, and a writable Git index. Then run:

```sh
cd account-scout
npm install
python3 deploy.py bundle
python3 deploy.py create-db
python3 deploy.py apply-schema
python3 deploy.py deploy
SCOUT_URL=https://woe-account-scout.<workers-subdomain>.workers.dev npm test
SCOUT_URL=https://woe-account-scout.<workers-subdomain>.workers.dev node test/live-scout.mjs
```

Replace the URL placeholder with the URL printed by the deploy helper. Record bundle bytes, all raw timing samples, summary statistics, response status and body checks, and any Cloudflare CPU metric without relabeling wall time as CPU.

## Cleanup

No cleanup is currently required because no Cloudflare resource was created. After a successful resumed scout, delete only the throwaway Worker and D1 database with:

```sh
cd account-scout
python3 deploy.py cleanup
```

The helper targets the exact names `woe-account-scout` and the D1 UUID saved at creation time. Confirm both are absent afterward through read-only Cloudflare API calls.

## Commits

- Baseline before scout work: `24e90da`
- Scout source milestone: `7ad35d3`
- Report milestone: not committed because this session cannot create `.git/index.lock`
- Push status: `7ad35d3` was already present on `origin/main` at the resumed audit. The report remains untracked because staging is blocked.

The report commit and the live deployment and measurement milestone remain pending. Stage only `account-scout/` and `docs/accounts-phase0-scout-report.md` when resuming.
