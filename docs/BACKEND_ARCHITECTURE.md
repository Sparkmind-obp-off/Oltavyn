# OLTAVYN — Backend Architecture

## Responsibilities
The backend owns identity checks, workspace isolation, business rules, evidence provenance, generation orchestration, approval enforcement, persistence, auditability and integration credentials.

## API conventions
- Version APIs when breaking changes are unavoidable.
- JSON requests/responses with schema validation and consistent error codes.
- Pagination and bounded filtering for collections.
- Authentication on all private endpoints; authorization checks on every workspace-scoped resource.
- Rate limits for expensive or abuse-prone endpoints.
- Never trust workspace IDs, role claims or approval status supplied by the browser without server verification.

## Initial use cases
- Create/update workspace settings.
- Create/list/update evidence records.
- Create/review opportunity candidates and attach evidence IDs.
- Generate a brief or variants from a selected opportunity.
- Edit/version/approve/reject content.
- Create/update experiment and observation records.
- Generate a learning summary from persisted observations.
- Export/delete workspace data.

## Generation pipeline
1. Validate user intent and workspace permissions.
2. Load only relevant evidence and current asset context.
3. Call model provider with bounded prompt/context and structured output schema.
4. Validate output shape and evidence IDs against records the user can access.
5. Mark unsupported claims; never treat model text as verified fact.
6. Persist result, model/provider metadata needed for debugging, and cost estimate without logging sensitive prompt contents unnecessarily.
7. Return result as draft; no publishing side effect.

## Publishing command (future phase)
Require explicit approval tied to immutable asset version, destination/account, and requested action. Re-check permissions and token validity at execution time. Persist pending/succeeded/failed result and provider reference. Use idempotency keys, limited retries, audit trail and a cancel path where possible. Do not retry ambiguous outcomes blindly.

## Error handling
Return actionable safe errors; avoid exposing stack traces, secrets or raw provider payloads. Distinguish validation, permission, rate-limit, provider, timeout and conflict errors. Partial failures must not imply success.

## Background work
Keep MVP tasks synchronous if response time is reasonable. Add a queue/worker only when long-running ingestion or media generation requires it. Jobs need status, timeout, bounded retries and deduplication.

## Observability
Record request IDs, duration, provider name, status, cost estimate and safe error category. Do not log access tokens, cookies, OTPs, full private content or unnecessary personal data. Alert on authorization failures spikes, repeated provider failures and unusual spend.