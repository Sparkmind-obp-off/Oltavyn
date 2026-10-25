# OLTAVYN — QA, Release & Operations Plan

## Quality gates
**Every change:** typecheck, lint, unit tests, review for secrets, build.

**Before production:** migration test from clean schema, authorization/integration tests, dependency/security review, environment-variable audit, backup/export verification, error handling, responsive/accessibility pass and manual end-to-end walkthrough.

## Critical test areas
- Identity and workspace isolation.
- Evidence provenance and URL/metadata validation.
- Opportunity-to-evidence relationships and scoring explanation.
- Model output schema validation and unsupported-claim handling.
- Version-bound approval and prevention of unauthorized publishing.
- Metrics units, source and time windows.
- Integration token expiry, provider errors, rate limits, duplicate calls and idempotency.
- Export/deletion and sensitive-data logging.

## Release stages
1. Local prototype with synthetic test fixtures clearly labeled as synthetic.
2. Private test with user-provided/authorized evidence.
3. Small controlled validation with a real operator and explicit consent.
4. Limited production only after auth, privacy, recovery and monitoring gates pass.

## Deployment rules
- No deployment until tests and build pass.
- Use migrations, not ad-hoc production schema edits.
- Verify deployed commit/version and run smoke tests after release.
- Keep rollback instructions and previous known-good deployment.
- Never claim production readiness based solely on a successful build.

## Operational signals
Track uptime/error rate, API latency, model/provider failures, approximate spend, rate limits, failed jobs and suspicious authorization patterns. Logs must exclude credentials and unnecessary private content.

## Manual smoke test
Sign in → create workspace → add evidence → create linked opportunity → generate and edit brief → approve version → log manual publication → add observation → view learning summary → export data. Confirm a second workspace/user cannot access the first workspace's records.

## Reporting template
For each milestone record: commit/deployment reference, commands/tests run, pass/fail results, manual test evidence, known limitations, costs observed, and next blocker. Separate implemented, deployed, verified and validated states.