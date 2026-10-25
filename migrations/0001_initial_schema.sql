-- OLTAVYN MVP schema v1. All timestamps are ISO-8601 UTC strings.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- SHA-256 hash of the session token; raw token only in cookie
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  niche TEXT,
  audience TEXT,
  goal TEXT,
  locale TEXT NOT NULL DEFAULT 'id-ID',
  allowed_sources TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_user_id);

CREATE TABLE evidence_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,          -- web_page | platform_observation | user_interview | export_file | other
  source_url TEXT,
  source_reference TEXT,
  title TEXT NOT NULL,
  excerpt TEXT,                       -- what the source says
  interpretation TEXT,                -- what we think it means (kept separate)
  observed_at TEXT,
  captured_at TEXT NOT NULL,
  collection_method TEXT NOT NULL,    -- manual_entry | user_export | official_api
  reliability_notes TEXT,
  limitations TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | archived
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_evidence_ws ON evidence_items(workspace_id, created_at);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  audience_problem TEXT NOT NULL,
  rationale TEXT,
  unknowns TEXT,
  is_hypothesis INTEGER NOT NULL DEFAULT 0,
  score_relevance INTEGER,            -- 1..5, editable decision aid
  score_evidence INTEGER,
  score_repeat_signal INTEGER,
  score_feasibility INTEGER,
  score_risk INTEGER,                 -- higher = riskier
  status TEXT NOT NULL DEFAULT 'candidate', -- candidate | accepted | rejected
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_opps_ws ON opportunities(workspace_id, status);

CREATE TABLE opportunity_evidence (
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,         -- supports | challenges | context
  PRIMARY KEY (opportunity_id, evidence_item_id)
);

CREATE TABLE content_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL,               -- brief | short_video_script | caption | article | thread | other
  status TEXT NOT NULL DEFAULT 'draft', -- draft | in_review | approved | rejected
  current_version_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_assets_ws ON content_assets(workspace_id, created_at);

CREATE TABLE content_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  claims_json TEXT NOT NULL DEFAULT '[]', -- [{text, evidence_ids[], status: supported|unsupported|needs_verification}]
  generator TEXT NOT NULL DEFAULT 'manual', -- manual | template_v1 | model:<name>
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (asset_id, version_number)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  asset_version_id TEXT NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  body_sha256 TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,             -- approved | rejected
  destination TEXT,                   -- intended channel/account (manual publishing)
  note TEXT,
  decided_at TEXT NOT NULL
);
CREATE INDEX idx_approvals_version ON approvals(asset_version_id);

CREATE TABLE experiments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_version_id TEXT NOT NULL REFERENCES content_versions(id),
  approval_id TEXT REFERENCES approvals(id),
  hypothesis TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned', -- planned | published | not_published
  published_at TEXT,
  published_url TEXT,
  stop_reason TEXT,
  next_decision TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_experiments_ws ON experiments(workspace_id, created_at);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  value_status TEXT NOT NULL,         -- observed | not_yet_available | not_collected | failed
  numeric_value REAL,                 -- NULL unless observed; 0 is a real zero
  unit TEXT NOT NULL,
  window_start TEXT,
  window_end TEXT,
  origin TEXT NOT NULL,               -- manual | imported | api
  source_reference TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL
);
CREATE INDEX idx_obs_exp ON observations(experiment_id);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,                  -- intentionally no FK: survives workspace deletion as minimal record
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_ws ON audit_events(workspace_id, created_at);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
