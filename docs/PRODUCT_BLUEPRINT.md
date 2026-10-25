# OLTAVYN — Product Blueprint

**Status:** Working baseline v1.0 · **Date:** 2026-10-25

## Product thesis
OLTAVYN is an Agentic Content OS that helps a small creator/operator move from evidence about an audience to a tested content experiment, then use actual results to decide what to do next. It is more than a content generator: the product manages a repeatable loop of **Research → Opportunity → Content → Publishing → Learning**.

## Initial user hypothesis
Start with a solo creator or small commerce operator who needs to discover promising content/product angles and produce consistent content without a large team or budget. Affiliate commerce (including Shopee Affiliate where permitted) is a candidate proving ground, not a permanent platform constraint. This remains a hypothesis until tested with real users and evidence.

## User job
“When I have limited time and budget, help me find a defensible content opportunity, turn it into publishable material, track what actually happened, and learn what to test next—without making up demand or taking actions I have not approved.”

## Core workflow
1. Configure a workspace, intended audience, topic and allowed sources.
2. Gather evidence with source, timestamp, URL/reference and collection method.
3. Convert evidence into candidate opportunities with supporting signals and uncertainty.
4. Rank candidates using transparent criteria; let the user inspect evidence and reject weak candidates.
5. Generate a brief and content variants from an approved opportunity.
6. Review, edit and approve assets.
7. Publish manually first, or through a verified authorized integration with explicit approval.
8. Record publication URL, date, channel and observed metrics.
9. Compare experiments and recommend the next test, showing the evidence behind the recommendation.

## Product principles
- Evidence before assertions; label hypotheses and missing data.
- Human control for publishing, account changes, spending and external communications.
- No fake metrics, fabricated sources, guaranteed outcomes or stealth automation.
- Start with one end-to-end workflow; add complexity only after evidence.
- Keep core domain concepts platform-neutral; use adapters for sources/channels.
- Privacy, least privilege, cost awareness and auditability by default.

## MVP boundaries
**In:** one workspace; one manually configured niche/audience; evidence records; opportunity shortlist; content brief and variants; editable approval flow; manual publishing log; manual metric entry/import; basic experiment comparison; clear provenance.

**Out initially:** autonomous posting without approval, scraping that violates access rules, bulk account creation, DMs/comments at scale, paid ad spend, guaranteed affiliate income, complex team permissions, native mobile apps, broad analytics integrations, autonomous purchasing, and a sprawling agent marketplace.

## Success definition
A real user can complete one full loop using traceable evidence, approve an asset, publish it themselves or through a verified integration, record real results, and receive a grounded next-experiment recommendation. Product success is not measured by generated word count.

## Assumptions to validate
- The workflow saves meaningful time versus the user's current process.
- Evidence-backed opportunity selection is more valuable than content generation alone.
- Users will record outcomes if the workflow makes doing so easy.
- At least one source and one publishing destination can be used compliantly at acceptable cost.

## Open decisions
Target niche and first design partners; first evidence source; exact first publishing channel; success thresholds after baseline measurement; hosting and database choices after integration/security constraints are checked. Defaults are proposed in the technical documents and are reversible until implementation.