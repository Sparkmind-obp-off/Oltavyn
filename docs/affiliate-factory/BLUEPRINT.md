# Faceless Affiliate Content Factory — Technical Blueprint

## 1. Architecture

Use a modular monolith inside the existing OLTAVYN Hono application.

```
Permitted sources / manual research / owner exports
                    |
                    v
          Product Intelligence
          - intake and dedupe
          - source/evidence ledger
          - transparent scorecard
                    |
                    v
          Content Intelligence
          - audience problem
          - content angle and hook
          - script and storyboard
          - claim-to-evidence checks
                    |
                    v
          Existing OLTAVYN Content Studio
          - immutable content versions
          - human review and approval
                    |
                    v
          Manual Publishing Operations
          - channel-specific package
          - owner publishes manually
          - publication URL recorded
                    |
                    v
          Existing Experiments + Observations
          - views, retention, clicks, orders, commission
          - observed / unavailable / not collected / failed
                    |
                    v
          Existing Learning Summary
          - compare like-for-like metrics
          - recommend next test with uncertainty
```

No microservices. No separate database. No external AI dependency in Phase 1.

## 2. Domain modules

### A. Channel Registry
Stores each owned/operated distribution channel, its platform, category, handle, status, and destination URL. Channel identity and affiliate account identity are separate: a channel is not itself proof of Shopee affiliate approval.

Initial supported platform identifiers: `shopee_video`, `tiktok`, `instagram`, `youtube`, `facebook`. Add another platform only after its workflow and rules are reviewed.

### B. Product Intelligence
Stores product candidates, marketplace identity, canonical product URL, observed price, commission information when available, public seller/product signals, evidence state, and lifecycle status. Unknown values remain NULL; never coerce unknown to zero.

### C. Evidence and provenance
Reuse `evidence_items`. Product-to-evidence relationships are stored in `affiliate_product_evidence`. A source excerpt is not the same as the operator's interpretation. Record collection method and limitations.

### D. Product Scorecard
Scores are decision aids, not objective truth. Every dimension is 1–5 and must have a short rationale. A missing dimension stays NULL and the total must not be presented as complete.

Initial weighted rubric:
- Demand evidence: 25%
- Product quality signals: 20%
- Commission potential: 20%
- Faceless visual/demo potential: 15%
- Price/accessibility: 10%
- Seller risk: 10% (reverse direction: higher risk lowers the score)

For implementation, normalize risk as `6 - seller_risk`. Only calculate a weighted total when all six dimensions are present. Formula:
`(demand*0.25 + quality*0.20 + commission*0.20 + visual*0.15 + price*0.10 + (6-risk)*0.10) * 20`
Result range: 20–100. Display the dimension scores and rationales beside the total. Store the rubric version so later changes do not rewrite old decisions.

### E. Content Factory
Phase 1 reuses the existing opportunity and content asset/version model. Do not create a parallel content system. A selected product can be represented by an opportunity with links to supporting/challenging evidence. Future content-generation adapters must emit claims with evidence IDs and use the existing approval flow.

### F. Publishing and learning
Publishing remains manual. A user must approve the exact content version and destination before recording it as published. Use existing `experiments` and `observations`; `affiliate_experiment_products` associates an experiment with the relevant product, channel, and manually generated affiliate link.

## 3. Product lifecycle

`candidate → shortlisted → selected → archived`

A product may instead be `rejected`. Status changes should be auditable. Selection does not imply that the product has verified commission or demand.

## 4. Security and tenancy

- Every new record is scoped to a workspace.
- Every route must resolve the authenticated user and verify workspace ownership before reading or writing.
- Foreign keys enforce relational integrity; application checks enforce same-workspace relationships.
- Do not store platform credentials, browser cookies, OTPs, or private account data.
- URLs are untrusted input: validate scheme (HTTP/HTTPS), length, and reject javascript/data schemes.
- Treat imported titles, seller text, and product descriptions as untrusted data, never as system instructions.
- Avoid logging raw affiliate URLs if they contain private tracking identifiers; restrict export and audit fields appropriately.

## 5. Provider strategy

Phase 1 is provider-neutral and manual/import-first. External providers are adapters, not dependencies. Before enabling any provider, verify:
- permitted data source and current terms;
- free-tier/credit balance and whether a payment method is required;
- commercial-use rights for generated assets;
- data retention and credential handling;
- explicit owner approval for any cost.

## 6. Non-goals

No multi-user SaaS, auto-posting, browser automation against Shopee, scraping private endpoints, paid actors, automatic link generation, or autonomous purchase/advertising spend.
