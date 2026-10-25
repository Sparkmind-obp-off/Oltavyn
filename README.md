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

## Decisions still to make

- First target user and niche for validation.
- First workflow and success metric.
- Supported research sources and their access method.
- Initial publishing channels and available permissions.
- Technical stack, hosting, database, authentication, and model providers.
- Privacy, retention, and workspace/account boundaries.
- Brand domain and deployment plan.

These decisions should be documented before implementation. Choose the simplest stack that satisfies the validated workflow and the owner's cost constraints.

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
