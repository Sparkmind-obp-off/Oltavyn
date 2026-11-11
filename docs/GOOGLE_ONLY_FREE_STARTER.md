# OLTAVYN — Google-only Free Starter Rollout

## Product decision
All customers use Google Sign-In only. A verified Google account creates or links one OLTAVYN identity. No OLTAVYN email/password login or registration is supported.

## Free Starter offer
- Price: Rp0 permanently.
- Workspace allowance: one, enforced server-side.
- No payment card, no auto-renewal, no expiry.
- Core workflow and manually entered data are available.
- Paid external research, Actors, production service and other provider-cost operations are excluded unless a separately approved allowance or paid package is introduced.

## Customer journey
1. Visitor opens the public pricing page.
2. Visitor selects “Mulai gratis dengan Google”.
3. Clerk presents Google as the only sign-in/sign-up provider.
4. First successful verified Google sign-in creates or links the OLTAVYN user and provisions `free_starter`.
5. Customer creates their first workspace and starts using OLTAVYN.
6. Sidebar identifies the current plan as Free Starter.
7. Additional workspace requests are blocked with an upgrade explanation.

## Implementation
- Auth policy: `src/routes/auth.ts`.
- Customer UI: `public/static/app.js`.
- Free plan schema: `migrations/0009_google_only_free_starter.sql`.
- Workspace limit: `src/routes/domain.ts`.
- Clerk setup: `docs/CLERK_AUTH_SETUP.md`.

## Not yet included
There is no numeric monthly AI quota or metered credits ledger yet. Do not market the Free Starter plan as unlimited. Do not grant free access to paid provider APIs. Add a usage ledger and per-feature enforcement before introducing numeric generation/research quotas.

## Release gate
This implementation is on a feature branch. Apply the migration to Preview D1, configure the Clerk development instance with Google only, test Google OAuth and the 1-workspace limit, then run the project typecheck/build and smoke tests. Production deployment and Production D1 migration require a separate release approval.
