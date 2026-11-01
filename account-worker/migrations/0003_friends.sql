CREATE TABLE IF NOT EXISTS profiles (
  account_id   TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  display_name TEXT,
  share_pins   INTEGER NOT NULL DEFAULT 1,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
  account_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  friend_id  TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_invites (
  token_hash TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by    TEXT,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS friend_invites_inviter_idx
  ON friend_invites (inviter_id, expires_at);

CREATE TABLE IF NOT EXISTS daily_guesses (
  account_id   TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  date         TEXT NOT NULL,
  slot         INTEGER NOT NULL,
  location_id  TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  distance_km  INTEGER NOT NULL,
  score        INTEGER NOT NULL,
  device_id    TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, date, location_id),
  UNIQUE (account_id, date, slot)
);
CREATE INDEX IF NOT EXISTS daily_guesses_lookup_idx
  ON daily_guesses (date, location_id, account_id);

CREATE TABLE IF NOT EXISTS friend_attempt_events (
  account_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS friend_attempt_events_account_created_idx
  ON friend_attempt_events (account_id, created_at);
