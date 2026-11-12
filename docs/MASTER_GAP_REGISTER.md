# OLTAVYN — Master Gap Register (cross-stack)

**Date:** 2026-11-12  
**Repository:** Sparkmind-obp-off/Oltavyn  
**Branch:** main  
**Baseline inspected:** main after commits `a2f1fd0`, `facbbc7`, `e4edc5a`, `fa0daaa`, `978e3e9` (confirm latest SHA before execution).  
**Scope:** product concept, frontend, backend, D1, Agent, provider integrations, Duitku POP, Clerk, commercial operations, admin, Cloudflare and release readiness.

> This is a source-inspection gap register, not a claim that runtime tests or live integrations passed. Status must be changed only with reproducible evidence.

## 1. Product contract

OLTAVYN is one Full Agentic Affiliate OS. Core is the canonical system of record; one central Agent orchestrates typed and approved tools; Commercial, customer workspace, provider integrations and Admin are layers of the same product. The operating loop is Discover → Verify → Decide → Plan → Produce → Review → Publish (human-controlled) → Measure → Learn.

Guardrails: no secrets in Git or chat; no paid provider call without explicit approval and real cost control; no unsupported scraping; no automatic publishing; no fabricated metrics; no production migration/deploy or live charge without separate authorization.

## 2. Findings from current source inspection

| Area | Finding | Severity | Status |
|---|---|---:|---|
| D1 environment isolation | `wrangler.jsonc` base D1 and `env.production` point to the same production database ID; no distinct Preview D1 binding is defined in inspected config. | Critical | BLOCKED_EXTERNAL_CONFIGURATION |
| Agent tool coverage | Active Agent exposes only four read-only tools: workspace summary, products list, channels list, evidence list. | High | PARTIAL |
| Agent writes | `content.create_draft` exists in registry but is disabled; no active approval-backed write executor was evidenced. | High | NOT_IMPLEMENTED |
| Agent paid execution | Actor tool is disabled in Agent registry. Provider Actor endpoints exist separately; they are not proof of Agent approval orchestration. | High | PARTIAL |
| Publishing | Publication tool is disabled; no authorized publishing integration is evidenced. Manual publishing remains the intended pilot path. | Medium | NOT_IN_SCOPE for pilot |
| Provider cost accounting | Provider usage endpoint counts audit events; source explicitly returns `cost_tracking: unavailable`. No verified monetary budget reservation/reconciliation is evidenced. | High | NOT_IMPLEMENTED |
| Provider health | Provider status is based on secret presence and enable flags; this is not a live credential/health check. | Medium | IMPLEMENTED_NOT_VERIFIED |
| Duitku endpoint default | `src/routes/commercial.ts` defaults `DUITKU_BASE_URL` to Sandbox. This conflicts with the owner's explicit Production target and must be changed to fail closed or explicit Production only. | Critical | NOT_IMPLEMENTED |
| Duitku production config | Code accepts Sandbox and Production base URLs; production merchant credentials, callback reachability and production payment host have not been verified. | Critical | BLOCKED_EXTERNAL_CONFIGURATION |
| Payment activation | Checkout requires `DUITKU_CHECKOUT_ENABLED=true`; keep false until Production checks and owner release approval. | Critical | BLOCKED_EXTERNAL_CONFIGURATION |
| Payment lifecycle | Callback verifies signature, merchant, amount, merchant order ID and reference; callback/event replay, concurrent callback, late failure-after-success, reconciliation and refund paths require tests and potentially hardening. | Critical | IMPLEMENTED_NOT_VERIFIED |
| Commercial catalog | Catalog and order snapshots are server-owned; catalog currently requires auth per route comment. Public vs authenticated discovery journey needs product/UI validation. | Medium | IMPLEMENTED_NOT_VERIFIED |
| Entitlement/job creation | Callback creates entitlement/job; unique constraints and atomic/concurrent behavior need D1 integration tests. | Critical | IMPLEMENTED_NOT_VERIFIED |
| Clerk Google-only | Server verification and Google provider checks exist; Clerk Dashboard settings, real OAuth, key rotation and full session lifecycle remain external/unverified. | High | BLOCKED_EXTERNAL_CONFIGURATION |
| Admin access | Server-side email allowlist exists; Cloudflare Access and production allowlist configuration are not verified. | High | BLOCKED_EXTERNAL_CONFIGURATION |
| Service delivery | Jobs, customer deliverables and revisions exist; private R2 delivery, access expiry, revision counting semantics and fulfillment SOP require validation. | High | PARTIAL |
| Privacy/legal | Privacy/Terms draft status and support/retention/deletion controls require release review. | High | BLOCKED_EXTERNAL_CONFIGURATION |
| Runtime validation | Clean install, typecheck, build, local D1 migrations, all tests, browser walkthrough not run in this audit session. | Critical | BLOCKED_EXTERNAL_CONFIGURATION |
| Deployment | No Pages Preview or Production deployment verified in this pass. | Critical | NOT_VERIFIED |

## 3. Audit areas requiring repository-wide execution

The implementation agent must inspect and verify, not assume:
- Frontend: every screen, navigation, responsive state, forms, loading/error/empty/success, dead controls, accessibility, escaping/XSS and customer-facing scope.
- Backend: all routes, middleware order, auth, CSRF/origin, ownership/tenant isolation, input validation, rate limits, error leakage, audit and idempotency.
- D1: all migrations, actual clean schema, indexes, constraints, migration order, concurrent writes, deletion/export, Preview/Production separation.
- Agent: planner, typed registry, read tools, write tools, approval UX, paid tools, step ledger, retries, cancellation, resumability, verifier and traceability.
- Affiliate lifecycle: workspace → research → evidence → candidates → scorecards → selection → brief → scripts/storyboard → compliance → manual publish → metrics → learning.
- Providers: Groq/Tavily/Apify/Scrape.ly configuration, credential validation, quota, cost reservations, allowlists, terms, output validation, timeouts, kill switch and audit.
- Duitku POP Production: endpoint, secrets, callback, signature, host allowlist, idempotency, status reconciliation, duplicate/late events, admin reconciliation, checkout activation gate.
- Clerk: Google-only Dashboard, issuer/audience/azp, expiry, linking, logout, disabled accounts, origin separation and key rotation.
- Commercial/Admin: catalog, checkout, entitlement, jobs, deliverables, revisions, refunds/cancellations, access controls, audit and support.
- Cloudflare: Pages, D1, R2, secrets, preview isolation, routing, domains, caching, logs, backup, rollback and deployment.

## 4. Priority execution plan

### P0 — Financial and data safety
1. Remove Sandbox default. Configure Duitku Production endpoint explicitly; fail closed if Production URL/credentials are absent or invalid.
2. Keep checkout disabled until release gate and owner activation.
3. Harden payment state transitions and callback idempotency/concurrency; add tests for duplicate, late and out-of-order events.
4. Separate Preview D1 from Production with a real database ID supplied by the Cloudflare account owner; never invent one.
5. Verify every tenant and admin boundary with negative tests.

### P1 — Runtime confidence
1. Obtain repository checkout in an execution environment.
2. Run clean install, typecheck, build, local migrations, all automated tests.
3. Fix failures and add regression coverage.
4. Perform browser walkthrough for customer, affiliate and admin journeys.
5. Record exact commit SHA and test output.

### P2 — Agentic completeness
1. Implement typed draft/write executors with preview → explicit approval → revalidation → save.
2. Add approval request records, immutable action hash, expiry and audit.
3. Extend read tools across the full affiliate lifecycle.
4. Add run/step state machine, idempotency, cancellation and resumability.
5. Keep paid Actor execution gated until cost reservation and reconciliation are real.

### P3 — Provider and fulfillment readiness
1. Add provider live health probes without leaking secrets.
2. Add hard quotas and monetary/token usage ledger where provider supports usage data.
3. Validate Actor allowlists, schemas, pricing, policy and output ingestion.
4. Verify private deliverable storage/access, revision counting and service SOP.
5. Complete privacy/terms/support/retention/deletion review.

### P4 — Release
1. Preview environment fully isolated and tested.
2. Production migrations planned with backup and rollback.
3. Clerk production OAuth and Duitku Production configured and verified.
4. Security review, operational runbook, monitoring and support readiness.
5. Explicit owner approval before production deployment or checkout activation.

## 5. Evidence and execution status

Not run in this inspection:
- `npm ci`
- `npm run typecheck`
- `npm run build`
- `npm run db:migrate:local`
- `npm run test:all`
- Browser walkthrough
- Cloudflare D1 Preview provisioning/migration
- Clerk live Google OAuth
- Duitku live invoice/payment/callback
- Production deployment

No real payment has been attempted. Do not interpret the Production target as permission to create a charge. Production secrets must remain in Cloudflare Worker secrets and must never be copied into GitHub/Genspark/chat.

## 6. Genspark execution handoff

Use `docs/GENSPARK_MASTER_EXECUTION_PROMPT.md` as the complete execution contract. Genspark must clone and inspect this repository, execute the audit and safe implementation work, commit verified changes to `main`, and report blockers. It must not switch to Duitku Sandbox or claim a live payment test without an actual owner-authorized transaction.
