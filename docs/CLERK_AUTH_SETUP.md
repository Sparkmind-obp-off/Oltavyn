# OLTAVYN — Google-only Authentication

Status: application code supports Google-only sign-up and sign-in. The Google provider and credential settings must still be configured in the Clerk Dashboard. Apply migration `0009_free_customer_plan.sql` before enabling the updated Worker code.

## Customer experience

- Customers can sign up and sign in only with Google.
- The first successful Google sign-in automatically provisions an OLTAVYN account.
- The first login also links an existing OLTAVYN account only when its email exactly matches Google's verified primary email.
- No email/password registration, email/password login, or password reset flow is offered. The legacy `POST /api/auth/register` and `POST /api/auth/login` endpoints return HTTP 410.
- The email address returned by Google remains stored as the account's verified contact/identity field. It is not a separate login method.
- Every new account starts on the permanent Free core plan (`plan_tier=free`, `plan_status=active`). Free is not a timed trial and does not require a payment card. Paid service packages remain separate catalog purchases.
- After sign-in, a new customer completes the first-workspace onboarding flow.

## Clerk Dashboard — required manual configuration

Configure both the Clerk development instance and production instance separately.

1. Open **User & authentication → Social connections**.
2. Enable **Google** for both sign-up and sign-in. Complete Google's OAuth client configuration.
3. Under **User & authentication → Email**, disable email-code/passwordless email sign-in and any email-based sign-in option.
4. Under **User & authentication → Password**, disable password authentication.
5. Disable other identifiers/providers not intended for customer access (phone, username, passkeys, and other social providers). Keep Google as the only enabled customer authentication method.
6. Ensure Google returns the user's verified primary email. OLTAVYN rejects an account without a verified primary email.
7. Add the exact production and intended preview origins to Clerk's allowed domains / authorized parties.
8. For the production Google OAuth app, complete Google's publishing/verification requirements. A development OAuth app may be restricted to test users.

Clerk documentation:
- https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google
- https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options

## Cloudflare Pages / Worker configuration

Set these on the OLTAVYN project. Never paste secrets into GitHub, browser code, or chat.

| Variable / Secret | Purpose |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | Public Clerk instance key |
| `CLERK_SECRET_KEY` | Server-side Clerk API access |
| `CLERK_JWT_PUBLIC_KEY` | Worker-side RS256 verification |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated exact allowed origins; no wildcards |
| `CLERK_ISSUER` | Optional exact issuer pin |

Use development keys and development D1 for Preview. Use production keys and production D1 only for Production.

## Database migration and rollout order

1. Apply migrations `0006`, `0007`, `0008`, and `0009` to the intended test D1 database.
2. Configure the Clerk development instance with Google as the only enabled authentication method.
3. Set development Clerk keys and exact preview origins in the Preview environment.
4. Test Google sign-up, repeat Google sign-in, logout, expired sessions, disabled users, verified-email requirement, existing-account linking, and workspace ownership.
5. Confirm a new account has `plan_tier=free` and `plan_status=active`.
6. Confirm email/password endpoints return HTTP 410 and no frontend email/password form is rendered.
7. Only after Preview tests pass, apply migrations to Production, configure production Clerk keys, and deploy the verified build.

## Security and compatibility

- OLTAVYN verifies Clerk JWT RS256 signature, expiry, optional `nbf`, `sub`, `azp`, and optional exact issuer.
- The Clerk secret key and JWT public key never reach the browser.
- Existing password-based accounts can transition by signing in with Google using the same verified primary email. OLTAVYN links the Google identity to the existing internal user ID, preserving workspace ownership.
- Old local password sessions are no longer accepted by protected API routes. Customers must sign in with Google.
- The application server remains authoritative for account status, workspace ownership, and admin authorization.
- Google provider activation and Cloudflare secrets are external dashboard settings; committing application code does not activate those settings automatically.
- No production deployment or live Google OAuth verification is implied by this documentation.
