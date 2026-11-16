-- Cached public achievement percentages. Counts stay private; only the
-- thresholded display string leaves the worker.
CREATE TABLE IF NOT EXISTS achievement_community (
  achievement_id TEXT PRIMARY KEY,
  eligible_accounts INTEGER NOT NULL,
  earners INTEGER NOT NULL,
  percentage INTEGER,
  updated_at INTEGER NOT NULL
);
