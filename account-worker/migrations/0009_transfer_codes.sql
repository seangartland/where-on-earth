-- One-time handoff for moving a signed-in session to another browser or
-- installed PWA on the same or a different device. An installed PWA keeps
-- a storage container separate from the browser, so the bearer session in
-- localStorage never carries over on its own; this table lets a signed-in
-- profile mint a short code that a signed-out surface can redeem for the
-- same session. Only the SHA-256 hash of the code is stored. A profile may
-- hold at most one unused code at a time: issuing a new one invalidates
-- any earlier unused code for that profile (see transfer.js).

CREATE TABLE IF NOT EXISTS auth_transfer_codes (
  code_hash TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  session_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_transfer_codes_user_idx ON auth_transfer_codes (user_id, used_at);

-- Per-IP throttle on redemption guesses against /v1/auth/transfer, the
-- same windowed-count pattern email_send_events uses for send throttling.
CREATE TABLE IF NOT EXISTS transfer_attempt_events (
  id TEXT NOT NULL PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transfer_attempt_events_ip_created_idx ON transfer_attempt_events (ip, created_at);
