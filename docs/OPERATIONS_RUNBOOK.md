# OLTAVYN operations runbook

Status: initial operating guide; update with verified environment-specific details.

## Daily operator workflow

1. Select or create the correct workspace.
2. Define niche, audience, objective and permitted sources.
3. Gather evidence and preserve source URLs, capture time, method and limitations.
4. Create an opportunity and inspect supporting/counter evidence.
5. Select a product/channel only when provenance is clear.
6. Generate a content draft; review claims and remove unsupported assertions.
7. Approve the exact content version and destination.
8. Publish manually during pilot; record the actual URL/date or reason for not publishing.
9. Record actual outcome metrics with unit, source and observation window.
10. Review learning summary and choose the next experiment.

## Provider failure

- Check whether provider is configured, verified, enabled and within quota.
- Inspect sanitized correlation ID and provider status; do not expose secrets.
- Retry only when the operation is safe and idempotent.
- For ambiguous Actor/run outcomes, check provider dashboard/run ID before retrying to avoid duplicate spend.
- Switch to manual research/drafting if the provider is unavailable.
- Disable the provider if it returns unsafe output or unexpected charges.

## Usage and cost monitoring

- Check provider dashboards before and after every approved paid/credit-consuming pilot request.
- Record actual usage, currency, date, provider and operation.
- Treat free quota as limited and potentially expiring; verify overage behavior.
- Do not enable scheduled or batch jobs until enforceable budgets and owner approval are implemented.
- Current cost status is unknown until provider accounts and dashboards are inspected.

## Data lifecycle

- Export workspace data before a planned deletion when required.
- Use the in-product deletion flow and typed confirmation.
- Explain that external provider copies and backup retention may have separate deletion timelines.
- Do not manually delete production D1 records outside a reviewed procedure.

## Incident response

1. Contain: disable the affected integration or session path.
2. Protect: revoke/rotate compromised keys in the provider dashboard.
3. Assess: determine affected users, workspaces, records, provider runs and possible spend.
4. Preserve: retain only necessary audit metadata; do not copy secrets.
5. Notify the owner with confirmed facts and unknowns.
6. Recover using reviewed rollback/forward-fix and data restore procedures.
7. Document cause, impact, resolution and prevention.

## Operational status labels

Use NOT CONFIGURED, CONFIGURED—UNVERIFIED, VERIFIED, DISABLED, QUOTA LIMITED, ERROR. Do not display a green connected/healthy status based only on the existence of a secret.
