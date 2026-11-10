-- OLTAVYN Faceless Affiliate Content Factory foundation.
-- All timestamps are ISO-8601 UTC strings. Unknown marketplace metrics remain NULL.
PRAGMA foreign_keys = ON;

CREATE TABLE affiliate_channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('shopee_video','tiktok','instagram','youtube','facebook')),
  channel_name TEXT NOT NULL,
  handle TEXT,
  category TEXT,
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','paused','archived')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_affiliate_channels_ws ON affiliate_channels(workspace_id, status);
CREATE UNIQUE INDEX uq_affiliate_channel_handle
  ON affiliate_channels(workspace_id, platform, handle)
  WHERE handle IS NOT NULL AND handle <> '';

CREATE TABLE affiliate_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL DEFAULT 'shopee',
  external_product_id TEXT,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  price_amount INTEGER CHECK (price_amount IS NULL OR price_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  commission_rate_percent REAL
    CHECK (commission_rate_percent IS NULL OR (commission_rate_percent >= 0 AND commission_rate_percent <= 100)),
  commission_amount INTEGER CHECK (commission_amount IS NULL OR commission_amount >= 0),
  product_rating REAL CHECK (product_rating IS NULL OR (product_rating >= 0 AND product_rating <= 5)),
  review_count INTEGER CHECK (review_count IS NULL OR review_count >= 0),
  sold_count INTEGER CHECK (sold_count IS NULL OR sold_count >= 0),
  seller_name TEXT,
  seller_rating REAL CHECK (seller_rating IS NULL OR (seller_rating >= 0 AND seller_rating <= 5)),
  seller_location TEXT,
  primary_image_url TEXT,
  evidence_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK (evidence_state IN ('unverified','verified','conflicting')),
  lifecycle_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (lifecycle_status IN ('candidate','shortlisted','selected','rejected','archived')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, marketplace, canonical_url)
);
CREATE INDEX idx_affiliate_products_ws_status
  ON affiliate_products(workspace_id, lifecycle_status, updated_at);
CREATE INDEX idx_affiliate_products_external
  ON affiliate_products(workspace_id, marketplace, external_product_id);

CREATE TABLE affiliate_product_evidence (
  product_id TEXT NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('supports','challenges','context')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (product_id, evidence_item_id)
);
CREATE INDEX idx_affiliate_product_evidence_evidence
  ON affiliate_product_evidence(evidence_item_id);

CREATE TABLE affiliate_product_scorecards (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  rubric_version TEXT NOT NULL DEFAULT 'v1',
  score_demand INTEGER CHECK (score_demand IS NULL OR score_demand BETWEEN 1 AND 5),
  score_quality INTEGER CHECK (score_quality IS NULL OR score_quality BETWEEN 1 AND 5),
  score_commission INTEGER CHECK (score_commission IS NULL OR score_commission BETWEEN 1 AND 5),
  score_visual_potential INTEGER CHECK (score_visual_potential IS NULL OR score_visual_potential BETWEEN 1 AND 5),
  score_price_accessibility INTEGER CHECK (score_price_accessibility IS NULL OR score_price_accessibility BETWEEN 1 AND 5),
  score_seller_risk INTEGER CHECK (score_seller_risk IS NULL OR score_seller_risk BETWEEN 1 AND 5),
  weighted_total REAL CHECK (weighted_total IS NULL OR (weighted_total >= 20 AND weighted_total <= 100)),
  rationale_json TEXT NOT NULL DEFAULT '{}',
  scored_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_affiliate_product_scores
  ON affiliate_product_scorecards(product_id, created_at);

CREATE TABLE affiliate_experiment_products (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES affiliate_channels(id) ON DELETE CASCADE,
  affiliate_url TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (experiment_id, product_id, channel_id)
);
CREATE INDEX idx_affiliate_experiment_products_product
  ON affiliate_experiment_products(product_id);
