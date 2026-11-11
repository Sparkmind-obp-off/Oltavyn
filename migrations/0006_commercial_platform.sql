-- Commercial platform foundation. Prices are editable records; order items snapshot price/scope.
PRAGMA foreign_keys = ON;

CREATE TABLE commercial_catalog (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_idr INTEGER NOT NULL CHECK (price_idr >= 0),
  billing_type TEXT NOT NULL CHECK (billing_type IN ('one_time','monthly')),
  deliverables_json TEXT NOT NULL DEFAULT '[]',
  exclusions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_catalog_status ON commercial_catalog(status, sort_order);

CREATE TABLE commercial_orders (
  id TEXT PRIMARY KEY,
  merchant_order_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','processing','delivered','cancelled','expired','refunded','payment_failed')),
  currency TEXT NOT NULL DEFAULT 'IDR',
  subtotal_idr INTEGER NOT NULL CHECK (subtotal_idr >= 0),
  total_idr INTEGER NOT NULL CHECK (total_idr >= 0),
  customer_note TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX idx_commercial_orders_owner ON commercial_orders(user_id, workspace_id, created_at DESC);

CREATE TABLE commercial_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES commercial_orders(id) ON DELETE CASCADE,
  catalog_id TEXT REFERENCES commercial_catalog(id),
  sku_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_idr INTEGER NOT NULL CHECK (unit_price_idr >= 0),
  line_total_idr INTEGER NOT NULL CHECK (line_total_idr >= 0),
  deliverables_snapshot_json TEXT NOT NULL,
  exclusions_snapshot_json TEXT NOT NULL
);
CREATE INDEX idx_commercial_order_items_order ON commercial_order_items(order_id);

CREATE TABLE commercial_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES commercial_orders(id),
  provider TEXT NOT NULL CHECK (provider = 'duitku_pop'),
  merchant_order_id TEXT NOT NULL UNIQUE,
  reference TEXT,
  payment_method TEXT,
  payment_url TEXT,
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 0),
  status TEXT NOT NULL CHECK (status IN ('created','pending','paid','failed','expired','cancelled','refunded')),
  provider_payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_payments_order ON commercial_payments(order_id, created_at DESC);

CREATE TABLE commercial_payment_events (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES commercial_payments(id),
  provider_event_key TEXT NOT NULL UNIQUE,
  result_code TEXT NOT NULL,
  amount_idr INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  signature_valid INTEGER NOT NULL CHECK (signature_valid IN (0,1)),
  received_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_payment_events_payment ON commercial_payment_events(payment_id, received_at DESC);

CREATE TABLE commercial_entitlements (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES commercial_orders(id),
  order_item_id TEXT NOT NULL REFERENCES commercial_order_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  sku TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','consumed','revoked','expired')),
  granted_at TEXT NOT NULL,
  UNIQUE(order_item_id)
);
CREATE INDEX idx_commercial_entitlements_owner ON commercial_entitlements(user_id, workspace_id, status);

CREATE TABLE commercial_service_jobs (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT NOT NULL UNIQUE REFERENCES commercial_entitlements(id),
  order_id TEXT NOT NULL REFERENCES commercial_orders(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  status TEXT NOT NULL CHECK (status IN ('queued','in_progress','waiting_customer','review','delivered','cancelled')),
  brief_json TEXT NOT NULL DEFAULT '{}',
  assigned_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_commercial_jobs_queue ON commercial_service_jobs(status, created_at);

INSERT INTO commercial_catalog
(id,sku,name,description,price_idr,billing_type,deliverables_json,exclusions_json,status,sort_order,created_at,updated_at)
VALUES
('cat_affiliate_starter','affiliate_starter','Affiliate Starter','Paket evaluasi satu produk dan brief konten awal.',99000,'one_time',
 '["Evaluasi 1 kandidat produk","3 ide dan skrip konten","Caption, CTA, hashtag","Brief produksi dan daftar klaim yang perlu diverifikasi"]',
 '["Tidak termasuk pembuatan video","Tidak termasuk publikasi","Tidak menjamin penjualan","Tidak termasuk scraping berbayar"]','active',10,datetime('now'),datetime('now')),
('cat_campaign_builder','campaign_builder','Campaign Builder','Paket perencanaan kampanye konten affiliate.',299000,'one_time',
 '["Evaluasi hingga 3 kandidat produk","Shortlist dan alasan keputusan","10 konsep dan skrip konten","Kalender konten 2 minggu","Storyboard dan brief produksi","1 kali revisi"]',
 '["Tidak termasuk pembuatan video","Tidak termasuk publikasi","Tidak menjamin penjualan","Tidak termasuk scraping berbayar"]','active',20,datetime('now'),datetime('now')),
('cat_affiliate_growth','affiliate_growth','Affiliate Growth','Layanan pendampingan operasional konten affiliate bulanan.',699000,'monthly',
 '["4 batch konten per bulan","Evaluasi produk berkala","Review dan optimasi draf","Laporan berdasarkan data yang tersedia"]',
 '["Tidak termasuk pembuatan video","Tidak termasuk publikasi otomatis","Tidak menjamin penjualan","Tidak termasuk biaya provider eksternal"]','active',30,datetime('now'),datetime('now'));
