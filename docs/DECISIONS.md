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
**Status:** Open. Candidate: Cloudflare Pages/Workers + D1, subject to verification of auth, relational needs, migration workflow, backup/restore, limits and operational requirements. No provider choice should be represented as implemented until configured and tested.

## ADR-006 — Authentication
**Status:** Open. Choose an established auth provider or robust platform-native mechanism after confirming deployment target and production configuration. No production development bypasses.

## ADR-007 — Model provider
**Status:** Open. Use a server-side provider adapter with structured outputs, bounded cost and a replaceable implementation. Choose based on quality, terms, latency, cost and data handling.

## ADR-008 — Human approval
**Status:** Accepted baseline. Exact asset version and destination must be approved before any external publishing or consequential action.

## ADR-009 — Evidence integrity
**Status:** Accepted baseline. Recommendations must reference inspectable evidence or be explicitly marked as hypotheses; observed metrics must be distinguished from estimates.

## ADR-010 — CI/CD
**Status:** Proposed. Do not assume GitHub Actions. Use a verified deployment/test workflow appropriate to the selected host; document how tests and production smoke checks are run.

## Change process
For each decision include context, options considered, decision, consequences, verification evidence and date. Update related documents when a decision changes.