-- Every Google-authenticated OLTAVYN customer starts on the no-cost Free plan.
-- Free is an account access tier, not a paid service order or an auto-renewing trial.
PRAGMA foreign_keys = ON;

CREATE TABLE account_plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'free' CHECK (plan_code IN ('free','solo','creator','pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_account_plans_status ON account_plans(status, plan_code);

INSERT OR IGNORE INTO account_plans (user_id,plan_code,status,started_at,created_at,updated_at)
SELECT id,'free','active',created_at,datetime('now'),datetime('now') FROM users;
