import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const apply = (db, names) => names.forEach((name) => db.exec(migration(name)));

function snapshot(db) {
  return db.prepare('SELECT location_id, answer_lat, answer_lng, country, continent, pool_index FROM daily_locations ORDER BY pool_index').all();
}

for (const [name, setup] of [
  ['fresh schema', () => {}],
  ['production-shaped schema', (db) => db.exec(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES ('existing', 'Existing', 'existing@example.test', 1, 1, 1)`)],
]) {
  test(`0004 through 0007 re-run without changing the immutable seed on ${name}`, () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    apply(db, ['0001_init.sql', '0003_friends.sql']);
    setup(db);
    apply(db, ['0004_daily_trust.sql', '0005_traveler_progression.sql', '0006_achievement_community.sql', '0007_progression_integrity.sql']);
    const first = snapshot(db);
    assert.equal(first.length, 803);
    apply(db, ['0004_daily_trust.sql', '0005_traveler_progression.sql', '0006_achievement_community.sql', '0007_progression_integrity.sql']);
    assert.deepEqual(snapshot(db), first);
  });
}

test('schema rejects orphan and non-five-round canonical completions', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  apply(db, ['0001_init.sql', '0003_friends.sql', '0004_daily_trust.sql', '0007_progression_integrity.sql']);
  db.exec(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES ('a', 'A', 'a@example.test', 1, 1, 1)`);
  assert.throws(() => db.exec(`INSERT INTO canonical_daily_completions
    (account_id, daily_date, total_score, completed_at) VALUES ('a', '2026-10-01', 0, 1)`), /requires slots/);
  const locations = db.prepare('SELECT location_id, country, continent FROM daily_locations ORDER BY pool_index LIMIT 5').all();
  for (let slot = 0; slot < 5; slot += 1) db.prepare(`INSERT INTO canonical_daily_rounds
    (account_id, daily_date, slot, location_id, guess_lat, guess_lng, distance_km, score, country, continent, submitted_at)
    VALUES (?, '2026-10-01', ?, ?, 0, 0, 0, 1000, ?, ?, 1)`).run('a', slot, locations[slot].location_id, locations[slot].country, locations[slot].continent);
  db.exec(`INSERT INTO canonical_daily_completions
    (account_id, daily_date, total_score, completed_at) VALUES ('a', '2026-10-01', 5000, 1)`);
  assert.throws(() => db.exec(`DELETE FROM canonical_daily_rounds WHERE account_id = 'a' AND daily_date = '2026-10-01' AND slot = 0`), /cannot remove/);
});
