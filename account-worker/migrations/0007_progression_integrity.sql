-- A level-two title is a durable player choice; the other title unlocks at 5.
CREATE TABLE IF NOT EXISTS level_two_title_choices (
  account_id TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  title_id TEXT NOT NULL CHECK (title_id IN ('window-seat', 'aisle-seat'))
);

-- A completion may be created only after all five canonical slots exist, and
-- completed round sets are immutable so a completion can never become orphaned.
CREATE TRIGGER IF NOT EXISTS canonical_completion_requires_all_slots
BEFORE INSERT ON canonical_daily_completions
FOR EACH ROW BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM canonical_daily_rounds
    WHERE account_id = NEW.account_id AND daily_date = NEW.daily_date) = 5
    AND (SELECT COUNT(DISTINCT slot) FROM canonical_daily_rounds
      WHERE account_id = NEW.account_id AND daily_date = NEW.daily_date) = 5
    AND (SELECT MIN(slot) FROM canonical_daily_rounds
      WHERE account_id = NEW.account_id AND daily_date = NEW.daily_date) = 0
    AND (SELECT MAX(slot) FROM canonical_daily_rounds
      WHERE account_id = NEW.account_id AND daily_date = NEW.daily_date) = 4
    THEN NULL ELSE RAISE(ABORT, 'canonical completion requires slots 0-4') END;
END;

CREATE TRIGGER IF NOT EXISTS canonical_rounds_preserve_completed_set_delete
BEFORE DELETE ON canonical_daily_rounds
FOR EACH ROW WHEN EXISTS (SELECT 1 FROM canonical_daily_completions
  WHERE account_id = OLD.account_id AND daily_date = OLD.daily_date) BEGIN
  SELECT RAISE(ABORT, 'cannot remove a completed canonical round');
END;

CREATE TRIGGER IF NOT EXISTS canonical_rounds_preserve_completed_set_update
BEFORE UPDATE OF account_id, daily_date, slot ON canonical_daily_rounds
FOR EACH ROW WHEN EXISTS (SELECT 1 FROM canonical_daily_completions
  WHERE account_id = OLD.account_id AND daily_date = OLD.daily_date) BEGIN
  SELECT RAISE(ABORT, 'cannot alter a completed canonical round');
END;
