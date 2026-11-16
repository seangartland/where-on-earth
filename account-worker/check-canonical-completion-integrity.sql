-- Read-only pre-deploy assertion: must return zero rows before applying 0007.
SELECT c.account_id, c.daily_date
FROM canonical_daily_completions AS c
LEFT JOIN canonical_daily_rounds AS r
  ON r.account_id = c.account_id AND r.daily_date = c.daily_date
GROUP BY c.account_id, c.daily_date
HAVING COUNT(DISTINCT r.slot) != 5
  OR MIN(r.slot) != 0
  OR MAX(r.slot) != 4;
