# OLTAVYN — Direct Production & Provider Runbook

This project uses **manual, operator-controlled releases**. No GitHub Actions, CI/CD workflows, or workflow YAML.

## Production environment

- Pages project: `oltavyn`
- Production hostname: `oltavyn.pages.dev` and configured custom domain(s)
- D1 binding: `DB`
- Production D1: `oltavyn-production`
- Production D1 UUID: `2456b40f-2d4c-45f6-a10f-82d17606d856`
- Region: APAC
- Previous production database UUID `94c9a84b-7fa8-49a4-b9f2-8006450a767b` was not found by Cloudflare (7404). The new database is empty; the old data has not been restored.
- The temporary `oltavyn-preview` database was deleted after the owner explicitly redirected the work to direct production. No other project's D1 database was deleted.

## Manual verification commands

Run from a clean checkout:

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

Or run the deterministic local gate:

```sh
npm run test:all
```

Only report results supported by actual command output. Local tests must use mocks/fixtures and must not make live provider calls.

## Production migrations and authentication

The new production D1 starts empty. Apply the ordered migrations 0001–0003 to the production database only after checking the database UUID and confirming the exact commit/configuration:

```sh
npm run db:migrate:prod
```

Then verify:
- `/api/health` and a DB-backed health/readiness route if implemented
- registration and login
- session cookie persistence, expiry, logout and invalid session
- CSRF/origin protection and rate limits
- workspace create/list/read and cross-workspace denial
- affiliate products/channels/evidence/scorecards/content package flows
- export and workspace deletion including affiliate records

Use a dedicated production smoke-test identity only with explicit owner approval. Never reuse real credentials. If any production smoke test writes data, record the exact test identity and clean it using the documented cleanup SQL scoped to this database only. Do not claim the test passed before actual output is inspected.

## Production deployment

1. Ensure the reviewed release commit is on `main`.
2. Run local verification commands.
3. Verify Wrangler production binding points to the exact D1 UUID above.
4. Apply production migrations and inspect migration history/schema.
5. Deploy the reviewed `main` build:

   ```sh
   npm run deploy:prod
   ```

6. Run non-destructive health and authentication checks, then the approved smoke test.
7. Record deployment ID, commit SHA, D1 UUID, migration versions, test results and provider state.

Do not deploy unreviewed feature-branch code labelled as production. Do not merge the PR until code review and local verification are complete.

## Provider configuration and activation

Provider integrations are optional and remain disabled until credentials are intentionally configured and validated.

| Provider | Secret name | Purpose | Current gate |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | Structured content draft generation | Not configured / not validated |
| Tavily | `TAVILY_API_KEY` | Search discovery and source leads | Not configured / not validated |
| Apify | `APIFY_API_TOKEN` | Allowlisted Actor runs | Not configured / not validated; each run needs explicit confirmation |
| Scrape.ly | `SCRAPELY_TOKEN`, `SCRAPELY_BASE_URL`, `SCRAPELY_RUN_PATH` | Scraping/task adapter | Fail-closed until official endpoint, auth, request schema and pricing are verified |

Rules:
- Never paste credentials into chat, GitHub files, D1, browser code, logs, or screenshots.
- Configure secrets only through Cloudflare Pages secrets or an untracked local `.dev.vars`.
- A secret's presence means `configured_unverified`, not `verified`.
- Scrape.ly must remain `endpoint_unverified` until its official HTTPS base URL and exact run-path template have been reviewed; never assume a vendor API path.
- `/api/affiliate/providers/usage` reports audited call counts only, not cost, tokens, credits or balances.
- Run a small read-only credential validation first where supported.
- Show exact provider/Actor/model, data sent, quota/cost uncertainty, and limits before any billable request.
- Do not run Actors, batch scraping, or paid requests without explicit per-run approval.
- A boolean confirmation flag is not a spend cap; unattended batch actions stay disabled until enforceable quotas exist.
- Provider outages must not block manual intake, evidence, scorecards, template content generation, approvals, or manual publishing.

## Recovery and rollback

- A Pages deployment rollback does not restore D1 data.
- Keep database recovery separate from code rollback.
- The old production D1 is currently unavailable. The new production D1 is empty and cannot recover the old users/workspaces.
- Keep backups and document restore procedures before material production data accumulates.
