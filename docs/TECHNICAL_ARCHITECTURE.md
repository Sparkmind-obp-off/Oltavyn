# OLTAVYN — Technical Architecture

**Status:** Proposed baseline; implementation choices remain revisable.

## Architecture style
Start as a modular web application with a clear domain layer and provider adapters. Avoid microservices and autonomous multi-agent orchestration until load or integration boundaries require them.

## Logical layers
1. **Web client:** workspace, evidence ledger, opportunity review, content workbench, experiment log and settings.
2. **Application/API layer:** authentication, authorization, input validation, use cases, rate limits and audit events.
3. **Domain layer:** workspace, evidence, opportunity, asset/version, approval, experiment, observation and recommendation rules.
4. **Provider adapters:** model provider, authorized evidence import, file storage and future publishing/analytics providers. Core domain must not depend on one provider's data model.
5. **Persistence:** relational records for application state; private object storage only if generated files/media require it.
6. **Operations:** secret management, structured logs without sensitive payloads, migrations, backups, error monitoring and cost limits.

## Suggested initial deployment
A TypeScript web app deployed on a managed edge/web platform, a relational SQL database, and a small server-side API. Cloudflare Pages/Workers with D1 is a candidate because the owner already uses that ecosystem, but the choice is not locked until auth, transaction, backup, file, and runtime requirements are verified. Use object storage only when needed. Prefer a provider-neutral repository and environment configuration.

## Request flow
Browser → authenticated API → validated use case → domain rules → database/provider adapter → sanitized response. Model-generated output is untrusted input: validate schema, preserve evidence references, and require user review before any external side effect.

## Domain modules
- Identity & workspace
- Evidence ingestion and provenance
- Opportunity scoring and review
- Content generation and versioning
- Approval and publishing orchestration
- Experiment observations and learning
- Integrations and audit

## Reliability rules
- External side effects are explicit commands, never incidental side effects of page load or generation.
- Use idempotency keys for future publishing actions and persist request/result states.
- Model calls have timeouts, bounded retries, token/cost limits and user-visible failures.
- Database migrations are versioned and tested against a disposable environment.
- Keep provider adapters behind interfaces; do not create speculative abstractions without a second use case.

## Environment separation
Local development, preview/staging and production use separate credentials and data. Production auth must use production credentials; development bypasses are prohibited in production. Never place secrets in `NEXT_PUBLIC_*` or other client-visible variables.

## Architecture decision gates
Before coding: verify chosen host/runtime, auth provider, database limits and backup/export path, model provider cost/data terms, source permissions, file requirements and deployment rollback. Record decisions in `DECISIONS.md`.