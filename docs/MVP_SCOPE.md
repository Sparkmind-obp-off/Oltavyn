# OLTAVYN — MVP Scope & Acceptance Criteria

## MVP objective
Prove that a user can move from real, traceable evidence to a reviewed content experiment and a grounded next decision.

## Must-have capabilities
1. **Workspace setup:** niche/topic, audience, goal, preferred language, allowed sources.
2. **Evidence ledger:** create/edit/archive evidence; source URL or reference, observed date, captured date, source type, excerpt/summary, notes and reliability limitations.
3. **Opportunity review:** title, audience problem/need, supporting evidence links, counter-evidence/unknowns, rationale, status and editable priority.
4. **Content workbench:** brief, format, audience, claim/evidence mapping, variants, editing and version history.
5. **Approval state:** draft → in review → approved/rejected; record who/when and changes. Approval is required before external publishing.
6. **Experiment log:** hypothesis, asset version, intended channel, publish status, URL/date, outcome metrics and observation window.
7. **Learning summary:** compare recorded experiments; suggest a next test with cited observations and clear uncertainty.
8. **Export and delete:** export workspace data in a usable format and delete workspace data according to policy.

## Explicitly not MVP
Unattended publishing, mass DMs/comments, account/password collection, arbitrary web scraping, ad buying, affiliate link cloaking, automated earnings claims, real-time multi-platform analytics, team billing, complex agent orchestration, and native mobile apps.

## Acceptance criteria
- Every generated opportunity cites one or more stored evidence items or is labeled an unverified hypothesis.
- Every metric has a unit, observation time/window and origin (manual/imported/API).
- Content can be edited and exported without publishing.
- External publishing is impossible until the user explicitly approves the exact asset/channel/action.
- Failures do not silently mark an experiment as published.
- A user can see and correct the source of every key recommendation.
- Secrets are not present in client code, repository files, logs or exported workspace data.
- Automated tests cover access control, provenance, approval gates, metric validation and deletion behavior.

## MVP completion gate
Demonstrate one complete workflow with real evidence and a real user. Report what was observed, what failed, what remains manual, and actual costs. Do not describe the MVP as validated before this gate passes.