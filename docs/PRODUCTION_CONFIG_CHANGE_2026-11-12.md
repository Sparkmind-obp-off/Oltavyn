# Production configuration change — 2026-11-12

This commit intentionally triggers a fresh Cloudflare Pages Production build after the Pages project settings were updated directly.

## Production environment settings changed

- `CLERK_ISSUER`: `https://clerk.oltavyn.biz.id`
- `DUITKU_BASE_URL`: remains `https://api-prod.duitku.com`
- `DUITKU_CHECKOUT_ENABLED`: `true`

No Sandbox endpoint is configured or permitted by the application.

## Security and verification notes

- Clerk Production domain DNS, SSL, and mail status were reported complete by Clerk's domain verification API on 2026-11-12.
- Clerk Production Google OAuth is enabled and configured; email, password, and phone sign-in methods are disabled.
- Cloudflare secret values are encrypted and are not readable through the Pages project configuration response. Presence of a secret slot is not proof that its value is current or valid.
- Do not place Clerk, Duitku, Groq, Apify, Tavily, or other provider secrets in Git.
- A successful Pages deployment does not prove a successful Google sign-in or a successful Duitku transaction.
- Perform post-deploy verification of `/auth/config`, Google sign-in and session creation, Duitku invoice creation, callback signature validation, and transaction reconciliation.
- No real charge, refund, or customer payment was initiated by this change.

## Current release posture

Checkout is intentionally enabled in the Production Pages configuration at the owner's explicit request. It must use the Production merchant credentials and the production invoice host. If the merchant credentials are missing or invalid, checkout must fail closed and must not fall back to Sandbox.
