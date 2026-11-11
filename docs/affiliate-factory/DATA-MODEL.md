# Affiliate Factory Data Model

Migration: `0002_affiliate_factory.sql`

## New tables

### affiliate_channels
One row per operated channel in a workspace. Platform and channel are separate from affiliate-program approval. Supports planned, active, paused, and archived channels.

### affiliate_products
One row per marketplace product candidate. Marketplace IDs and canonical URLs support deduplication. Numeric signals are nullable; unknown is not zero. Product lifecycle is tracked independently from evidence verification.

### affiliate_product_evidence
Many-to-many relationship between product candidates and existing OLTAVYN evidence items. Relationship values: supports, challenges, context.

### affiliate_product_scorecards
Versioned score snapshots. Scores use a 1–5 scale, each with a rationale. Risk is reverse-weighted. A total is nullable until all dimensions are scored.

### affiliate_experiment_products
Connects an existing experiment to the product, optional channel, and affiliate URL used for that test. Existing experiments and observations remain authoritative for publication and performance records.

## Existing tables reused

- `workspaces`: tenant boundary and operating context
- `evidence_items`: source provenance and evidence ledger
- `opportunities` / `opportunity_evidence`: problem and evidence-backed decision
- `content_assets` / `content_versions`: content package and immutable versions
- `approvals`: exact-version and destination approval
- `experiments` / `observations`: publication and measured results
- `audit_events`: security-relevant actions

## Integrity requirements for application layer

SQLite foreign keys cannot by themselves guarantee that two referenced rows belong to the same workspace. Before writing a product/evidence relationship or experiment/product relationship, the API must verify that all involved records belong to the authenticated user's workspace.

Do not add a route that returns records by ID without workspace ownership validation.
