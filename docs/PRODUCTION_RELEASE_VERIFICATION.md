# Production Release Verification — Google auth fix (2026-11-12)

| Item | Value / evidence |
|---|---|
| Deploy path | Cloudflare Pages BYOK (`wrangler pages deploy`, project `oltavyn`, branch `main`) |
| Active Production deployment | `6e56c04e` (https://6e56c04e.oltavyn.pages.dev) built from commit **`965458c`** |
| Intermediate deployments this incident | `def0627b` (`2d811ad`), `24de5c39` (`04da322`) |
| Previous (pre-incident-fix) deployment | `71e7bd5b` (`e5efb9a`) — rollback target |
| Domain | https://oltavyn.biz.id — `/api/health` 200; `*.pages.dev` → 302 canonical |
| `/api/auth/config` | `google_only`, `clerk_enabled: true`, `pk_live_…` |
| `/sso-callback` | 200 HTML (SPA), handled by `Clerk.handleRedirectCallback` |
| Forged `__session` | `/api/auth/me` → `{user:null}`; `/api/workspaces` without session → 401 |
| `/admin` | 302 (Cloudflare Access) — unchanged |
| Browser console (headless Chromium, prod) | Clerk loads; Clerk Protect script + probes allowed; only remaining CSP error is the Cloudflare Web Analytics beacon (unrelated to auth) |
| Clerk instance | Production `ins_3LzkWD3Y8bBxdFt3T7xLqqnGhou`; frontend/backend JWKS kid match |
| Pages secrets present (names only) | CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_JWT_PUBLIC_KEY, GROQ_API_KEY, DUITKU_*, FIRECRAWL_API_KEY, APIFY_API_TOKEN, TAVILY_API_KEY, SCRAPELY_TOKEN, CF_ACCESS_AUD |
| Production / Preview D1 isolation | prod `oltavyn-production` (2456b40f…), preview `oltavyn-preview` (9bf73fdc…) — unchanged |
| D1 migrations | 0001–0010 applied in production; **no new migration** in this fix |
| D1 users after deploy | 0 (no real login performed yet by a human) |

## Not yet verified (requires the owner in a real browser)
Real Google OAuth → Clerk session → D1 user → workspace → Agent chat. See `GOOGLE_OAUTH_PRODUCTION_RUNBOOK.md §3`.

## Rollback
Cloudflare Dashboard → Pages → oltavyn → Deployments → `71e7bd5b` → "Rollback to this deployment". Same Clerk Production keys; no secret changes required. Rolling back re-introduces RC-1…RC-5.
