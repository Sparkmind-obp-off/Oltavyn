# Authentication Security Test Report — 2026-11-12

Command: `npm run test:all` (exit 0). All tests are **mocked/local**; none proves real Google OAuth.

| Group | Command | Passed | Failed | Type |
|---|---|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ | 0 | static |
| Build | `vite build` | ✅ | 0 | build |
| Agent tool-calling | `test:agent-tools` | 55 | 0 | mocked Groq |
| Providers (SSRF etc.) | `test:providers` | 28 | 0 | mocked |
| Payments (Duitku) | `test:payments` | 23 | 0 | mocked, no charge |
| Agent approvals | `test:agent-approvals` | ok | 0 | local SQLite |
| Cloudflare Access | `test:cloudflare-access` | 8 | 0 | mocked JWT |
| Smoke | `test:smoke` | 5 | 0 | local wrangler |
| Affiliate smoke | `test:affiliate` | 3 | 0 | local wrangler |
| **Clerk identity / JWT / D1** | `test:clerk-identity` | **21** | 0 | real RSA keys, real migrations on node:sqlite, mocked Clerk API |

Clerk identity coverage: `oauth_google` ✓, `google` alias ✓, Microsoft/Apple/GitHub/unknown/missing rejected ✓, unverified external account ✓, unverified email ✓, missing primary email ✓, banned/locked ✓, disabled mapped account ✓, identity conflict (mapping not overwritten) ✓, concurrent first login → 1 user ✓, existing mapping skips Clerk API ✓, verified-email linking ✓, disabled local account not linked ✓, profile id ≠ sub ✓.

JWT coverage: valid token ✓, invalid signature ✓, Development issuer rejected ✓, expired ✓, nbf future ✓, missing sub ✓, non-`user_` sub ✓, wrong/missing azp ✓, HS256/none alg ✓, empty/malformed/2-segment ✓, tampered payload ✓, missing issuer/public key config → 503 ✓, 30 s skew ✓.

Not covered (requires human): real Google OAuth, real Clerk session cookie on production, Agent chat with a real user.
