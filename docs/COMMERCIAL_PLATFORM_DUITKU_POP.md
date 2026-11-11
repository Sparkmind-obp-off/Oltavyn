# OLTAVYN Commercial Platform & Duitku POP Integration Contract

Status: implementation specification; payment integration is NOT enabled yet.
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

Inspect existing schema and avoid duplicate concepts before creating tables. Proposed entities:
- catalog_products: sku, name, description, product_type, active, sort_order, timestamps.
- catalog_prices: product_id, currency, amount_minor, billing_interval, effective dates.
- catalog_deliverables: product_id, key, description, quantity, unit, constraints.
- customer_workspaces: workspace_id, billing_owner_user_id, display/business profile.
- orders: public order number, workspace/user owner, status, subtotal, discount, total, currency, immutable item snapshot, timestamps.
- order_items: order/product/price snapshot, quantity, unit amount, total, scope snapshot.
- payments: order_id, provider, provider_reference, merchant_order_id, amount, status, payment_url, expiry, callback metadata hash, timestamps.
- payment_events: provider event identity/hash, verified flag, event type, safe metadata, received time; idempotent.
- entitlements: workspace, product/plan, source order, status, limits, start/end, granted/revoked timestamps.
- usage_ledger: workspace, entitlement, capability, quantity, source job, timestamp.
- service_jobs: order, workspace, job type, status, assigned operator, brief, deliverables, review/revision state.
- invoices: invoice number, order/subscription reference, due date, status.

Money is stored as integer IDR. Keep the immutable purchased scope/price snapshot on order items so later catalog edits cannot rewrite an existing order.

## 4. Duitku POP contract

Official documentation: https://docs.duitku.com/pop/id/

Create invoice:
- POST https://api-prod.duitku.com/api/merchant/createInvoice
- Sandbox: https://api-sandbox.duitku.com/api/merchant/createInvoice
- JSON body includes paymentAmount, merchantOrderId, productDetails, email, returnUrl and callbackUrl; use optional itemDetails/customerDetail only when needed.
- Headers: Content-Type, x-duitku-timestamp (Unix milliseconds), x-duitku-signature, x-duitku-merchantcode.
- Create-invoice signature: HMAC-SHA256(merchantCode + timestamp, API key).
- Persist returned reference and paymentUrl. Duitku documents repeated identical merchantOrderId requests can return the same response within a five-minute window; do not create duplicate orders or spam invoice requests.

Callback:
- HTTP POST, x-www-form-urlencoded.
- Verify HMAC-SHA256(merchantCode + amount + merchantOrderId, API key) using constant-time comparison.
- Match merchantCode, merchantOrderId, amount, reference and currency/order record. Reject unknown order, wrong amount, wrong merchant, invalid signature and inconsistent reference.
- Treat resultCode 00 as paid only after all checks. Record all valid/invalid callback attempts safely and idempotently.
- Return HTTP 200 only after durable event processing. Callback retries must not grant duplicate entitlements.
- JS callback and returnUrl are UI signals only. Never grant entitlement or mark an order paid from browser parameters.
- Reconcile ambiguous/pending states against Duitku's server-side transaction status/query facility before granting access.

Credentials must exist only as Cloudflare Worker secrets. Proposed names, subject to verification against the merchant project:
- DUITKU_MERCHANT_CODE
- DUITKU_API_KEY
- DUITKU_BASE_URL (optional; defaults to production only after merchant activation)
- DUITKU_CALLBACK_URL and DUITKU_RETURN_URL should be derived from configured canonical origin, not user input.

Never put the API key in frontend JavaScript, HTML, D1, logs, GitHub or chat. Never accept arbitrary callback/return URLs from the client.

## 5. Required endpoints and lifecycle

Customer:
- GET /commercial/catalog
- GET /commercial/catalog/:sku
- POST /commercial/orders (authenticated; server computes all prices and snapshots scope)
- GET /commercial/orders
- GET /commercial/orders/:id
- POST /commercial/orders/:id/checkout (authenticated; creates one Duitku invoice idempotently)
- GET /commercial/orders/:id/status (database state only)

Provider:
- POST /webhooks/duitku/pop (public route; signature + amount + merchant + reference verification; idempotent event processing)
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

1. Complete agent tool-calling integration and run typecheck/build/tests.
2. Inspect D1 migrations and authentication roles before commercial schema work.
3. Add local-only migration and tests for order snapshot, pricing, ownership, idempotency and entitlement.
4. Implement Duitku adapter with mocked tests for signature, callback, amount mismatch, replay and duplicate callback.
5. Verify sandbox merchant credentials and test sandbox end-to-end.
6. Review privacy policy, terms, refund policy, tax and customer support process.
7. Obtain explicit owner approval before remote D1 migration, production secrets, merchant production mode or deployment.

Current status: Agent chat tool-calling has been connected to the existing four R0 tools in source control. Commercial catalog, orders, Duitku checkout/webhook, entitlement and service-job implementation remain pending; no payment is currently accepted by OLTAVYN.
