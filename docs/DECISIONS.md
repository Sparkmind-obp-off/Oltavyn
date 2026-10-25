# OLTAVYN — Architecture Decision Register

Record decisions here as **proposed**, **accepted**, **superseded** or **rejected**. A proposal is not proof that a feature exists.

## ADR-001 — Product loop
**Status:** Accepted baseline. Core loop is Research → Opportunity → Content → Publishing → Learning. Rationale: ties generation to evidence and observed outcomes.

## ADR-002 — First validation market
**Status:** Proposed. Use a solo creator/small commerce operator; affiliate commerce may be the first proving ground. Rationale: concrete workflow, while keeping the core platform-neutral. Validate with evidence before committing to a narrow niche.

## ADR-003 — Manual publishing first
**Status:** Accepted baseline. MVP logs publication manually; integrations come after permissions and user value are verified. Rationale: lower risk and faster end-to-end validation.

## ADR-004 — Modular monolith
**Status:** Proposed. One web app/API with domain modules and provider adapters; no microservices initially. Revisit only when measured constraints require it.

## ADR-005 — Hosting/database
**Status:** Accepted for MVP (2026-10-25). Cloudflare Pages (Worker via Hono) + Cloudflare D1 (SQLite), deployed to the owner's own Cloudflare account (BYOK, project `oltavyn`, DB `oltavyn-production`).
- **Verified:** relational schema with FKs and versioned migrations (`migrations/`), applied on a clean local DB and on the remote DB; 44-check API smoke test passes locally and against production.
- **Consequences:** Workers runtime (no Node fs/child_process); D1 free-tier limits apply. D1 Time Travel provides point-in-time restore (provider default retention, up to 30 days on paid / 7 days on free — verify in dashboard); OLTAVYN does not yet run its own scheduled backups. Revisit if write volume, row size, or multi-region needs exceed D1.
- **Cost:** Free tier at time of deploy; no paid service started.

## ADR-006 — Authentication
**Status:** Accepted for MVP (2026-10-25), revisit before broader launch. Platform-native email + password: PBKDF2-SHA256 (100k iterations — Workers maximum), random 256-bit session token in an HttpOnly, Secure, SameSite=Strict cookie; only its SHA-256 hash stored in `sessions`. 14-day expiry, server-side logout. CSRF: SameSite=Strict + JSON-only mutations + Origin check. Rate limits on register/login (D1 fixed window).
- **Not yet implemented:** email verification, password reset, MFA, account deletion self-service. Until password reset exists, a lost password means a lost account (owner can intervene via D1).
- **Alternative to consider:** an established provider (e.g. Clerk/Auth0) or Cloudflare Access once user volume or compliance needs justify it. No dev bypass exists in code.

## ADR-007 — Model provider
**Status:** Open (deliberately deferred). MVP uses a deterministic, evidence-grounded template generator (`src/lib/generator.ts`, `generator = template_v1`) that emits the same contract shape as a future model adapter (`title`, `body`, `claims[]` with evidence IDs/status). Rationale: zero cost, no data sent to third parties, no fabricated claims while the loop is validated. Adding a model requires: owner approval of provider/cost ceiling, API key stored via `wrangler pages secret put`, server-side schema validation of output, and rejection of unknown evidence IDs (already enforced for manual claims).

## ADR-008 — Human approval
**Status:** Accepted baseline. Exact asset version and destination must be approved before any external publishing or consequential action.

## ADR-009 — Evidence integrity
**Status:** Accepted baseline. Recommendations must reference inspectable evidence or be explicitly marked as hypotheses; observed metrics must be distinguished from estimates.

## ADR-010 — CI/CD
**Status:** Accepted (2026-10-25). No GitHub Actions. Manual, verified workflow run from the dev sandbox: `npm run typecheck` → `npm run build` → local `wrangler pages dev` + `npm run test:smoke` → `npm run db:migrate:prod` (if new migrations) → `npm run deploy` → `BASE_URL=<prod> npm run test:smoke`. Lint and unit-test runners are not yet set up (gap).

## ADR-011 — Approval binding
**Status:** Accepted (2026-10-25). Content versions are immutable and carry a SHA-256 of the body. Approval requires the client to echo that hash, targets only the current version, and requires an explicit destination. Editing creates a new version and resets status to draft. Experiments can only be created from a version with a matching approved hash.

## ADR-012 — Missing data vs zero
**Status:** Accepted (2026-10-25). Observations have `value_status` (observed / not_yet_available / not_collected / failed). Non-observed rows always store `numeric_value = NULL`; observed rows require value, unit, and observation window. Learning summary compares only same metric+unit and never infers absent values.

## ADR-013 — Workspace deletion policy
**Status:** Accepted (2026-10-25). Hard delete of the workspace and all children after typed-name confirmation. A minimal audit row (action, ids, timestamp, no content) is kept. Data may persist in D1 Time Travel backups for the provider retention window. Export (JSON) is available any time before deletion.

## ADR-014 — Frontend
**Status:** Accepted (2026-10-25). Dependency-free vanilla JS SPA served from `/static`, strict CSP (`script-src 'self'`), all dynamic text HTML-escaped. Indonesian UI by default. No third-party trackers; only Google Fonts CSS is loaded externally.

## Change process
For each decision include context, options considered, decision, consequences, verification evidence and date. Update related documents when a decision changes.