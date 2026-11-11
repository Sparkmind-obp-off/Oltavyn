# OLTAVYN QA test matrix

Status: test plan. Populate actual command output, test count, commit SHA and date after execution.

| Domain | Test scenario | Expected result | Current status |
|---|---|---|---|
| Install | `npm ci` | Lockfile installs without error | BLOCKED pending execution |
| Type safety | `npm run typecheck` | Exit code 0 | BLOCKED pending execution |
| Build | `npm run build` | Production bundle created | BLOCKED pending execution |
| Migration | `npm run db:migrate:local` on clean state | All migrations apply in order | BLOCKED pending execution |
| Auth | Register/login/logout/session expiry | Correct state and safe errors | IMPLEMENTED_NOT_VERIFIED |
| CSRF | State-changing request without valid token | Rejected | IMPLEMENTED_NOT_VERIFIED |
| Core isolation | User A cannot access User B workspace/resources | 403/404 without data leak | IMPLEMENTED_NOT_VERIFIED |
| Affiliate products | Create/read/update scoped product | Owner-only access | BLOCKED pending execution |
| Affiliate channels | Create/read/update scoped channel | Owner-only access | BLOCKED pending execution |
| Evidence association | Link evidence in same workspace; reject foreign evidence | Valid link accepted; foreign link rejected | BLOCKED pending execution |
| Scorecard | Partial score remains NULL; complete dimensions calculate transparently | No invented/default scores | BLOCKED pending execution |
| Provider status | Missing secret shows not configured; present secret not called verified | Accurate status label | IMPLEMENTED_NOT_VERIFIED |
| Groq adapter | Mock success, malformed output, timeout, quota error | Validated draft or sanitized error | PROPOSED |
| Tavily adapter | Mock results, duplicate URL, malformed result | Bounded research leads with provenance | PROPOSED |
| Apify/Scrape.ly | Mock run, missing confirmation, timeout, duplicate request | No run without explicit confirmation; idempotent status | PROPOSED |
| Approval | Edit content after approval | Previous approval invalidated by hash/version mismatch | IMPLEMENTED_NOT_VERIFIED |
| Publishing | Manual log requires URL/reason | Honest publication state | IMPLEMENTED_NOT_VERIFIED |
| Observation | Missing value differs from zero | NULL/status preserved | IMPLEMENTED_NOT_VERIFIED |
| Learning | Summary references recorded data only | No fabricated metrics | IMPLEMENTED_NOT_VERIFIED |
| Export/delete | Export valid; delete requires confirmation and removes scoped data | Data lifecycle honored | IMPLEMENTED_NOT_VERIFIED |
| UI | Empty/loading/error/success/responsive/accessibility | Clear actionable states | BLOCKED pending walkthrough |

## Required CI commands

```bash
npm ci
npm run typecheck
npm run build
npm run db:migrate:local
npm run dev:sandbox
npm run test:smoke
```

The smoke test server must run in a separate process/terminal. Provider tests must use mocks; CI must not spend credits or depend on provider secrets. Record actual outputs; never fill this matrix with assumed passes.
