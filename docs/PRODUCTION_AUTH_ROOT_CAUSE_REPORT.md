# Production Auth Root-Cause Report — Google login (2026-11-12)

Status: **DEPLOYED — END-TO-END NOT YET VERIFIED** (real browser Google login must be performed by a human; see runbook).

## Evidence collected (read-only, no secrets printed)

| Source | Finding |
|---|---|
| Cloudflare Pages deployment list | Active Production deployment `71e7bd5b` was built from **`e5efb9a`**. Commits `a812e91…8abd86f` (oauth_google fix) were pushed to `main` but **never deployed**. |
| Code at `e5efb9a` (`src/routes/auth.ts:45`) | Provider check: `String(x.provider).toLowerCase()==='google'`. |
| Clerk Backend API `GET /v1/users` (Production instance `ins_3Lzk…`, `environment_type=production`) | 2 users exist, created 09:00:31Z and 09:03:41Z. Every external account has `provider: "oauth_google"`, `verification.strategy: "oauth_google"`, status `verified`; primary email verified via `from_oauth_google`. Both have active Clerk sessions. |
| Production D1 `oltavyn-production` | `users = 0`, `workspaces = 0`. All 10 migrations applied. |
| Both supplied secret keys | Resolve to the same Production instance; Backend JWKS kid == Frontend JWKS kid (`ins_3LzkWD3Y8bBxdFt3T7xLqqnGhou`). |
| Clerk Frontend API `/v1/environment` | Production; sign-up mode `public`; only social provider `oauth_google`; no password/phone first factors; captcha off; single-session mode. |
| Screen recording (16:14 WIB) | Google chooser → consent → URL `oltavyn.biz.id/#/sso-callback?__clerk_ticket…` → app re-renders → "This action couldn't be completed" → URL `#?sign-in` → "The External Account was not found." The Google account used is **not** one of the two Clerk users. |
| Clerk JS bundle actually served (`clerk-js 6.42.3`) | `external_account_not_found` is the sign-in error that clerk-js resolves by *transferring* to sign-up (`transferable` status) — that transfer only happens inside the SSO callback handler. |

> Clerk Dashboard event logs (`oauth_callback.failed`) are not reachable via the Backend API with the provided credentials; the event IDs must be read in the Dashboard (see runbook §4).

## RC-1 — Backend rejected every Google user (provider id mismatch) — CONFIRMED
* Component: Worker `resolveClerkUser` (deployed `e5efb9a`).
* Mechanism: Clerk returns `oauth_google`; deployed code only accepted `google` → `403 google_sign_in_required` → `/api/auth/me` swallowed the error and returned `{user:null}` → SPA showed login again. Explains 2 Clerk users / 0 D1 users.
* Why previous fix didn't solve it: correct on `main`, but never deployed.
* Fix: centralised `src/lib/clerkIdentity.ts` (`GOOGLE_PROVIDER_IDS`, `evaluateClerkProfile`), used by `src/lib/clerkAuth.ts`.

## RC-2 — Clerk prebuilt `<SignIn/>` OAuth callback broken by the app hash router — CONFIRMED
* Component: `public/static/app.js` (mountSignIn/mountSignUp with Clerk's default hash routing).
* Mechanism: the OAuth return lands on `/#/sso-callback`. The app's global `hashchange → render() → renderAuth()` unmounts/re-mounts the Clerk component while it is processing the callback, and `route()` treats `sso-callback` as an unknown page (→ login). The sign-in→sign-up **transfer** for a first-time Google account is aborted, so the user sees `external_account_not_found` ("The External Account was not found"). The related `external_account_missing_refresh_token` is a Clerk-side warning on the same OAuth callback (Google returns a refresh token only with offline access/consent) and does not by itself block sign-in; its relation must be confirmed by event ID in the Dashboard.
* Fix: headless Clerk flow — own "Lanjutkan dengan Google" button → `signIn.authenticateWithRedirect({strategy:'oauth_google', redirectUrl:'/sso-callback'})`; dedicated **path** route `/sso-callback` handled by `Clerk.handleRedirectCallback()` (performs the transfer); session listener ignores the callback path; Clerk UI bundle no longer loaded.

## RC-3 — Identity-policy errors were invisible — CONFIRMED (UX/observability)
* `/api/auth/me` returned `{user:null}` for every failure. Now returns a safe `auth_error {code,message}` for policy/config errors and logs `{evt:'auth.me.rejected',code}` (no tokens). UI shows the message and offers "Keluar dan gunakan akun Google lain".

## Hardening done in the same change (no policy loosening)
* `CLERK_ISSUER` now **required** (previously optional → issuer check skipped if unset).
* `sub` must be a Clerk `user_…` id; strict base64url parsing; Clerk profile `id` must equal `sub`; banned/locked Clerk users rejected; Google external account must be `verified`.
* Mapped-but-disabled users are rejected (previously fell through to re-provision path).
* Linking an existing email uses `UPDATE … WHERE clerk_user_id IS NULL` (never overwrites a concurrent mapping).

## Rollback
Redeploy the previous Pages deployment from the Cloudflare dashboard (Deployments → `71e7bd5b` → Rollback). Same Clerk Production instance/keys are used by both versions, so no credential mismatch. Note: rollback re-introduces RC-1/RC-2.

## RC-4 — CSP blocked Clerk Protect — CONFIRMED (found during post-deploy browser check)
* Evidence: production browser console: `Loading the script 'https://cdn.protect.clerk.com/ins_3Lzk…/bootstrap.js' violates … script-src`. Clerk `/v1/environment` returns a `protect_config` loader for this instance, and clerk-js 6.42.3 runs `protectCheck` on sign-in/sign-up resources.
* Fix: `src/index.tsx` CSP allows `script-src https://cdn.protect.clerk.com` and `connect-src https://cdn.protect.clerk.com https://*.protect.clerk.com https://*.protect.clerk.com:*` (probes use ports 8443/18443/2082/992) (only when a Clerk key is configured). No other CSP loosening.

## RC-5 — Callback fallback went to the Clerk Account Portal — CONFIRMED
* Evidence: headless browser on `/sso-callback` without OAuth state ended on `https://accounts.oltavyn.biz.id/sign-in` (display_config `sign_in_url`).
* Fix: `handleRedirectCallback` receives `signInUrl/signUpUrl: '/#/login'` so every fallback stays in the app.
