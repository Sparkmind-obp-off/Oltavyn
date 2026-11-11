# OLTAVYN changelog

All dates use YYYY-MM-DD. This log records repository changes; it does not imply production deployment.

## 2026-11-11 — Affiliate OS Phase 3 (code)

- Added migration `0003_affiliate_content_packages.sql` (additive).
- Rewrote `src/routes/affiliate.ts`: full channel/product CRUD + archive, canonical-URL dedupe, evidence link/unlink (no auto-verify), scorecard history with rationale enforcement, content packages into Content Studio, experiment↔product linking, summary/next action.
- Added `src/lib/affiliateGenerator.ts` (deterministic faceless 15/30/60s package) and `src/lib/providers.ts` (timeouts, kill switches, Actor allowlist, error mapping, redaction).
- Workspace export/delete now include affiliate tables (tracking URLs excluded from export).
- New operator UI at `/affiliate` (tabs, product detail, scorecard editor, evidence manager, pipeline, experiments, provider/cost status).
- Tests: `tests/affiliate-smoke.mjs` (65), `tests/providers.test.ts` (29, mocked); CI runs both.
- See `docs/affiliate-factory/IMPLEMENTATION_REPORT.md`.

## 2026-11-11 — documentation

- Added `GENSPARK_FULLSTACK_IMPLEMENTATION_PROMPT.md` as a project-specific implementation instruction for Genspark.ai.
- Added `docs/RELEASE_RUNBOOK.md` with environment separation, local verification, provider enablement, release gates and incident response.
- Added implementation audit, provider review register, security/privacy checklist, QA matrix and operations runbook.
- Existing Affiliate OS implementation remains on `feat/faceless-affiliate-factory-phase1` pending verification.
- No production migration, deployment, provider credential validation, paid provider call or Actor run is recorded by these documentation changes.

## Historical implementation

See Git history and `docs/affiliate-factory/PHASE_1_STATUS.md`, `docs/affiliate-factory/PHASE_2_STATUS.md`, and `README.md` for earlier feature work and its stated verification boundaries.
