# OLTAVYN — Clerk Authentication Setup

Status: Clerk integration code is committed. Google sign-in requires configuration in Clerk Dashboard and Cloudflare. Do not enable Clerk variables until migration 0007_clerk_identity.sql has been applied to the target D1 database.

## Authentication architecture

- Clerk owns sign-up, sign-in, email verification, session lifecycle and Google OAuth.
- OLTAVYN remains the application and authorization authority: each verified Clerk user maps to an internal users.id; workspace authorization continues to use that internal ID.
- The Clerk __session JWT is verified in the Cloudflare Worker using the Clerk JWT public key (RS256), expiry, optional issuer pinning and an authorized-party allowlist.
- First sign-in retrieves the Clerk user profile server-to-server and requires a verified primary email before creating/linking an internal account.
- Existing password accounts and sessions remain available for compatibility; the sign-in UI switches to Clerk when all three required Clerk settings exist.
- No Clerk secret or JWT public key is sent to the browser.

## Clerk Dashboard setup

1. Create a Clerk application for OLTAVYN.
2. In User & authentication → Social connections, enable Google and complete Google's OAuth configuration as required by Clerk.
3. Enable email verification. OLTAVYN only provisions accounts with a verified primary email.
4. In Domains, add the actual OLTAVYN production hostname and intended preview/development hostnames.
5. In API keys, copy the publishable key, secret key and JWT public key (PEM public key).
6. Record the exact Clerk issuer from a verified session token or Clerk instance configuration if issuer pinning is desired.

Google is not automatically enabled by this code. It appears in the Clerk sign-in/sign-up UI only after the Google social connection is enabled in Clerk Dashboard.

## Cloudflare Pages / Worker variables

Set these on the OLTAVYN Cloudflare project. Use test keys for development and live keys only for production.

| Variable / Secret | Value | Exposure |
|---|---|---|
| CLERK_PUBLISHABLE_KEY | Clerk publishable key | Public configuration returned to the app |
| CLERK_SECRET_KEY | Clerk secret key | Secret only |
| CLERK_JWT_PUBLIC_KEY | PEM public key from Clerk | Worker-only variable/secret |
| CLERK_AUTHORIZED_PARTIES | Comma-separated exact origins, e.g. https://oltavyn.pages.dev | Worker-only variable |
| CLERK_ISSUER | Optional exact iss claim from Clerk | Worker-only variable |

Do not paste keys into GitHub, source files, browser code, or chat. Never use development pk_test_/sk_test_ keys on production.

## Enablement order

1. Apply migrations locally and verify 0006 and 0007 tables/indexes.
2. Configure the Clerk development instance and Google social connection.
3. Set all three required Clerk values plus authorized parties.
4. Test sign-up with email verification, Google sign-in, logout, expired session, unverified email rejection, duplicate email linking and workspace isolation.
5. Confirm legacy password users can still sign in during transition and linked identities cannot collide.
6. Only after tests pass, configure production Clerk keys and production authorized parties.

## Security notes

- The Clerk public key is used only for signature verification; the secret key is used only to retrieve the verified Clerk profile at first login.
- OLTAVYN rejects tokens unless RS256 signature, expiry, nbf (when present), sub, azp, and configured issuer checks pass.
- azp must exactly match one of CLERK_AUTHORIZED_PARTIES. Never use a wildcard origin.
- Email-based linking is allowed only when Clerk confirms the primary email as verified.
- Account deletion, data export, support and privacy-policy handling must include the Clerk identity mapping.
- This integration has not been deployed or verified against a live Clerk instance. Complete the checklist before production use.