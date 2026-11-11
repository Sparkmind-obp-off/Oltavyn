-- Every newly provisioned customer starts on the free core plan.
-- Free is an ongoing entry tier, not a time-limited trial; paid service orders remain separate.
ALTER TABLE users ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (plan_tier IN ('free','solo','creator','pro'));
ALTER TABLE users ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'active'
  CHECK (plan_status IN ('active','paused','cancelled'));
ALTER TABLE users ADD COLUMN plan_started_at TEXT;
UPDATE users SET plan_started_at = created_at WHERE plan_started_at IS NULL;
