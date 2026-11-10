# OLTAVYN — Faceless Affiliate Content Factory

Status: Phase 1 foundation specification  
Operating model: hybrid OS + internal-first  
First validation use case: Shopee Affiliate Indonesia  
Cost policy: Rp0-first; no paid provider, paid actor, paid API, or production deployment without explicit owner approval.

## Product boundary

OLTAVYN remains a platform-neutral Agentic Content OS. The Faceless Affiliate Content Factory is its first focused operating mode, not a separate application or public brand.

The system supports two co-equal outcomes:
1. **Affiliate operation:** use the system internally to research products, prepare faceless content, publish manually after approval, and learn from real results.
2. **Factory development:** improve reusable workflows and provider adapters based on the internal operating evidence.

No public multi-tenant SaaS, autonomous publishing, paid scraping, or paid AI generation is in Phase 1.

## Existing capabilities to reuse

The current OLTAVYN MVP already provides workspaces, evidence ledger, opportunities, versioned content assets, approval gates, manual publishing experiments, observations, learning summaries, audit events, and JSON export/delete. Do not duplicate these domains.

## Phase sequence

| Phase | Outcome | Gate |
|---|---|---|
| 1. Foundation | Affiliate channel/product schema, scoring rubric, evidence and workflow contract | Migration applies locally; constraints and ownership are verified |
| 2. Product intelligence | Manual/import-first product intake and transparent scoring UI | At least 10 products have traceable evidence |
| 3. Content factory | Product-to-brief/script/storyboard pipeline using existing content studio | Human-reviewed content pack for selected products |
| 4. Affiliate pilot | Manual link creation and publishing log across selected channels | Real publication and observations recorded |
| 5. Learning and scale | Compare outcomes, refine scores, then consider permitted automation | Real results justify next investment |

## Non-negotiable guardrails

- No fabricated demand, sold counts, ratings, commission rates, or product experience.
- Each material product claim must have a source/evidence record or be marked unverified.
- Keep observed values separate from estimates and hypotheses.
- No scraping behind login, private endpoints, access controls, rate limits, or platform restrictions.
- Use official exports, permitted public observations, or authorized APIs. Verify each source's current terms before use.
- Do not save Shopee passwords, cookies, OTPs, session tokens, or account credentials in OLTAVYN.
- Affiliate links and publishing remain manual and approval-gated in the pilot.
- Never claim that a video demonstrates first-hand use unless it genuinely does.
- Clearly disclose affiliate relationships where required by platform rules and applicable law.
- Do not use paid services or consume paid credits without explicit owner approval.

## Phase 1 implementation

Migration: `migrations/0002_affiliate_factory.sql`

New tables:
- `affiliate_channels`
- `affiliate_products`
- `affiliate_product_evidence`
- `affiliate_product_scorecards`
- `affiliate_experiment_products`

Existing OLTAVYN tables remain the source of truth for evidence, content, approvals, experiments, observations, users, and workspaces.

## Phase 1 is not complete until

1. The migration has been applied to a clean local D1 database.
2. Foreign keys, unique constraints, and check constraints pass tests.
3. Workspace ownership is enforced by every API query that uses these records.
4. No production migration or deployment has occurred without owner approval.
5. The first product records are entered from permitted, inspectable evidence.
