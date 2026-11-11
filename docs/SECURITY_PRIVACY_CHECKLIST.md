# OLTAVYN security and privacy checklist

Status: working checklist; not a security certification or completed audit.

## Identity and authorization

- [ ] Authentication/session lifecycle reviewed
- [ ] Session cookies are HttpOnly; Secure in production; SameSite configured
- [ ] CSRF protection covers every state-changing route
- [ ] Login/register rate limits and abuse controls tested
- [ ] Every private route enforces server-side user and workspace ownership
- [ ] Affiliate products, channels, evidence links, scorecards and experiments tested against IDOR/cross-workspace access
- [ ] Logout, session revocation and password-change behavior verified

## Input, output and application security

- [ ] Request schemas and size limits enforced
- [ ] SQL queries parameterized
- [ ] HTML output escaped/sanitized; no unsafe dynamic script execution
- [ ] SSRF, open redirect, path traversal and unsafe URL handling reviewed
- [ ] Provider/model output treated as untrusted data
- [ ] Prompt injection from retrieved pages and Actor datasets cannot override system rules or trigger tools
- [ ] Error messages are sanitized and do not expose stack traces, keys or private records

## Secrets and integrations

- [ ] Provider secrets stored only in Cloudflare secret bindings
- [ ] Secrets never returned to browser, written to D1, committed or logged
- [ ] Separate local/preview/production credentials
- [ ] Least privilege and rotation/revocation process documented
- [ ] Provider timeout, rate limits, retries and idempotency tested
- [ ] Paid/credit-consuming jobs require explicit per-run approval and enforceable limits
- [ ] No external calls occur on page load or without user action

## Data protection

- [ ] Data minimization and purpose documented
- [ ] Evidence source, capture date and limitations retained
- [ ] Workspace export verified
- [ ] Hard-delete behavior and backup-retention limitations documented
- [ ] Audit log avoids secrets and unnecessary content
- [ ] Retention/deletion obligations for external providers reviewed
- [ ] Incident response and credential-exposure playbook documented

## Release evidence

| Control | Evidence | Status |
|---|---|---|
| Authentication/CSRF | Automated tests and manual walkthrough required | BLOCKED |
| Workspace isolation | Automated negative tests required | BLOCKED |
| Secret redaction | Mock provider tests and log review required | PROPOSED |
| Provider cost controls | Budget/approval implementation and tests required | PROPOSED |
| Export/delete | Smoke test and database inspection required | IMPLEMENTED_NOT_VERIFIED |
| Privacy/legal review | Qualified review where required | BLOCKED |

Do not describe this checklist as passed until each relevant item has evidence. A checklist is not a penetration test, legal opinion, or compliance certification.
