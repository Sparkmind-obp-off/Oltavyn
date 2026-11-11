# Affiliate OS — Phase 2 implementation status

Date: 2026-11-11  
Branch: `feat/faceless-affiliate-factory-phase1`

## Architecture alignment

- AVORLUNE remains the parent business and owns affiliate media/channels.
- OLTAVYN remains the reusable, platform-neutral Core Engine.
- Affiliate OS is the first operating product built on OLTAVYN, initially for Shopee Affiliate Indonesia.
- The candidate deployment hostname is `affiliate-os.avorlune.biz.id`; it is not configured or deployed by this change.

## Implemented in this branch

- Migration foundation for affiliate channels, products, evidence links, scorecards, and experiment-product relationships.
- Authenticated API module with workspace ownership checks for channel and product records.
- Manual product intake and channel registry endpoints.
- Evidence association that rejects evidence from another workspace.
- Versioned weighted product scorecard. Total remains NULL until all six dimensions have scores.
- Provider adapters for Groq, Tavily, Apify, and Scrape.ly.
- A standalone Affiliate OS workbench at `/affiliate` for manual product/channel entry, provider status, Groq drafts, and Tavily research.
- Provider secrets are read from Worker bindings; no credentials are stored in source or D1.

## Not verified / not done

- This feature branch has not been run through local typecheck, build, smoke tests, or a browser walkthrough in this session.
- Migration 0002 has not been applied to local or production D1 in this session.
- No provider secret has been configured or validated.
- No external API call, Actor run, paid credit, or scraper execution has been made.
- No dataset import, Shopee account integration, automatic affiliate link creation, or auto-publishing exists.
- No production migration or deployment has been performed.
- Product scorecards are stored and retrievable by API; the first UI slice does not yet include scorecard editing or evidence-link management controls.

## Next required engineering checks

1. Install dependencies and run `npm run typecheck`.
2. Apply all migrations to a clean local D1 and run `npm run build`.
3. Extend smoke tests to create a workspace, product, channel, evidence association, and scorecard.
4. Verify a user cannot read or modify another user's products/channels/evidence.
5. Fix any test failures before merging PR #1.
6. Only after local verification, request separate owner approval for production migration and deployment.

## Release boundary

A successful GitHub push is not a successful deployment. Keep PR #1 open/draft until local verification passes. Never run remote migrations or deploy as part of this phase without a separate explicit release approval.
