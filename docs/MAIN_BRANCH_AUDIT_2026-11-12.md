# OLTAVYN Main Branch Audit — 2026-11-12

## Scope and source of truth

- Repository: `Sparkmind-obp-off/Oltavyn`
- Branch: `main`
- Audited source revision before fixes: `91b19ab058fdabca996f071c861b61f354081a84`
- Fix commits created during this audit:
  - `978e3e99db9d2ae54edac56e5be4a6eacc42b985` — fix invalid conditional declaration in Duitku webhook job creation.
  - `fa0daaa3c6795068243af7f6e17a5e73e109822f` — strip PEM whitespace correctly before importing Clerk JWT public key.
  - `e4edc5abe71c82f52be9db676ee269a39c40c5a4` — keep Google auth bootstrap endpoints outside the global protected API middleware.
- The audit changes are committed directly to `main`. No production deployment or remote D1 migration was performed.

## Findings fixed

### 1. TypeScript syntax in Duitku webhook — FIXED

The payment-success handler previously declared `const revisionLimit` as the single statement after an `if`, which is invalid JavaScript/TypeScript syntax. The entitlement check now has a block; revision limit calculation and service-job creation occur only when the entitlement row exists.

### 2. Clerk public-key PEM parsing — FIXED

The Clerk JWT verifier previously used an incorrectly escaped whitespace expression. It now removes actual whitespace from PEM text before base64 decoding and WebCrypto key import.

### 3. Google auth bootstrap routing — HARDENED

The global protected API middleware now explicitly bypasses the `/api/auth/*` namespace. Individual auth routes retain their own behavior: `/config` is public, `/me` verifies the Clerk session itself, and legacy `/register` and `/login` return HTTP 410. This ensures the browser can retrieve Clerk configuration before a customer has signed in.

## Verified by repository inspection

- Migrations exist in sequence from `0001_initial_schema.sql` through `0009_free_customer_plan.sql`.
- The base `users` table has required password hash/salt columns; Google provisioning supplies random, unusable password material for schema compatibility. Password endpoints are disabled.
- Migration 0007 adds the Clerk identity mapping and a unique partial index.
- Migration 0009 adds `plan_tier`, `plan_status`, and `plan_started_at`; existing users default to Free and receive a start timestamp.
- New Google-provisioned users are assigned the Free tier by database defaults and an explicit `plan_started_at`.
- The browser no longer renders an OLTAVYN email/password form; it mounts Clerk sign-in/sign-up UI.
- The smoke test contains a Google-only contract branch checking anonymous private API denial, HTTP 410 legacy auth endpoints, anonymous `/auth/me`, and public catalog availability.
- The Clerk external-account provider check uses the documented provider name `google`.

## Release blockers — NOT VERIFIED / NOT READY FOR PUBLIC PRODUCTION

1. **Build and test execution:** `npm ci`, `npm run typecheck`, `npm run build`, `npm run test:all`, and browser walkthrough have not been executed in this audit. GitHub push is not a test result.
2. **Preview/Production D1 isolation:** `wrangler.jsonc` currently binds the same D1 database ID (`2456b40f-2d4c-45f6-a10f-82d17606d856`) in the base configuration and `env.production`. Do not use the current base binding for Preview tests. Create/identify a separate Preview D1 database and configure its real ID before Preview migration or testing.
3. **Migration rollout:** migration 0009 and any earlier unapplied migrations have not been run against a test or production D1 database. Apply and verify the full migration chain against an isolated test database first.
4. **Clerk Dashboard:** Google Social Connection, disabled password/email-code/other providers, OAuth credentials, allowed origins, and production Google OAuth publishing status require manual Dashboard configuration. Code commits do not configure Clerk.
5. **Cloudflare secrets:** verify Preview and Production have the correct environment-specific `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_PUBLIC_KEY`, `CLERK_AUTHORIZED_PARTIES`, and optional `CLERK_ISSUER`. Never commit or paste secrets into source control.
6. **Live authentication:** Google sign-up, returning sign-in, existing-account linking, disabled-account rejection, expiry, logout, and cross-workspace isolation have not been exercised against a real Clerk test identity.
7. **Duitku:** no real merchant credentials, invoice, callback, or settlement has been tested. Keep `DUITKU_CHECKOUT_ENABLED` false until sandbox verification succeeds.
8. **Providers and Agent:** provider credentials and external calls are not validated by source inspection. Paid Actor execution must remain disabled unless explicitly approved, cost-capped, and tested.
9. **Free plan limits:** Free is currently a permanent account tier, not a timed trial. No monthly AI-run quota should be advertised until server-side metering and hard enforcement exist.
10. **Deployment:** no Pages Preview or Production deployment was performed by this audit.

## Required next validation sequence

1. Provision a separate Preview D1 database and set its actual binding in Wrangler/Pages Preview configuration.
2. Run the full migration chain locally or against that isolated Preview database.
3. Run clean install, typecheck, build, all smoke/provider/agent tests, and resolve every failure.
4. Configure Clerk development Google-only connection and Preview environment secrets.
5. Run live Google identity tests and browser walkthrough.
6. Configure Duitku sandbox credentials, verify create-invoice and signed callback idempotency.
7. Verify Cloudflare Access admin protection and admin/customer route separation.
8. Only after all checks pass, request explicit authorization for Production migration and deployment.

## Current decision

**Status: implementation fixes committed; validation and release remain blocked.** Do not describe OLTAVYN as production-ready or publicly launchable until the release blockers above have evidence and are closed.
