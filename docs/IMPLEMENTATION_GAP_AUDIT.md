> **Historical audit notice (2026-11-12):** This document was written against branch `feat/faceless-affiliate-factory-phase1` and is retained as historical context only. It is not the current main-branch audit. Use [`docs/MASTER_GAP_REGISTER.md`](./MASTER_GAP_REGISTER.md) for the refreshed main baseline and [`docs/PRODUCT_CONCEPT_AND_DECISIONS.md`](./PRODUCT_CONCEPT_AND_DECISIONS.md) for canonical product decisions. The current main branch has since added commercial/payment/admin modules, Clerk identity mapping, Agent tool-calling foundations, Preview/Production D1 separation in Wrangler, Duitku Production-only validation and payment reconciliation/tests. Do not carry forward stale statuses from this file without rechecking current source.

# OLTAVYN implementation gap audit

Date: 2026-11-11  
Branch under review: `feat/faceless-affiliate-factory-phase1`  
Scope: OLTAVYN Core Engine and Affiliate OS feature branch

> This is a repository-inspection baseline, not a claim that all functionality has passed runtime tests. Update each status only after collecting evidence.

## Known implementation baseline

| Area | Repository evidence | Status |
|---|---|---|
| Core content workflow | Existing routes, D1 schema, smoke test and README describe workspace/evidence/opportunity/content/approval/experiment/learning | IMPLEMENTED_NOT_VERIFIED on current feature commit |
| Affiliate schema | `migrations/0002_affiliate_factory.sql` | IMPLEMENTED_NOT_VERIFIED |
| Affiliate API/workbench | `src/routes/affiliate.ts`, `public/static/affiliate.js`, route mount in `src/index.tsx` | IMPLEMENTED_NOT_VERIFIED |
| Provider adapters | Groq, Tavily, Apify, Scrape.ly documented and implemented in affiliate route | IMPLEMENTED_NOT_VERIFIED |
| Workspace isolation | Existing tests cover core isolation; affiliate-specific coverage must be confirmed/extended | BLOCKED pending test run |
| CI workflow | `.github/workflows/verify.yml` exists; no successful run has been evidenced in this audit | IMPLEMENTED_NOT_VERIFIED |
| Production migration/deployment | No production action authorized/performed for this feature branch | NOT_APPLICABLE to this verification pass |

## Required gap closure

| Requirement | Evidence to collect | Severity if missing | Status |
|---|---|---|---|
| Clean install and typecheck | `npm ci`, `npm run typecheck` output | High | BLOCKED pending execution |
| Production build | `npm run build` output | High | BLOCKED pending execution |
| Clean D1 migration chain | Local D1 apply output for 0001 and 0002 | Critical | BLOCKED pending execution |
| Affiliate API smoke tests | Product/channel/evidence/scorecard test results | High | BLOCKED pending execution |
| Cross-workspace authorization | Negative tests for every affiliate resource | Critical | BLOCKED pending execution |
| Provider contract tests | Mocked tests, no external spend | High | PROPOSED |
| Secret redaction | Test logs/errors/browser payloads | Critical | PROPOSED |
| UI walkthrough | Browser evidence for empty, loading, error, success states | Medium | BLOCKED pending execution |
| Production readiness | CI, migration, security, rollback, owner approval | Critical | BLOCKED |

## Known limitations from current docs

- Provider secret presence is not credential validation.
- No real provider credentials or external API requests are verified.
- Apify/Scrape.ly Actor runs can consume credits; confirmation flag is not a budget cap.
- Affiliate scorecard editing and evidence-link management are not complete in the first UI slice.
- Automatic Shopee ingestion, affiliate-link generation and auto-publishing are not implemented.
- Production migration and deployment are separate owner-approved release actions.

## Audit update protocol

For every row, record commit SHA, command/test, timestamp, result and evidence link. Never change a status to VERIFIED based only on code inspection or a successful GitHub push.

## Update 2026-11-11 (Phase 3)

All "BLOCKED pending execution" rows above were executed locally: typecheck pass, build pass, clean migration 0001→0003 pass, core smoke 44/44, affiliate smoke + isolation 65/65, provider mock tests 29/29, browser console 0 errors. Details and remaining gaps: `docs/affiliate-factory/IMPLEMENTATION_REPORT.md`. Provider credentials remain unconfigured and unvalidated.

## Update 2026-11-12 (Production Google auth incident)
* CLOSED (code + deployed `965458c`): RC-1 provider id `oauth_google`; RC-2 Clerk prebuilt hash-routing broke OAuth sign-up transfer (now headless flow + `/sso-callback` path); RC-3 silent `/api/auth/me` failures; RC-4 CSP blocked Clerk Protect; RC-5 callback fallback to Account Portal. See `PRODUCTION_AUTH_ROOT_CAUSE_REPORT.md`.
* OPEN — owner action: real browser Google login acceptance test; confirm Google Cloud redirect URI & consent-screen publishing status; read Clerk Dashboard `oauth_callback` events for the 16:14 WIB attempt.
* OPEN — security: credentials were pasted in chat on 2026-11-12 (Clerk secret keys, Apify, Scrapely, Duitku, Tavily) → rotate, then update Pages secrets.
* OPEN — unchanged: Duitku POP `Merchant Not Found` (provider action), R2 private storage, CF Web Analytics beacon blocked by CSP (cosmetic).
