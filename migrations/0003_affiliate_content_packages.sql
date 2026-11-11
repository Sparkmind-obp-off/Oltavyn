-- Affiliate OS: traceability from affiliate product to Content Studio assets.
-- Additive only. Rollback: DROP TABLE affiliate_content_packages; (no other table depends on it)
CREATE TABLE affiliate_content_packages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES affiliate_channels(id) ON DELETE SET NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds IN (15, 30, 60)),
  generator TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_affiliate_content_packages_product ON affiliate_content_packages(product_id, created_at);
CREATE INDEX idx_affiliate_content_packages_ws ON affiliate_content_packages(workspace_id);
