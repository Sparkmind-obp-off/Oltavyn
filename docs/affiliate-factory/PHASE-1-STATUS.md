# Phase 1 Status

Date: 2026-11-11  
Branch: `feat/faceless-affiliate-factory-phase1`

## Completed in this branch

- Internal-first hybrid architecture and operating boundaries documented.
- Channel registry, product catalog, product evidence, scorecard, and experiment-product schema added in migration `0002_affiliate_factory.sql`.
- Product scoring rubric and manual-first workflow documented.
- Architecture decision ADR-015 recorded.
- README entry point added for the factory documentation.

## Not yet verified / not yet done

- Migration has **not** been applied to local or production D1 in this session.
- API routes and UI screens for channels/products/scorecards are not implemented by this Phase 1 change.
- No live Shopee product research has been imported.
- No paid API, scraper, AI provider, or production deployment has been invoked.
- No content has been published.

## Acceptance checklist

- [ ] Apply all migrations to a clean local D1 database.
- [ ] Run existing typecheck, build, and smoke tests.
- [ ] Add schema-focused checks for foreign keys, unique constraints, score ranges, and NULL handling.
- [ ] Implement authenticated workspace-scoped API routes for channels and products.
- [ ] Add minimal UI for manual product entry and scorecard.
- [ ] Verify data isolation across two users/workspaces.
- [ ] Only after local verification, ask owner before remote migration/deployment.

## Next implementation slice

Build the smallest usable Product Intelligence vertical slice:
1. authenticated channel CRUD;
2. manual product create/list/update;
3. evidence association with same-workspace validation;
4. scorecard creation with rubric v1 and rationale;
5. candidate shortlist view.

Keep all source intake manual or owner-export based until a source and its terms/cost are explicitly verified.
