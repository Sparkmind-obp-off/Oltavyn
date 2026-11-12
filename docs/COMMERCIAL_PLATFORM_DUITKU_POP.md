# OLTAVYN Commercial Platform & Duitku POP Integration Contract

Status: commercial schema/API, customer catalog/order UI, onboarding journey and Clerk integration code committed. Checkout is gated by an explicit Cloudflare flag and remains disabled until Production configuration and tests pass. Code now rejects Duitku Sandbox.
Date: 2026-11-11
Scope: same OLTAVYN application and D1 database; no second product or separate chatbot.
Principles: Rp0-first, Cloudflare-first, no secret in source control, no production migration/deployment without explicit approval.

## 1. Product and operating model

OLTAVYN is the product and canonical operating system. Affiliate OS is its first vertical. One central Agent orchestrates authorized capabilities through a server-owned tool registry.

Commercial layers in the same platform:
- Public catalog: services, packages, scope, deliverables, limitations and prices.
- Customer area: workspace, onboarding, order history, payment state, entitlements, usage and deliverables.
- Operations: service jobs, reviews, revisions, fulfillment and support status.
- Admin: catalog, pricing, orders, payment reconciliation, entitlements and operational queue.
- Billing: Duitku POP one-time checkout first; manual renewal/invoice for monthly managed service until recurring payment is explicitly verified.

Do not create an independent commercial AI chat. The same OLTAVYN Agent serves internal operations and customer workspaces, with role- and entitlement-scoped tools.

## 2. Initial product catalog (hypotheses, not validated market prices)

| SKU | Indicative price | Scope | Explicit exclusions |
|---|---:|---|---|
| Affiliate Starter | Rp99.000 one-time | One product evaluation; 3 content angles/scripts; caption, CTA, hashtag and production brief | No video generation, account access, posting or sales guarantee |
| Campaign Builder | Rp299.000 one-time | Up to 3 candidate evaluations; shortlist; 10 content concepts/scripts; 2-week calendar; storyboard/brief; one revision | No paid scraping, video rendering or publishing included |
| Affiliate Growth | Rp699.000/month | Managed campaign planning; 4 weekly content batches; periodic product review; draft optimization; report from available data | No ad spend, guaranteed sales, account credential handling or automatic publishing |

These are price-test hypotheses. Admin must be able to change price, scope and availability without code. Before checkout is enabled, calculate labor, inference, research, tax, gateway fees, revision burden and gross margin. Never sell a deliverable that the current workflow cannot fulfill.

Future self-service subscriptions are a separate validation phase. Do not publish SaaS quotas or activate auto-renew until usage metering, support costs, cancellation, proration and provider recurring-payment capabilities are verified.

## 3. Commercial data model (additive migration only)

Implemented in `migrations/0006_commercial_platform.sql` as additive tables: `commercial_catalog`, `commercial_orders`, `commercial_order_items`, `commercial_payments`, `commercial_payment_events`, `commercial_entitlements`, and `commercial_service_jobs`. Existing `users` and owner-scoped `workspaces` are reused. Three initial service SKUs are seeded as editable catalog rows. Public package catalog, authenticated customer catalog, order creation/list/detail, first-workspace onboarding and order checkout UI are committed. Admin CRUD, fulfillment/revision UI, usage ledger and invoice documents remain pending.

Money is stored as integer IDR. Keep the immutable purchased scope/price snapshot on order items so later catalog edits cannot rewrite an existing order.

## 4. Duitku POP contract

Official documentation: https://docs.duitku.com/pop/id/

Create invoice:
- POST https://api-prod.duitku.com/api/merchant/createInvoice
- Sandbox: https://api-sandbox.duitku.com/api/merchant/createInvoice
- JSON body includes paymentAmount, merchantOrderId, productDetails, email, returnUrl and callbackUrl; `itemDetails` is sent and its total is kept equal to paymentAmount.
- Headers: Content-Type, x-duitku-timestamp (Unix milliseconds), x-duitku-signature, x-duitku-merchantcode.
- Create-invoice signature: HMAC-SHA256(merchantCode + timestamp, API key).
- Persist returned reference and paymentUrl. Duitku documents repeated identical merchantOrderId requests can return the same response within a five-minute window; do not create duplicate orders or spam invoice requests.

Callback:
- HTTP POST, x-www-form-urlencoded.
- Verify HMAC-SHA256(merchantCode + amount + merchantOrderId, API key) using constant-time comparison.
- Match merchantCode, merchantOrderId, amount, reference and currency/order record. Reject unknown order, wrong amount, wrong merchant, invalid signature and inconsistent reference.
- Treat resultCode 00 as paid only after all checks. Record verified callback events safely and idempotently; invalid callbacks are rejected without storing raw payment credentials.
- Return HTTP 200 only after durable event processing. Callback retries must not grant duplicate entitlements.
- JS callback and returnUrl are UI signals only. Never grant entitlement or mark an order paid from browser parameters.
- Reconcile ambiguous/pending states against Duitku's server-side transaction status/query facility before granting access.

Credentials must exist only as Cloudflare Worker secrets. Secret names (set only after merchant project details are confirmed):
- DUITKU_MERCHANT_CODE
- DUITKU_API_KEY
- DUITKU_BASE_URL (optional; defaults to sandbox; only sandbox and production official hosts are accepted)
- DUITKU_CHECKOUT_ENABLED (must equal `true` to expose purchase actions; default disabled)
- PUBLIC_APP_URL (optional canonical HTTPS origin; defaults to the OLTAVYN Pages origin)
- DUITKU_CALLBACK_URL and DUITKU_RETURN_URL should be derived from configured canonical origin, not user input.

Never put the API key in frontend JavaScript, HTML, D1, logs, GitHub or chat. Never accept arbitrary callback/return URLs from the client.

## 5. Required endpoints and lifecycle

Customer:
- GET /api/public/catalog (read-only catalog before sign-up)
- GET /api/commercial/catalog (authenticated catalog plus checkout readiness)
- GET /commercial/catalog/:sku
- POST /commercial/orders (authenticated; server computes all prices and snapshots scope)
- GET /commercial/orders
- GET /commercial/orders/:id
- POST /commercial/orders/:id/checkout (authenticated; creates one Duitku invoice idempotently)
- GET /commercial/orders/:id/status (database state only)

Provider:
- POST /api/webhooks/duitku/pop (public route; signature + amount + merchant + reference verification; idempotent event processing)
- Optional admin-only reconciliation endpoint; never expose secret or raw provider errors.

Admin:
- CRUD catalog/prices/deliverables
- Order and payment queue
- Manual payment reconciliation with reason and audit event
- Grant/revoke entitlement with reason
- Service job workflow: queued → in_progress → review → revision (bounded) → delivered / cancelled.

Order state: draft → pending_payment → paid → queued → in_progress → review → delivered. Alternate terminal states: expired, failed, cancelled, refunded. Do not allow client-side state mutation.

Payment state: created → pending → paid / failed / expired / refunded. Store raw callback payload only if necessary and redact personal data; prefer a safe normalized subset plus payload hash.

## 6. Security and business invariants

- Every customer read/write is authenticated and workspace-scoped.
- Price and product eligibility are resolved server-side; client never supplies trusted amount.
- Orders snapshot SKU, scope, unit price, quantity and currency.
- Unique merchantOrderId; idempotent checkout and callback processing.
- Verify callback signature and amount before state transition.
- Only paid, verified orders receive entitlements.
- Entitlement limits are enforced server-side by Agent tools and service-job creation.
- A customer cannot invoke internal admin tools or another customer's data.
- No credential, OTP, cookie or affiliate account session collection.
- No auto-posting or guaranteed earnings claims.
- Refund, cancellation, expiry and dispute handling must revoke or adjust entitlements according to an auditable policy.
- All admin mutations and payment transitions are audited.

## 7. Agent capability and permission plan

One orchestrator, specialist task profiles. Tool groups:
- R0: read workspace, catalog, order status, evidence, product and channel data.
- R1: approved web research with quota and source capture.
- W1: prepare draft, brief, storyboard, report preview.
- W2: save content, create service job, change product state; approval-bound.
- P1: metered research/Actor runs; per-run cost estimate, allowlist and explicit approval.
- P2: external publishing or account side effects; disabled until official supported integration and approval UX exist.

Customer-facing Agent tools must additionally check entitlement and remaining quota. Model output cannot authorize a tool, grant payment status, set price or bypass workspace ownership.

## 8. Implementation gates

1. Agent tool-calling and four read-only tools are committed; build/typecheck/tests still need execution.
2. Additive commercial schema and initial catalog seed are committed; remote migration is not applied.
3. Authenticated APIs exist for catalog, order creation/list/detail and Duitku checkout; prices and scope are server-resolved and snapshotted.
4. Public Duitku callback route verifies HMAC, merchant, amount and reference; successful callbacks idempotently grant entitlements and queue service jobs.
5. Add local migration and mocked tests for order snapshot, pricing, ownership, checkout idempotency, signature, callback replay and entitlement idempotency.
6. Customer catalog, first-workspace onboarding, order history and order-detail UI are committed. Add admin catalog/operations UI, usage ledger and reconciliation flow.
7. Configure sandbox credentials and run sandbox end-to-end; review privacy, terms, refunds, tax and support.
8. Obtain explicit owner approval before remote D1 migration, production secrets, merchant production mode or deployment.

Current status: Agent tool-calling, commercial D1 migration, seeded catalog, authenticated order APIs, Duitku invoice adapter, signed callback/entitlement flow, customer package catalog, order history/detail UI, first-workspace onboarding, and optional Clerk auth integration are committed. Changes have NOT been typechecked, built, or run against local/sandbox D1 or a live Clerk instance in this session. No remote migration, Clerk secret, Duitku secret, invoice, production payment, or deployment has been performed. Admin operations UI, fulfillment/revision UI, usage ledger, and reconciliation UI remain pending.


## 10. Duitku POP Production-only policy (2026-11-12)

OLTAVYN now targets Production only:
- API base: `https://api-prod.duitku.com`
- Create Invoice: `https://api-prod.duitku.com/api/merchant/createInvoice`
- Payment redirect host allowlist: `app-prod.duitku.com`
- Sandbox endpoint and `app-sandbox.duitku.com` are rejected by application configuration.
- If `DUITKU_BASE_URL` is absent, the application defaults to the Production base URL; if it is set to anything other than the exact Production URL, checkout fails closed.
- Required Cloudflare Worker secrets: `DUITKU_MERCHANT_CODE`, `DUITKU_API_KEY`.
- Production variable: `DUITKU_BASE_URL=https://api-prod.duitku.com`.
- Production variable: `PUBLIC_APP_URL` must be the canonical HTTPS domain serving OLTAVYN.
- Keep `DUITKU_CHECKOUT_ENABLED=false` until merchant credentials, callback reachability, callback signature, event idempotency, payment reconciliation, order/entitlement/job state and customer/admin journeys are verified. The owner must separately authorize customer-facing activation.
- Do not expose secret values to GitHub, Genspark, browser code, logs or chat. Confirm only presence/configuration state.
- Do not create a real payment as a test. A live financial transaction requires separate explicit approval.

Official reference: https://docs.duitku.com/pop/id/ (Production endpoint, request signature, callback signature, payment URL response and prohibition on trusting browser return parameters).
