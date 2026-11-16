-- Traveler progression starts with canonical Daily completions only.  Legacy
-- daily_results/daily_guesses are deliberately not read by these tables.
CREATE TABLE IF NOT EXISTS xp_ledger (
  account_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, source_type, source_key)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  account_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  qualifying_key TEXT NOT NULL,
  PRIMARY KEY (account_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS profile_loadouts (
  account_id TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  title_id TEXT NOT NULL DEFAULT 'traveler',
  card_id TEXT NOT NULL DEFAULT 'blue-horizon',
  avatar_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS canonical_daily_completions_account_date
  ON canonical_daily_completions(account_id, daily_date);
CREATE INDEX IF NOT EXISTS canonical_daily_rounds_account_date
  ON canonical_daily_rounds(account_id, daily_date);
CREATE INDEX IF NOT EXISTS user_achievements_account_earned
  ON user_achievements(account_id, earned_at DESC);
