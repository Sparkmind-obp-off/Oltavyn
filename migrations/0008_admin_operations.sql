-- Admin operations, delivery records and customer revision requests.
PRAGMA foreign_keys = ON;

ALTER TABLE commercial_service_jobs ADD COLUMN delivery_note TEXT;
ALTER TABLE commercial_service_jobs ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0);
ALTER TABLE commercial_service_jobs ADD COLUMN revision_limit INTEGER NOT NULL DEFAULT 1 CHECK (revision_limit >= 0);
ALTER TABLE commercial_service_jobs ADD COLUMN completed_at TEXT;

CREATE TABLE commercial_deliverables (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES commercial_service_jobs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'link',
  visibility TEXT NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer','admin')),
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_deliverables_job ON commercial_deliverables(job_id, created_at DESC);

CREATE TABLE commercial_job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES commercial_service_jobs(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  note TEXT,
  from_status TEXT,
  to_status TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_job_events_job ON commercial_job_events(job_id, created_at DESC);

CREATE TABLE commercial_revision_requests (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES commercial_service_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','completed')),
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_revision_requests_job ON commercial_revision_requests(job_id, created_at DESC);
