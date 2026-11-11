# OLTAVYN implementation and release runbook

Status: operational draft; update each section from actual execution evidence.

## 1. Environments

| Environment | Purpose | Data | Credentials | Release policy |
|---|---|---|---|---|
| Local | Development and tests | Ephemeral/local D1 | Mock credentials only | Safe for automated tests |
| Preview/staging | Owner-approved integration validation | Isolated non-production D1 | Separate limited-scope secrets | No production data |
| Production | Real users | Production D1 | Cloudflare secrets, least privilege | Explicit owner approval per release |

Never reuse production credentials or databases in local/preview.

## 2. Local verification

From repository root:

```bash
npm ci
npm run typecheck
npm run build
npm run db:migrate:local
npm run dev:sandbox
```

In a second terminal:

```bash
npm run test:smoke
```

Confirm that smoke tests target localhost and clean up disposable test records. Review the D1 local database after tests.

## 3. Provider enablement

For each provider:
1. Read the current official API documentation and terms.
2. Record the review in `docs/PROVIDER_REVIEW_REGISTER.md`.
3. Confirm account eligibility, data handling, commercial rights, limits and actual price/free quota.
4. Add the key using Cloudflare's secret-management interface; never commit it or paste it into chat.
5. Start with a non-production environment and a mocked contract test.
6. Validate credentials with a bounded, low-cost request only after explicit owner approval.
7. Verify usage in the provider dashboard.
8. Keep manual workflow available if the provider is disabled or unavailable.

A configured secret does not prove that the credential works. An API response does not prove commercial-use rights.

## 4. Release gate

Do not merge or deploy until:
- CI is green on the exact commit.
- Clean local migrations pass.
- Smoke, workspace-isolation, and provider contract tests pass.
- Security and privacy checklist has no unresolved critical/high issue.
- Owner has reviewed migration and rollback plan.
- Owner explicitly approves production migration and deployment.

## 5. Production sequence (approval required)

1. Record current production deployment/version and database backup/restore point.
2. Confirm exact migration files and backward compatibility.
3. Confirm Cloudflare project, D1 binding, secrets and environment.
4. Obtain explicit owner approval for the exact production migration.
5. Apply migration once; capture output and verify schema.
6. Obtain explicit owner approval for deployment if not already included in the same release approval.
7. Deploy the exact verified commit.
8. Verify health endpoint, login, workspace isolation, key user flows, logs and provider-disabled fallback.
9. Record deployment ID, commit SHA, migration status, test results and costs.
10. Roll back application code if necessary; do not blindly reverse destructive DB migrations. Use a reviewed forward-fix or restore plan.

## 6. Incident response

- Disable the affected provider adapter first if it is producing unsafe or costly behavior.
- Revoke/rotate exposed credentials in the provider dashboard.
- Preserve relevant audit metadata without copying secrets or unnecessary user content.
- Determine affected users, records, external runs and possible costs.
- Notify the owner with verified facts, impact, containment and next steps.
- Document root cause and a tested prevention.

## 7. Status vocabulary

- `VERIFIED`: supported by actual test, API response or production check.
- `IMPLEMENTED_NOT_VERIFIED`: code exists but relevant test/credential/live check is missing.
- `PROPOSED`: design only.
- `BLOCKED`: access, approval, cost, legal or technical dependency prevents progress.
- `NOT_APPLICABLE`: not part of the current release scope.
