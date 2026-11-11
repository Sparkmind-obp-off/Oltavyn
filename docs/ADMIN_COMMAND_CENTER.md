# OLTAVYN Command Center

## Architecture
The customer application and internal Command Center live in the same OLTAVYN repository and share the existing Worker API and D1 database. The first release serves the private console at `/admin` and its protected API at `/api/admin/*`.

This keeps identity, orders, payment callbacks, entitlements, service jobs, and audit history in one source of truth. Do not create a second customer database or copy payment state into another project.

A separate Cloudflare Pages project/custom hostname (for example `admin.<your-domain>`) can be introduced later if operational isolation is needed. It must still call the same trusted API and D1 binding, and must be added to Clerk authorized parties/CORS/CSP deliberately. It is not required to operate the current Command Center.

## Admin authorization
Set the Cloudflare Pages/Worker variable:

- `OLTAVYN_ADMIN_EMAILS`: comma-separated exact email addresses allowed to open the Command Center, e.g. `owner@example.com,ops@example.com`.

The server compares the authenticated OLTAVYN account email against this allowlist on every admin API request. Hiding the URL or a client-side menu is not authorization. Do not put this variable in the public Vite environment. Use exact lowercase email values; no wildcard or domain matching.

For Clerk accounts, use the verified primary email mapped to the OLTAVYN user. The existing Clerk and local-session authentication remain in place. If the email is not on the allowlist, the API returns 403.

## Migration
Apply `migrations/0008_admin_operations.sql` to the target D1 database after migrations 0006 and 0007.

Local validation:
```sh
npm run db:migrate:local
npm run typecheck
npm run build
npm run test:smoke
npm run test:affiliate
```

Do not apply remote migrations or deploy production until the owner explicitly approves and the non-production flow has been verified.

## Current capabilities
- Dashboard: active users, order status counts, verified paid revenue, job status counts, open revisions.
- Order queue: search by customer email/order ID and filter by order status.
- Order detail: payment references/status, customer/workspace, package snapshot.
- Fulfillment: move service jobs through queued, in progress, waiting customer, review, delivered, cancelled.
- Delivery: add HTTPS deliverable links and customer-visible notes.
- Revision management: accept/reject/complete customer requests with package revision limits.
- Activity history: service-job events and audit records.
- Customer order detail: progress, customer-visible deliverables, revision history and revision request form.

## Safety boundaries
- A browser return URL never marks an order paid. Only the verified Duitku server callback can do that.
- Checkout remains disabled unless `DUITKU_CHECKOUT_ENABLED=true` and the merchant credentials are configured.
- Do not store files in public buckets by default. Current deliverables are HTTPS links; use private R2 delivery with expiring access before handling confidential customer assets.
- No automated content publishing or guaranteed sales are implied.
- Admin actions are recorded in audit/job event tables. Avoid placing passwords, API keys, payment secrets, or unnecessary personal data in notes.
- Use HTTPS URLs only for deliverables.
- The allowlist grants full internal admin access; only add trusted operators.

## Operator setup checklist
1. Apply migration 0008 to the intended non-production D1.
2. Add `OLTAVYN_ADMIN_EMAILS` as a server-side Cloudflare variable.
3. Sign in to OLTAVYN with the exact allowlisted account.
4. Open `/admin`.
5. Test dashboard, queue, job status changes, deliverable visibility, revision limits, and audit trail using test orders.
6. Verify customer workspace isolation and confirm a non-admin receives 403 from `/api/admin/dashboard`.
7. Only then consider enabling Duitku sandbox checkout.

## Edge access layer

The Command Center also requires Cloudflare Access at the edge and validates the signed Access JWT in the Pages Function. Configure the team domain, application audience tag(s), and path policies using [CLOUDFLARE_ACCESS_ADMIN_SETUP.md](./CLOUDFLARE_ACCESS_ADMIN_SETUP.md). The existing OLTAVYN session and `OLTAVYN_ADMIN_EMAILS` allowlist remain mandatory after Access validation.
