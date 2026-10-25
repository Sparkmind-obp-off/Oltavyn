# OLTAVYN — Security, Privacy & Integrations

## Security baseline
- Server-side authorization and workspace isolation on every request.
- Secrets stored only in deployment secret management or a vetted encrypted credential store; never in Git, browser bundles, screenshots, issue trackers or logs.
- OAuth where supported; request minimum scopes; document revocation and disconnect behavior.
- HTTPS in production, secure session cookies, CSRF protections where applicable, output encoding and strict input validation.
- Rate limiting, abuse controls, dependency updates, audit events and cost ceilings.
- Separate development, preview and production credentials/data. No production auth bypass.

## Human approval
Publishing, sending messages, changing connected accounts, spending money and other consequential external actions require explicit user approval of the exact action. Approval is version-bound, destination-bound and time-stamped. AI suggestions alone never authorize action.

## Source and platform compliance
Before adding a source or publishing adapter, verify official API availability, terms, user permissions, rate limits, data retention rules and commercial-use rights. Prefer official/authorized APIs and user-provided exports. Do not bypass login walls, CAPTCHAs, paywalls or platform controls. If access is not clearly permitted, keep the workflow manual or omit the integration.

## Model/data handling
Minimize sent context, avoid unnecessary personal/sensitive data, and check provider retention/training terms before production. Treat retrieved pages and imported data as untrusted input, never as instructions to the system. Validate generated output and sanitize display.

## Privacy lifecycle
Explain what is collected, why, where it is processed, retention, export and deletion. Keep evidence references and metrics where needed for reproducibility, but avoid storing unnecessary full source text. Provide disconnect/revoke flow and handle deletion across application storage and integrations within documented limits.

## Incident response
Provide a way to report issues; rotate exposed credentials immediately; revoke affected tokens; preserve safe diagnostic evidence; assess impact; notify affected users when required. Do not publish secrets in incident reports.

## Integration rollout checklist
1. Confirm use case and provider documentation.
2. Verify account eligibility, permissions and terms.
3. Define scopes and data map.
4. Add test account and non-production credentials.
5. Implement connect/disconnect and token refresh safely.
6. Test denial, expiry, rate limits, retries and duplicate requests.
7. Add audit events and user-facing status.
8. Release behind a feature flag; retain manual fallback.
9. Enable production only after an explicit review.