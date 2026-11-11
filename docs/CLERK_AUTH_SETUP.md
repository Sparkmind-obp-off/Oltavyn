# OLTAVYN — Google-only Authentication

Status: application code implements Google-only authentication. Live sign-in is not considered enabled until the Clerk Google connection, OAuth callback, Cloudflare variables and migration 0009 have been configured and tested.

## Customer authentication policy

- Customers can register and sign in only through Google Social Sign-In via Clerk.
- Do not enable email/password, passwordless email code/link, phone/SMS, username/password or other social providers in the Clerk instance.
- Google supplies a verified email address for account identity, account recovery/support and transactional communication. The email address is profile data; it is not an OLTAVYN login method.
- The old `POST /api/auth/register` and `POST /api/auth/login` endpoints return HTTP 410 and cannot create password sessions.
- Legacy password cookies are no longer accepted by the application. Existing accounts are linked to Google only when the verified Google email matches the existing account email.
- Never remove the email column from the user database: it is the canonical account contact and unique identity-linking key, not an email/password login mechanism.

## Clerk Dashboard configuration

1. Open the OLTAVYN Clerk application.
2. In **User & authentication → Social connections**, enable **Google** and complete the Google OAuth credentials/consent configuration.
3. In **User & authentication → Email, Phone, Username**, disable email/password sign-in and sign-up, passwordless email code/link, phone and username authentication. Keep the email address available as a profile attribute returned by Google.
4. Disable every social connection other than Google.
5. In **Domains**, add the exact production hostname and intended preview hostname(s).
6. Configure Google redirect/callback URLs exactly as shown by Clerk and Google's OAuth configuration.
7. Copy the publishable key, secret key and JWT public key (PEM) from the same Clerk instance.

Google-only behavior depends on this Dashboard configuration as well as the application code. Do not announce sign-up as available until a real Google OAuth round trip succeeds.

## Cloudflare Pages / Worker variables

Set these in the OLTAVYN project. Use a separate Clerk development instance for Preview and a production Clerk instance for Production.

| Variable / Secret | Value | Exposure |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Public configuration |
| `CLERK_SECRET_KEY` | Clerk secret key | Secret only |
| `CLERK_JWT_PUBLIC_KEY` | PEM public key from Clerk | Worker-only |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated exact origins | Worker-only |
| `CLERK_ISSUER` | Optional exact token issuer | Worker-only |

Never place secret keys or PEM material in GitHub, browser code, or chat. Never use test keys in Production.

## Free Starter

Migration `0009_google_only_free_starter.sql` creates `user_plans` and assigns existing users the permanent `free_starter` plan. On the first verified Google sign-in, the Worker ensures the plan exists for the internal OLTAVYN user.

Free Starter currently includes:
- Permanent Rp0 baseline access; no expiry and no payment card.
- One workspace per account (enforced by the server).
- Core OLTAVYN workflow and manual data entry.
- No paid external Actor execution or provider-credit allowance is included.
- Service packages, production work and provider costs remain separately priced.

This is a permanent entry plan, not a time-limited premium trial. Do not advertise unlimited AI, web research, scraping or video generation. Per-feature usage metering and additional quotas must be implemented before promising numeric monthly limits.

## Required migration and rollout

1. Apply migrations 0001–0009 to the intended test D1 database. Do not apply to Production before the staging tests pass.
2. Configure Clerk development instance with Google as the only enabled sign-in method.
3. Configure Preview Cloudflare variables using the development Clerk keys and exact Preview origins.
4. Test Google sign-up, existing-account linking, sign-in, sign-out, expired/revoked session, disabled account, workspace ownership and the one-workspace Free Starter limit.
5. Confirm `POST /api/auth/register` and `POST /api/auth/login` return HTTP 410.
6. Confirm email/password UI is absent and Clerk renders only Google.
7. Only after all checks pass, repeat with production Clerk keys and production D1.

## Security notes

- The Worker verifies Clerk RS256 JWT signature, expiry, optional `nbf`, issuer and exact `azp` allowlist.
- The Clerk secret and JWT public key are never sent to the browser.
- Email-based account linking requires Clerk to report the primary email as verified.
- Admin authorization remains independent of customer Google sign-in and continues to require the admin allowlist and Cloudflare Access.
- This code has not yet been validated against a live Clerk/Google OAuth configuration. Do not enable Production until the checklist passes.
