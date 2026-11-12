# Dashboard → Affiliate OS → AI Agent Recovery Report (2026-11-12)

## Evidence
* Recording 17:50 WIB: Google login succeeded, then the app stayed on the login screen with "Anda sudah masuk. Memuat workspace…".
* Production D1 after the first fix: 3 users provisioned (`user.register.google` audit ×3), 0 workspaces ⇒ backend identity/provisioning works; the failure is after `/api/auth/me`.
* Local reproduction with a valid token: `GET /api/auth/me` returned **`text/html` (SPA shell)** instead of JSON.
* Screenshot `#/pricing`: red alert `$(...).forEach is not a function`.
* Clerk session JWT lifetime measured: **60 s**.

## Root causes
| ID | Status | Component | Mechanism | Fix |
|---|---|---|---|---|
| RC-6 | CONFIRMED · FIXED | `src/routes/auth.ts` `/me` | Handler passed its own `next` into `requireAuth`; `next()` fell through to `app.get('*')`, which finalized an HTML response. The browser's `res.json()` failed → `boot()` set `user=null` → login screen forever, even though the user was provisioned. | `requireAuth(c, async () => {})`; unknown `/api/*` now returns JSON 404 |
| RC-7 | CONFIRMED · FIXED | `public/static/app.js` | `boot()`/`refreshMe()` caught every error (incl. workspace failures) and set `user=null` | Separate `authStatus` / `workspaceStatus`; only a 401 on a protected API logs out; workspace error screen with retry; de-duplicated `refreshMe()` |
| RC-8 | CONFIRMED · FIXED | session transport | Clerk JWT lives 60 s; `/affiliate` never loaded clerk-js, so its `__session` cookie went stale | Backend accepts `Authorization: Bearer`; both apps load clerk-js headless and send a fresh `getToken()` with one 401 retry |
| RC-9 | CONFIRMED · FIXED | pricing page | `$('[data-public-buy]').forEach` (`$` returns one element) | `$$(…)` |
| RC-10 | CONFIRMED · FIXED | navigation | No link from Dashboard to Affiliate OS/Agent; `/affiliate` without session had a dead end; no workspace → message only | Sidebar "Affiliate OS & Agent"; header links "← Dashboard" / "AI Agent"; `/?return=affiliate` allowlisted return target; no workspace → onboarding then back; tabs are deep-linkable (`/affiliate#agent`) |
| RC-11 | CONFIRMED · FIXED | Agent UI | Switching workspace during a pending chat could attach the reply to the wrong conversation; double submit possible | Workspace snapshot guard + disabled-button guard |

## Tests
`npm run test:all` exit 0: agent-tools 55, providers 28, payments 23, agent-approvals ok, cloudflare-access 8, smoke 5, affiliate 3, clerk-identity 21, **auth-routes 8 (new, real Hono app + migrations)**.
New route tests: RC-6 JSON contract, Bearer auth, forged token, JSON 404, workspace isolation, agent conversation isolation, Groq-unavailable honest fallback (message persisted), CSRF with Bearer.
Local Playwright: pricing renders 3 catalog cards with no error; `/affiliate` without session shows login card linking to `/?return=affiliate#/login`; no page errors.

## Not verified (needs a human Google login)
Real browser: login → onboarding → dashboard → Affiliate OS → Agent chat with Groq on production.
