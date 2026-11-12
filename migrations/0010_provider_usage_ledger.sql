-- Provider usage & cost ledger (additive). Cost columns stay NULL when the provider does not
-- report a verified monetary amount; never inferred from call counts.
-- Rollback: DROP TABLE provider_usage_ledger;
CREATE TABLE provider_usage_ledger (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','refused')),
  units_json TEXT NOT NULL DEFAULT '{}',
  reserved_usd REAL CHECK (reserved_usd IS NULL OR reserved_usd >= 0),
  actual_cost_usd REAL CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0),
  cost_basis TEXT NOT NULL,
  external_ref TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_provider_usage_month ON provider_usage_ledger(created_at, provider);
CREATE INDEX idx_provider_usage_ws ON provider_usage_ledger(workspace_id, created_at);
CREATE INDEX idx_provider_usage_user ON provider_usage_ledger(user_id, created_at);
