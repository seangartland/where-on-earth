-- One credit per invited account, ever. The invitee_id primary key means an
-- invitee who accepts invites from two inviters can only ever hold a credit
-- for the first one, and the row's status gates payout at the invitee's
-- first canonical Daily completion.
CREATE TABLE IF NOT EXISTS referral_credits (
  invitee_id TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at INTEGER NOT NULL,
  paid_at    INTEGER
);
CREATE INDEX IF NOT EXISTS referral_credits_inviter_idx
  ON referral_credits (inviter_id, status);
