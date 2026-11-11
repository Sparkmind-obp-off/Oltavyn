# Cloudflare Access for OLTAVYN Command Center

## Architecture

OLTAVYN keeps one repository, one Cloudflare Pages project, one application backend, and the existing D1 source of truth.

- Customer routes remain public to the internet and use the existing Clerk/local OLTAVYN authentication.
- `/admin` and `/admin/*` require a valid Cloudflare Access JWT before the admin shell is served.
- `/api/admin` and `/api/admin/*` require a valid Cloudflare Access JWT, then the existing OLTAVYN session, then the server-side `OLTAVYN_ADMIN_EMAILS` allowlist.
- A valid Access token alone does not grant OLTAVYN admin privileges.
- Admin HTML and static assets are not treated as secrets; all data and mutations remain protected by server-side API checks.

The Worker verifies the `Cf-Access-Jwt-Assertion` signature against the Cloudflare Access JWKS endpoint and checks issuer, configured audience, expiry, not-before, and subject. JWKS are cached in isolate memory for five minutes; the next request refreshes them. This protects against direct-origin or alternate-hostname requests that bypass the Access login page.

## Cloudflare dashboard setup

Do this in the Cloudflare account that owns the OLTAVYN production hostname.

1. Open **Zero Trust → Access controls → Applications**.
2. Create a **Self-hosted** application for the OLTAVYN production hostname and the path `/admin*` (include the base `/admin` path if the UI asks for an explicit pattern).
3. Create an Allow policy with **Include → Emails** and enter only the exact trusted operator email addresses. Do not allow an entire email domain.
4. Set an appropriate short session duration (for example, 8 hours) and use an identity provider with MFA enabled.
5. Protect the API path `/api/admin*` as well. If the dashboard allows multiple hostname/path entries on one Access application, add it to the same application. If it requires a separate application, create a second Self-hosted application with the same Allow policy and record its distinct Application Audience (AUD) tag.
6. Do not create a catch-all Access application on the whole OLTAVYN hostname: customers must continue using the public customer app.
7. Repeat the path protection for every production hostname that can reach the Pages project, including the custom domain and the production `.pages.dev` hostname if it remains publicly reachable. Do not assume protecting one hostname protects another.
8. Preview deployments are separate hostnames. Keep them private using Pages **Settings → General → Enable access policy**; configure preview environment bindings separately from production.

Cloudflare documentation:
- https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json
- https://developers.cloudflare.com/pages/configuration/preview-deployments/

## Required server-side variables

Set these as server-side Cloudflare Pages/Workers variables. Never use `VITE_` prefixes and never commit secrets.

| Variable | Value |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Team domain only, e.g. `your-team.cloudflareaccess.com` (no scheme or path) |
| `CF_ACCESS_AUD` | Application Audience (AUD) tag from the Access application. For two Access applications, enter both tags separated by commas. |
| `OLTAVYN_ADMIN_EMAILS` | Exact comma-separated OLTAVYN admin account email addresses |

The Access audience tag is an identifier, not a password. Still keep it in server-side configuration so the expected audience cannot be changed by the browser.

The application fails closed on production and preview if the Access team domain or audience is missing. An optional `OLTAVYN_ACCESS_LOCAL_BYPASS=true` is accepted only on localhost/127.0.0.1 for local development; never set it in Cloudflare production or preview.

## Clerk and OLTAVYN identity

Keep the existing Clerk integration and its verified-primary-email mapping. Keep `OLTAVYN_ADMIN_EMAILS` as the second, independent application-level authorization check. Use the same trusted operator email in the Cloudflare Access policy and the OLTAVYN allowlist. Remove an operator from both lists when access should be revoked.

Do not rely on:
- a hidden URL,
- a hidden navigation item,
- client-side role flags,
- the Cloudflare Access session by itself,
- a Clerk account by itself.

## Verification checklist

Run against a non-production Pages deployment and a separate non-production D1 database first.

1. Customer home, pricing, registration/login, and customer APIs remain accessible without Cloudflare Access.
2. Direct requests to `/admin` without Access are denied (403/503).
3. Direct requests to `/api/admin/dashboard` without Access are denied.
4. A user who passes Cloudflare Access but is not in `OLTAVYN_ADMIN_EMAILS` receives 403 from the admin API.
5. A user in both allowlists but without a valid OLTAVYN session receives 401.
6. An authorized operator in both systems can open the dashboard and call admin APIs.
7. Tampered, expired, wrong-issuer, and wrong-audience Access JWTs are rejected.
8. Test both the custom production hostname and `.pages.dev` hostname so there is no alternate-hostname bypass.
9. Verify a normal customer can still use the app without being prompted for Cloudflare Access.

## Deployment boundary

This change only adds application-side verification. It does not create or modify Cloudflare Zero Trust applications, Access policies, Pages variables, D1 bindings, migrations, or deployments. Configure the dashboard and variables manually, then test on Preview. Do not enable live checkout or deploy production as part of this security change.
