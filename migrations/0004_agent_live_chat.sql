-- OLTAVYN Agent Live Chat: workspace-scoped, auditable conversation history.
PRAGMA foreign_keys = ON;

CREATE TABLE agent_conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_agent_conversations_owner
  ON agent_conversations(user_id, workspace_id, updated_at);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_agent_messages_conversation
  ON agent_messages(conversation_id, created_at);
