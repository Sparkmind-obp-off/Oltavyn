# OLTAVYN — Manual Release & Provider Runbook

This project intentionally uses **manual, operator-controlled releases**. It does not use GitHub Actions, CI/CD workflows, or workflow YAML.

## Environment map

| Environment | D1 database | Purpose | Automatic production writes |
|---|---|---|---|
| Local | Wrangler local D1 state | Development and repeatable tests | No |
| Preview | `oltavyn-preview` | Remote integration/authentication smoke tests | No |
| Production | `oltavyn-production` (legacy binding ID retained pending recovery decision) | Live service | No changes until explicit release approval |

The preview D1 database was created in the Cloudflare account for isolated verification. Its ID is recorded in `wrangler.jsonc`. The previous production binding ID is intentionally preserved and is not silently replaced.

## Manual verification

Run from the repository root:

```sh
npm ci
npm run typecheck
npm run build
npm run db:reset:local
npm run test:providers
npm run test:smoke
npm run test:affiliate
npm audit --omit=dev
```

Or run the complete deterministic local gate:

```sh
npm run test:all
```

Tests must use mocks/fixtures. Do not add live provider calls to the local test suite.

## Preview D1 and preview deployment

1. Confirm the current branch is `feat/faceless-affiliate-factory-phase1`.
2. Inspect `wrangler.jsonc` and confirm the top-level `DB` binding points to `oltavyn-preview`.
3. Apply migrations only to preview:

   ```sh
   npm run db:migrate:preview
   ```

4. Build and deploy a preview version:

   ```sh
   npm run deploy:preview
   ```

5. Test the preview hostname:
   - `/api/health`
   - registration/login and session persistence
   - workspace create/list/read and workspace isolation
   - `/affiliate` product/channel/evidence/scorecard/content flows
   - provider status (must show unconfigured/disabled until credentials are intentionally set)
   - logout and invalid-session behavior

6. Do not run production migrations, update production bindings, change custom domains, or merge the PR as part of preview testing.

## Authentication and first-run

- The application authentication is backed by the D1 schema. A newly created D1 database must receive the full ordered migration chain before login, registration, sessions, and workspace operations can work.
- Never infer that a healthy `/api/health` response proves the database or authentication is healthy.
- Use a dedicated test identity only in preview. Do not reuse a real password or production account.
- Verify session cookie flags, CSRF/origin guard, rate limits, logout, and cross-workspace access denial.
- Remove preview test records after verification using the documented cleanup script, scoped to the preview database only.

## Provider configuration and activation

Provider integrations are optional and must remain disabled until the owner intentionally configures credentials and validates each connection.

| Provider | Secret name | Purpose | Current gate |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | Structured content draft generation | Not configured / not validated |
| Tavily | `TAVILY_API_KEY` | Search discovery and source leads | Not configured / not validated |
| Apify | `APIFY_API_TOKEN` | Allowlisted Actor runs | Not configured / not validated; each run needs explicit confirmation |
| Scrape.ly | `SCRAPELY_TOKEN` | Scraping adapter | Disabled until official endpoint, auth and pricing are verified |

Rules:
- Never paste credentials into chat, GitHub files, D1, browser code, logs, or screenshots.
- Configure secrets only through Cloudflare Pages secrets or an untracked local `.dev.vars`.
- A secret's presence means `configured_unverified`, not `verified`.
- Run a small read-only credential validation first where the provider supports it.
- Show exact provider/Actor/model, data sent, quota/cost uncertainty, and limits before any billable request.
- Do not run Actors, batch scraping, or paid requests without explicit per-run approval.
- No provider is required for manual product intake, evidence, scorecards, template content packs, approvals, or manual publishing.

## Production release gate

Production is blocked until all are true:

1. The missing legacy D1 database is investigated for deletion/undelete or recoverable backup.
2. The owner decides whether old production data can be discarded.
3. Preview migrations and auth/workspace smoke tests pass against the remote preview D1.
4. All local verification commands pass from actual output.
5. Provider connection status and cost controls are documented; no provider is falsely marked verified.
6. Exact commit, diff, production D1 target, migration plan, backup/restore plan, and rollback behavior are reviewed.
7. The owner gives separate explicit approval for production database creation/binding, remote migrations, provider activation/spend, merge, and production deployment.

A Pages deployment rollback does not restore D1 data. Keep database recovery and code rollback as separate procedures.
