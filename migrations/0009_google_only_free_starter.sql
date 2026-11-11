-- Google-only customer identity and permanent Free Starter plan.
-- Existing users receive the same baseline plan when they first sign in with Google.
CREATE TABLE user_plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'free_starter',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  source TEXT NOT NULL DEFAULT 'google_signup',
  started_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_user_plans_status ON user_plans(plan_code, status);

INSERT OR IGNORE INTO user_plans
(user_id, plan_code, status, source, started_at, expires_at, created_at, updated_at)
SELECT id, 'free_starter', 'active', 'migration_existing', created_at, NULL, created_at, created_at
FROM users;
