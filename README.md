# OLTAVYN

**Working product definition:** Agentic Content OS

OLTAVYN is being designed as a practical workspace that helps a user move through the content-growth loop:

**Research → Opportunity → Content → Publishing → Learning**

The first validation use case may focus on discovering and testing content/product opportunities for affiliate commerce, including Shopee Affiliate where access and platform rules permit. The architecture and product direction must not lock OLTAVYN to one marketplace or one social platform.

## Product principles

- **Evidence before assumptions:** distinguish observed evidence, estimates, hypotheses, and unknowns. Never fabricate demand, metrics, or results.
- **Human control:** users approve consequential actions such as publishing, account changes, spending, and external communications. Automate only where authorized and supported.
- **Platform-compliant:** use official APIs or explicitly authorized integrations; respect platform terms, permissions, rate limits, and user consent.
- **Proof before complexity:** validate a small end-to-end workflow before building a large platform.
- **Cost-aware:** prefer a low-cost/free-tier prototype where practical; disclose when a feature requires paid access or credentials.
- **Security by default:** do not commit secrets, access tokens, cookies, OTPs, or personal account data to the repository.
- **Reusable core:** keep core workflows modular so new niches, commerce sources, and publishing channels can be added later.

## Initial workflow

1. **Research** — collect permitted evidence about audience questions, content trends, products, and market needs.
2. **Opportunity** — organize findings into candidate opportunities with source links, evidence strength, fit, and validation steps.
3. **Content** — turn a selected opportunity into a brief, content variants, creative assets, and a review checklist.
4. **Publishing** — prepare channel-specific publishing packages; publishing itself remains approval-gated and depends on supported authorized access.
5. **Learning** — record available performance data, compare outcomes, and recommend the next experiment without inventing missing metrics.

## MVP guardrails

The first MVP should prove one useful loop end to end, rather than attempting full autonomous multi-account management immediately.

A candidate first test is: research one niche → shortlist evidence-backed opportunities → draft a small batch of content → obtain human approval → publish manually or through a supported authorized integration → record real results → recommend the next test.

Do not assume any API, account connection, domain, hosting provider, database, AI model, or paid service is configured until verified.

## Implementation status (2026-10-25)

| Item | Status |
|---|---|
| MVP end-to-end loop (workspace → evidence → opportunity → content → approval → experiment → observation → learning → export/delete) | **Implemented & tested** (automated smoke test, 44 checks; headless-browser UI walkthrough) |
| Production deployment | See *URLs* below — verified by running the smoke test against production |
| Market / user validation | **Not validated.** No real operator has completed a loop yet |

### URLs
- **Production:** https://oltavyn.pages.dev
- **GitHub:** https://github.com/Sparkmind-obp-off/Oltavyn
- **Health check:** `GET /api/health`

### Stack (see `docs/DECISIONS.md`)
Hono on Cloudflare Pages (Workers runtime) · Cloudflare D1 (SQLite) · vanilla JS SPA with strict CSP · Indonesian UI. Deployed to the owner's own Cloudflare account (BYOK). Free tier; no paid services started.

### Features implemented
- **Auth:** email/password (PBKDF2-SHA256), HttpOnly SameSite=Strict session cookie (hashed in DB), rate-limited login/register, CSRF guard.
- **Workspaces:** topic/niche, audience, goal, allowed sources; per-user isolation enforced server-side on every route.
- **Research:** evidence ledger with source URL/reference (required), observed/captured timestamps, collection method, source excerpt kept separate from our interpretation, reliability notes, limitations, archive.
- **Opportunities:** link evidence as supports / challenges / context; automatically flagged **hypothesis** when no supporting evidence; editable 1–5 factor scores (no hidden total); accept/reject.
- **Content Studio:** deterministic evidence-grounded draft generator (`template_v1`, no external AI); immutable versions with SHA-256; claim→evidence map (server refuses "supported" without evidence and rejects foreign evidence IDs); approval bound to exact version + hash + destination; Markdown download.
- **Experiments:** manual publication log (published requires URL; not published requires reason); observations with value status (observed / not yet available / not collected / failed), unit, window, origin. Missing data is stored as NULL, never zero.
- **Learning:** deterministic summary from recorded data only; same-metric+unit comparisons; next test with reasoning, cited record IDs, and uncertainty.
- **Overview:** real counts, next action, WELL (7-day completed loops + share with observed results).
- **Settings:** edit workspace, JSON export, hard delete with typed confirmation.
- **Audit log** of key actions (no content or secrets).

### API (all under `/api`, JSON, session cookie required except auth/health)
`POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
`GET|POST /workspaces` · `GET|PATCH|DELETE /workspaces/:id` (`DELETE ?confirm=<name>`) · `GET /workspaces/:id/overview`
`GET|POST /workspaces/:id/evidence` · `GET|PATCH /evidence/:id`
`GET|POST /workspaces/:id/opportunities` · `GET|PATCH /opportunities/:id` · `POST /opportunities/:id/generate-brief`
`GET /workspaces/:id/assets` · `GET /assets/:id` · `POST /assets/:id/versions` · `POST /assets/:id/submit-review` · `POST /asset-versions/:id/approval`
`GET|POST /workspaces/:id/experiments` · `GET|PATCH /experiments/:id` · `POST /experiments/:id/observations`
`GET /workspaces/:id/learning-summary` · `GET /workspaces/:id/export`

### Data model
See `migrations/0001_initial_schema.sql`: users, sessions, workspaces, evidence_items, opportunities, opportunity_evidence, content_assets, content_versions, approvals, experiments, observations, audit_events, rate_limits.

### Not yet implemented / known gaps
- Password reset, email verification, MFA, self-service account deletion.
- AI model provider (ADR-007 open; needs owner approval + cost ceiling).
- Any publishing integration (manual by design for MVP).
- Lint + unit-test runner; accessibility audit with assistive tech; automated backups beyond D1 Time Travel.
- Team/multi-member workspaces.

### Recommended next steps
1. Run one **real** loop with a real operator and real evidence; record which evidence informed the decision (first validation gate).
2. Add password reset (needs an email provider — owner decision on vendor/cost).
3. Decide ADR-007 (model provider) only if the template draft proves insufficient in real use.
4. Add lint/unit tests and an accessibility pass.

### Development & release workflow
```bash
npm install
npm run db:migrate:local          # clean local D1
npm run build && pm2 start ecosystem.config.cjs
npm run test:smoke                # BASE_URL defaults to http://localhost:3000
# release
npm run typecheck && npm run build
npm run db:migrate:prod           # only when new migrations exist
npm run deploy
BASE_URL=https://oltavyn.pages.dev npm run test:smoke
```
The smoke test creates throwaway `@test.local` users and deletes their workspaces at the end; remove the user rows with `scripts/cleanup-test-data.sql`.

### Deployment record
| Date | Commit | Target | Verification |
|---|---|---|---|
| 2026-10-25 | `41b9892` | Cloudflare Pages `oltavyn` (main) + D1 `oltavyn-production`, owner's account (BYOK) | `/api/health` 200; smoke test 44/44 against https://oltavyn.pages.dev; headless-browser full-loop UI walkthrough with zero console errors; test data removed afterwards (0 users, 0 workspaces). Cost: Cloudflare free tier, $0 incurred. |

## Project stages

1. **Definition** — clarify the user, problem, workflow, boundaries, and measurable outcome.
2. **Evidence plan** — define permitted data sources and how claims are verified.
3. **MVP design** — define screens, data model, integrations, security, and acceptance criteria.
4. **Build** — implement the smallest end-to-end workflow.
5. **Validate** — test with real permitted data and record failures and actual outcomes.
6. **Expand** — add integrations and automation only when evidence justifies them.

## Working agreement

- The owner makes final product decisions.
- The assistant may recommend and execute technical choices within the agreed scope, but must report material assumptions and blockers.
- Do not claim a feature is live, tested, connected, or successful without verifiable evidence.
- Keep decisions and implementation notes in this repository so the project can be resumed consistently.
