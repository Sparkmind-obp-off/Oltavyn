-- OLTAVYN Agent Runtime foundation: durable run, step and approval ledgers.
PRAGMA foreign_keys = ON;

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  intent TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('planned','running','completed','failed','needs_approval','cancelled')),
  plan_json TEXT NOT NULL DEFAULT '{}',
  policy_version TEXT NOT NULL DEFAULT 'v1',
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, workspace_id, idempotency_key)
);
CREATE INDEX idx_agent_runs_workspace ON agent_runs(workspace_id, created_at DESC);
CREATE INDEX idx_agent_runs_owner ON agent_runs(user_id, workspace_id, updated_at DESC);

CREATE TABLE agent_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  tool_id TEXT NOT NULL,
  tool_version TEXT NOT NULL,
  permission_class TEXT NOT NULL CHECK (permission_class IN ('R0','R1','W1','W2','P1','P2')),
  status TEXT NOT NULL CHECK (status IN ('planned','running','completed','failed','skipped','needs_approval')),
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  error_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, step_index)
);
CREATE INDEX idx_agent_run_steps_run ON agent_run_steps(run_id, step_index);

CREATE TABLE agent_approval_requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES agent_run_steps(id) ON DELETE SET NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_class TEXT NOT NULL CHECK (permission_class IN ('W1','W2','P1','P2')),
  action_hash TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  expires_at TEXT NOT NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_agent_approvals_workspace ON agent_approval_requests(workspace_id, status, created_at DESC);
