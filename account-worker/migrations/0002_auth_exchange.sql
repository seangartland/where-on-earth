-- One-time handoff for the full-page Google sign-in flow.
-- auth_attempts: one row per sign-in attempt started at
-- /v1/auth/google/start; the browser carries the id in a cookie and the
-- better-auth callbackURL lands on /v1/auth/google/land?attempt=<id>.
-- auth_exchange_codes: only the SHA-256 hash of a code is stored. A code is
-- minted at land time for the session better-auth just created, is bound to
-- its attempt, expires in minutes, and is consumed exactly once by
-- /v1/auth/exchange, which returns the session to the game page.

CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  return_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS auth_exchange_codes (
  code_hash TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL,
  session_expires_at INTEGER NOT NULL,
  attempt_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
