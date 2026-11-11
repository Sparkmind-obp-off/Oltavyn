# OLTAVYN Google-only Customer Authentication and Free Plan

## Product decision
- Customer registration and sign-in use Google OAuth through Clerk only.
- OLTAVYN does not offer email/password registration, email/password login, or a customer-created OLTAVYN password.
- The verified Google primary email is retained as the account contact and payment receipt identity. The customer does not type it into an OLTAVYN password form.
- Each new customer receives an account-level Free plan automatically after the first successful Google sign-in.
- Existing accounts are migrated to Free and may link to Google only when the verified Google email matches their existing OLTAVYN email.
- Free is not a time-limited trial, does not require a payment method, does not auto-charge, and does not expire.
- Paid productized service packages remain separate purchases in the commercial catalog.

## Clerk Dashboard is required
1. Enable Google under User & authentication → Social connections and complete the Google OAuth configuration.
2. Disable password, email code/link, phone, username, and all other customer sign-in methods. Keep Google OAuth as the only enabled method.
3. Ensure the Google OAuth application is in production mode and its authorized redirect URI matches Clerk's displayed callback URL.
4. Configure production and development Clerk instances separately.
5. Test a new Google account, an existing account linked by the same verified email, logout, and a non-Google attempt.

The code rejects Clerk users that do not have a linked Google external account, and rejects legacy /api/auth/register and /api/auth/login requests. Clerk Dashboard must still be configured correctly; source code cannot enable Google OAuth credentials or change the Clerk Dashboard's provider settings.

## Cloudflare configuration
Required Worker variables/secrets: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY (secret), CLERK_JWT_PUBLIC_KEY, CLERK_AUTHORIZED_PARTIES, and recommended exact CLERK_ISSUER.

Apply migration 0009_account_free_plan.sql to the target D1 database before enabling the updated Worker. Do not enable Clerk in production before migration is applied.

## Free plan semantics
The Free plan is stored in account_plans and is assigned to existing users by migration and to newly provisioned Google users during first authenticated request. It is an account tier, not a paid order. The current implementation does not claim an enforced AI-run quota. Do not advertise a monthly generation/run limit until server-side metering and enforcement have been implemented and tested.

## Rollout checklist
- Apply migration locally and in staging first.
- Configure Clerk Google-only sign-in methods in Dashboard.
- Set Clerk variables for the correct Pages environment.
- Test Google sign-up/sign-in, verified email, user mapping, Free plan assignment, logout, and rejection of password endpoints.
- Verify Preview and Production use separate D1 databases.
- Deploy to Preview and smoke-test before Production.