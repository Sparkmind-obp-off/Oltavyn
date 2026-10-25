# OLTAVYN — Data & Database Design

## Design principles
Relational source of truth, explicit ownership, foreign-key integrity, versioned migrations, minimal personal data, provenance for every evidence/metric, and export/deletion by workspace. Use UTC timestamps in storage and display local time in the UI.

## Initial entities
- **users:** identity-provider subject, created_at, status. Store only necessary profile fields.
- **workspaces:** id, owner_user_id, name, niche, audience, goal, locale, settings_json, created_at, updated_at.
- **workspace_members:** workspace_id, user_id, role; optional until team support is needed.
- **evidence_items:** id, workspace_id, source_type, source_url/reference, title, excerpt_or_summary, observed_at, captured_at, collector_method, reliability_notes, status, created_by.
- **opportunities:** id, workspace_id, title, audience_problem, rationale, score_breakdown_json, uncertainty_notes, status, created_at, updated_at.
- **opportunity_evidence:** opportunity_id, evidence_item_id, relationship_type (supports/challenges/context).
- **content_assets:** id, workspace_id, opportunity_id, format, status, current_version_id, created_at, updated_at.
- **content_versions:** id, asset_id, version_number, body_json/text, claim_evidence_map_json, created_by, created_at.
- **approvals:** id, asset_version_id, reviewer_user_id, decision, note, decided_at.
- **experiments:** id, workspace_id, asset_version_id, hypothesis, channel, status, planned_at, published_at, published_url, stop_reason.
- **observations:** id, experiment_id, metric_name, numeric_value/text_value, unit, observation_window_start/end, source_type, source_reference, observed_at, notes.
- **integration_connections:** id, workspace_id, provider, external_account_ref, encrypted_credentials_reference, scopes, status, connected_at; never store raw secrets in plaintext columns.
- **audit_events:** id, workspace_id, actor_user_id, action, resource_type/id, outcome, created_at, safe_metadata_json.

## Constraints and indexes
- Every workspace-owned row includes workspace_id or is reachable through a constrained parent.
- Foreign keys prevent orphaned evidence links and asset versions.
- Unique (asset_id, version_number); unique idempotency key for side-effect requests.
- Index workspace_id + created_at/status for common lists; indexes for evidence source and experiment time window as needed.
- Validate numeric metric values and units; preserve raw imported value when normalization is applied.
- Use soft-delete only where a documented recovery/audit need exists; otherwise honor deletion policy and purge dependent data.

## JSON use
Use JSON for flexible provider payload metadata or score breakdowns, not for core relationships, permissions, approvals or query-critical fields. Validate JSON shape at application boundaries.

## Retention and privacy
Collect only data required for the workflow. Document retention periods before production. Provide workspace export and deletion. Remove or redact provider tokens and private content from logs. Backups and legal retention exceptions must be explained in policy.

## Migration order
Identity/workspaces → evidence/opportunities → assets/versions/approvals → experiments/observations → integrations/audit. Each migration must be reversible where practical and tested on a clean database.