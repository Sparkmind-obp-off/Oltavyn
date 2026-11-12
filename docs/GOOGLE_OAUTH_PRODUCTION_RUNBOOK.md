# Google OAuth Production Runbook (OLTAVYN)

## 1. Expected configuration (verified 2026-11-12 unless marked)
| Item | Expected | Verified |
|---|---|---|
| Clerk instance | Production `ins_3LzkWD3Y8bBxdFt3T7xLqqnGhou` | ✅ Backend API `/v1/instance` |
| Publishable key | `pk_live_…` → `clerk.oltavyn.biz.id` | ✅ `/api/auth/config` |
| Secret key (Pages secret `CLERK_SECRET_KEY`) | same instance | ✅ JWKS kid match (value not printed) |
| `CLERK_JWT_PUBLIC_KEY` | PEM from `https://clerk.oltavyn.biz.id/.well-known/jwks.json` | present (encrypted) |
| `CLERK_ISSUER` | `https://clerk.oltavyn.biz.id` | ✅ `wrangler.jsonc` env.production |
| `CLERK_AUTHORIZED_PARTIES` | includes `https://oltavyn.biz.id` | ✅ |
| Social providers | only `oauth_google` | ✅ `/v1/environment` |
| Password / phone first factor | disabled | ✅ |
| Sign-up mode | public (Google only) | ✅ |
| Google Cloud redirect URI | `https://clerk.oltavyn.biz.id/v1/oauth_callback` | ⚠️ confirm in Clerk Dashboard → Configure → SSO connections → Google → "Authorized Redirect URI" and compare with Google Cloud Console → APIs & Services → Credentials → OAuth client → Authorized redirect URIs |
| Google OAuth consent screen | Published ("In production") | ⚠️ manual check (Testing mode only allows listed test users) |

## 2. App flow after fix
1. `/` → "Lanjutkan dengan Google" → `signIn.authenticateWithRedirect({strategy:'oauth_google', redirectUrl:'https://oltavyn.biz.id/sso-callback'})`.
2. Google → `clerk.oltavyn.biz.id/v1/oauth_callback` → `https://oltavyn.biz.id/sso-callback`.
3. `/sso-callback` (path, not hash) → `Clerk.handleRedirectCallback()` completes sign-in **or transfers to sign-up** for new Google accounts → session → redirect `/`.
4. SPA → `GET /api/auth/me` (cookie `__session`) → Worker verifies RS256/iss/exp/nbf/sub/azp → fetches Clerk user → requires verified `oauth_google` account + verified primary email → creates/links D1 user (Free plan).
5. First workspace is created by the user in the onboarding screen.

## 3. Manual acceptance test (must be done by a human; automation cannot pass Google login)
1. Open a private window → `https://oltavyn.biz.id`.
2. Click "Lanjutkan dengan Google", pick an account, accept consent.
3. Expected: short "Menyelesaikan login Google…" screen, then the workspace onboarding/dashboard. Sidebar shows "Paket akun: FREE".
4. Create a workspace, open the Agent, send a chat message.
5. Report back: success, or the exact red error text (it now includes a specific message).
6. Engineer verifies: `SELECT COUNT(*) FROM users` in `oltavyn-production` increments; no duplicate rows.

## 4. If it still fails
* Clerk Dashboard → Monitoring/Logs: filter `oauth_callback`, note event ID + error code (do not copy tokens).
* `external_account_missing_refresh_token`: informational unless the app needs Google API access; it does not block sign-in. If it coincides with failures, enable "Always request consent"/offline access is **not** required for OLTAVYN.
* Users stuck from earlier attempts: they already have Clerk accounts; the fixed backend will provision them on next login. No deletion needed.
