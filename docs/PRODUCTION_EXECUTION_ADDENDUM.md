# OLTAVYN Production Execution Addendum — Owner Requirements

Date: 2026-11-11
Applies to: `Sparkmind-obp-off/Oltavyn`, PR #1, branch `feat/faceless-affiliate-factory-phase1`

This addendum supersedes older instructions that mention GitHub Actions or CI workflows.

## 1. Product target

Deliver a genuinely usable **Affiliate OS** on top of the existing OLTAVYN Core Engine. Preserve the existing Hono + Cloudflare Pages/Workers + D1 + TypeScript + vanilla JavaScript stack. Do not rewrite the app or replace its database/auth architecture without a documented blocker.

The operating loop must work end-to-end:

1. Product and channel intake
2. Evidence capture, provenance and review
3. Product scoring with rationale and score history
4. Opportunity selection
5. Faceless content brief, hook, script, storyboard, asset plan, caption, CTA, affiliate disclosure, claim/evidence map and rights checklist
6. Content Studio asset/version creation
7. Exact-version and exact-destination approval
8. Manual affiliate-link creation and manual publishing
9. Experiment and real observation capture
10. Learning summary based only on recorded observations

Unknown values must remain unknown (NULL), not zero. Hypotheses must be labelled. No fabricated sales, reviews, metrics, testimonials, product tests, or performance claims.

## 2. Release and repository policy

- Work directly on `feat/faceless-affiliate-factory-phase1`; no CI workflows. Merge/release only after the owner-requested direct-production release gate is reviewed.
- Push reviewable commits to GitHub.
- **Do not use GitHub Actions, CI/CD, workflow YAML, or automated deployment workflows.** The existing `.github/workflows/verify.yml` and proposed workflow artifacts are removed by owner instruction.
- Use manual commands from `docs/MANUAL_RELEASE_AND_PROVIDER_RUNBOOK.md`.
- Owner has explicitly requested direct production setup (no preview). The production D1 database, binding, and migrations are now authorized and have been configured. Production code deployment and production smoke tests must still be verified carefully; do not claim completion until live checks pass.
- Never say a command passed unless its actual output was observed.
- No paid API, Actor, subscription, credit, proxy, or provider action without clear disclosure and explicit approval.

## 3. Database and environment policy

The previous production D1 UUID `94c9a84b-7fa8-49a4-b9f2-8006450a767b` is still referenced by the live Pages project, but is absent from the currently accessible D1 database list. Do not silently overwrite the binding or assume its data is disposable.

The temporary `oltavyn-preview` database was deleted after the owner directed the work to go directly to production. A new empty production database was created:
- Name: `oltavyn-production`
- UUID: `2456b40f-2d4c-45f6-a10f-82d17606d856`
- Region: APAC

The feature branch Wrangler config now points directly to this production database. The previous production UUID `94c9a84b-7fa8-49a4-b9f2-8006450a767b` was not found (7404); old data has not been recovered. Do not claim old accounts/workspaces are restored.

Production migrations 0001–0003 have been applied to the new production D1 and independently verified by table listing, migration ledger, and `PRAGMA foreign_key_check`. The Pages project's production DB binding was updated to the new UUID. The currently deployed Pages version is still the older deployment until a new production deployment is made. Authentication against the new production DB has not yet been smoke-tested.

A healthy `/api/health` response alone does not prove database or authentication readiness.

## 4. Provider integration target

Keep all integrations server-side behind typed adapters and a common provider registry. Provider calls must be explicit user actions, never page-load side effects.

### Initial provider stack

| Provider | Required capability | Readiness requirement |
|---|---|---|
| Groq | Generate structured content drafts and variants | Official API endpoint/model schema verified; credential tested; usage metadata and limits captured |
| Tavily | Discover research sources and candidate evidence | Official Search API verified; provenance stored; results remain unreviewed leads |
| Apify | Run selected data extraction Actors | Actor allowlist, schema validation, source/terms review, input limits, explicit per-run approval and credit visibility |
| Scrape.ly | Scraping/search extraction adapter | Do not enable until official endpoint, auth scheme, response schema, limits, terms and pricing are verified |

### Additional provider candidates

Evaluate only when a concrete product requirement exists:
- Official marketplace/affiliate APIs and partner feeds
- Official social analytics/publishing APIs
- Pexels/Pixabay or other licensed stock media sources
- ElevenLabs or equivalent voice generation
- Image/video generation providers
- Transcription/subtitle providers
- Cloudflare R2 for private assets and delivery

For each provider, document official docs URL, eligibility, auth scopes, data sent, rights/commercial terms, price/free allowance, rate limits, retention/deletion, timeout behavior, and fallback. If any critical fact is unknown, leave the provider disabled.

### Mandatory adapter controls

- Secret presence = `configured_unverified`, never `verified`.
- Secrets only in Cloudflare secret storage or untracked local environment files.
- No secrets in chat, GitHub, browser code, D1, exports, or logs.
- Per-provider kill switch and global kill switch.
- Timeout, bounded retry only for safe/idempotent calls, request/response schema validation, output size bounds, redacted errors, correlation IDs and audit records.
- Provider/Actor/model identity and credit/cost uncertainty shown before execution.
- A boolean confirmation flag is not a spend cap. Batch or unattended actions remain disabled until enforceable quotas/budgets exist.
- Retrieved pages, actor output and model output are untrusted. Resist prompt injection and unsafe HTML.
- Provider outages must not block manual intake, evidence, scorecards, template content generation, approval, or manual publishing.

## 5. Affiliate OS production-readiness checklist

- [ ] Auth and session flow proven on remote preview D1
- [ ] Workspace isolation verified against all affiliate resources
- [ ] Product/channel CRUD, deduplication, archive and search verified
- [ ] Evidence association and evidence-state transitions verified
- [ ] Six-dimension scorecard, rationale, weighted score and history verified
- [ ] 15/30/60-second content packages verified in Content Studio
- [ ] Version hash and destination approval invalidation verified
- [ ] Affiliate tracking URL remains private and excluded from export
- [ ] Manual publication experiment and observations verified
- [ ] Export and workspace deletion include affiliate records
- [ ] Provider status/kill switches and mock contract tests verified
- [ ] Browser walkthrough on desktop/mobile with zero blocking console errors
- [ ] Accessibility, empty/loading/error states and Indonesian copy reviewed
- [ ] Backup, recovery, rollback and data-retention behavior documented
- [ ] Actual local verification outputs recorded
- [ ] Production deployment uses reviewed `main` commit and exact D1 binding

## 6. Final handoff format

Report:
1. Exact branch and commit SHA
2. Files changed and why
3. Actual commands run and their raw pass/fail counts
4. Preview D1 migration state
5. Auth/workspace smoke evidence
6. Provider status by provider: not configured / configured-unverified / verified / disabled
7. Known limitations and remaining roadmap
8. Exact production changes still pending owner approval
9. Estimated cost exposure; state zero only when no billable action occurred

Do not call the system production-ready merely because the local test suite passes. Production-ready means the remote preview, authentication, data boundaries, provider safeguards, manual operating workflow and release/rollback procedures have all been demonstrated.
