# OLTAVYN — Product Concept & Decisions

**Last reconciled:** 2026-11-12  
**Canonical repository:** https://github.com/Sparkmind-obp-off/Oltavyn  
**Canonical branch:** `main`

This document records the product direction already agreed in project discussions and reconciles it with the implementation. It is not permission to activate paid providers, live billing, or production deployment.

## 1. Product identity

**OLTAVYN is a Full Agentic Affiliate OS / Agentic Content OS.** It is a software operating system that helps an affiliate operator research physical products, assess evidence and suitability, plan and produce faceless content drafts, manage approvals and publishing handoff, record performance, and learn from results.

OLTAVYN is not:
- a generic chatbot that only writes text;
- a separate affiliate micro-app or second repository;
- a freelancer marketplace or a promise to hire creators;
- an autonomous social-media account operator;
- a guaranteed-sales or guaranteed-commission service;
- an in-house foundation model or a claim that OLTAVYN owns Groq/Tavily/Apify/Scrape.ly infrastructure;
- a video-generation engine unless an actual authorized generation integration is implemented and tested.

The product owns the canonical workspace, workflow, evidence, policies, artifacts, permissions, billing records and audit trail. Providers are replaceable capabilities behind adapters.

## 2. Initial market and operator workflow

Initial focus: Indonesia physical-product affiliate, beginning with Shopee Affiliate where the user's account eligibility and current program terms permit it. Intended content distribution includes TikTok, Shopee Video, Instagram, YouTube Shorts and Facebook. Platform eligibility and affiliate features vary by account and must be confirmed by the operator.

The primary workflow is:

**Discover → Verify → Decide → Plan → Produce → Review → Manual Publish → Measure → Learn**

1. Configure workspace niche, audience, goals, channel and constraints.
2. Discover products and market signals from permitted public sources, user-supplied URLs/data, authorized exports or APIs.
3. Verify price, commission, seller/product attributes, policy and demand claims with source/time/provenance. Unknown values remain unknown.
4. Score candidates with an explainable rubric; incomplete evidence must not be represented as a reliable score.
5. Select, shortlist or reject with rationale.
6. Create a content brief and experiment hypothesis.
7. Produce faceless-content hooks, scripts, storyboards, shot lists, captions, CTAs, hashtags, voiceover copy and production prompts where supported.
8. Review factual claims, affiliate disclosures, copyright and platform compliance.
9. Export a handoff/checklist; the operator manually publishes during the pilot.
10. Record actual published URL/time/version and source-tagged metrics.
11. Compare outcomes with the hypothesis and prepare the next experiment.

The AI Agent is the primary command interface, but structured application screens are the authoritative place to inspect and approve records. There is one central Agent/orchestrator, not a second chatbot or a collection of autonomous agents.

## 3. System layers — one product

- **OLTAVYN Core:** canonical D1 records, workspaces, users, products, evidence, scorecards, channels, content, experiments, observations, policies and audit.
- **OLTAVYN Agent:** plan, select typed tools, apply policy, ask for approval, execute, verify, and report exactly what happened.
- **OLTAVYN Content/Workbench:** structured research, product evaluation, content planning, drafts, versions, review and export.
- **OLTAVYN Commercial:** public package catalog, customer onboarding, orders, Duitku POP checkout, payment state, entitlements, service jobs, deliverables and revisions.
- **OLTAVYN Admin/Operations:** access-controlled command center, customer/order/payment/job/revision management, reconciliation and audit.
- **Provider adapters:** Groq for bounded LLM drafting/tool calling; Tavily for optional web search; Apify or Scrape.ly for separately approved, compliant Actors. These are not the source of truth.
- **Cloudflare infrastructure:** Pages/Workers, D1, and private R2 only when configured and tested. Queues/Workflows/DO are future architectural options, not assumed to exist.

## 4. Go-to-market model

Initial commercial path is a **productized Agentic Service** operated with OLTAVYN, with a later path to self-service Agentic SaaS. The same Core and Agent should support both; do not build separate product backends.

### Current one-time / managed-service catalog hypotheses

The current migration seeds these prices and scopes. Treat them as business hypotheses until the owner validates willingness to pay, fulfillment capacity and unit economics.

| Package | Seed price | Current intended scope |
|---|---:|---|
| Affiliate Starter | Rp99.000 one-time | Evaluate one product; three content ideas/scripts; captions, CTA, hashtags; production brief and claims needing verification |
| Campaign Builder | Rp299.000 one-time | Up to three product candidates; shortlist/rationale; ten content concepts/scripts; two-week calendar; storyboard/production brief; one revision |
| Affiliate Growth | Rp699.000/month | Four weekly content batches; periodic product evaluation; draft review/optimization; report based on available data |

Important: Affiliate Growth is currently a monthly service/catalog item but code documentation specifies manual renewal; no recurring automatic billing is claimed. Do not change it to recurring billing without a complete verified recurring-payment design.

Current package exclusions: no video production, no publishing, no guaranteed sales, no paid scraping, and no external provider cost unless separately scoped and approved. Never imply these exclusions are included.

### Later self-service SaaS pricing hypotheses

Potential tiers discussed: Free Rp0; Solo Rp49.000/month; Creator Rp99.000/month; Pro Rp199.000/month. These are not active billing entitlements. Free is an ongoing permanent entry tier, not a timed trial. No AI-run quota should be advertised as enforced until metering and quota enforcement exist.

## 5. Provider and cost policy

- Rp0-first and manual/free fallback.
- No new paid subscription, Actor, API credit purchase or provider execution without explicit owner approval.
- Never dual-run Apify and Scrape.ly by default.
- Actor discovery is separate from execution; inspect exact Actor ID, README, input schema, terms, pricing and data method before allowlisting.
- A per-run cap passed to a provider is not a complete OLTAVYN-wide budget system. A real app-side reservation, cumulative cap, usage reconciliation and hard stop are still required.
- Never scrape Shopee or another platform using a method that violates applicable terms. Do not infer that a public page means automated extraction is permitted.
- No cookies, OTPs, account passwords, browser sessions or platform credentials are collected.
- No automatic publishing in the pilot. User manually publishes and confirms the URL/time.

## 6. Agent permission model

- R0: bounded read-only workspace data.
- R1: approved read-only research.
- W1: draft/write after preview and explicit save confirmation.
- W2: operational mutation after exact action confirmation.
- P1: paid provider/Actor execution after verified policy, cost and per-run approval.
- P2: publication or other external side effect; disabled for pilot.

The model may request a tool but cannot grant itself permission. Tool schemas, authorization, workspace scoping, spend controls, approvals and idempotency belong to server code. External content is untrusted.

## 7. Payments and launch safety

Duitku POP is the intended initial payment gateway. OLTAVYN's code is Production-only: `https://api-prod.duitku.com`; Sandbox is rejected. Merchant credentials remain Cloudflare Worker secrets. Checkout remains disabled until production configuration, callback verification, payment idempotency, reconciliation, customer/admin flows, terms/support and owner release approval are complete.

No real financial transaction is a test. A production charge/refund/payout requires separate explicit authorization. Browser return URLs never establish payment success; only verified callback/reconciliation does.

## 8. Current implementation truth (reconcile against latest main)

Present in source at the time of this reconciliation:
- Hono/Cloudflare Pages application and D1-backed core/affiliate modules.
- Product candidates, evidence relationships, scorecards, channels, experiments and affiliate workbench.
- Groq bounded generation/tool-calling loop and persisted Agent run/step traces.
- Agent registry has four enabled read-only tools; draft-save, paid Actor and publication tools remain disabled.
- Provider adapters for Groq, Tavily, Apify and Scrape.ly; Actor allowlists and provider-supplied per-run caps exist. Application-wide monetary reservation/reconciliation does not.
- Commercial catalog/orders/checkout/payment callback/entitlement/service job/customer deliverables/revisions and Admin command center.
- Duitku Production-only endpoint guard and payment Check Transaction reconciliation implementation; payment tests exist but must be executed in the target runtime.
- Clerk Google-only identity mapping and Cloudflare Access verification code; actual dashboard/account configuration and live login remain unverified.
- Separate Preview and Production D1 IDs are now present in Wrangler config; actual Cloudflare resources, Pages environment bindings and remote migration state still require verification.

Not yet proven to be production-ready:
- full Agentic write/approval/execute loop;
- complete Discover-to-Learn workflow with robust attribution and compliance enforcement;
- true app-wide provider spend metering;
- private R2 deliverable delivery;
- refunds/reversals, complete customer support and legal/retention workflows;
- successful clean install/typecheck/build/full test/browser run in the latest environment;
- live Clerk OAuth, Duitku production merchant verification and deployed Pages runtime.

## 9. Decision rule

When code and this concept document disagree, do not silently change the product. Record the mismatch in `docs/MASTER_GAP_REGISTER.md`, preserve safety constraints, and ask only if a genuine product decision is required. Never label a feature complete without an end-to-end test and evidence.
