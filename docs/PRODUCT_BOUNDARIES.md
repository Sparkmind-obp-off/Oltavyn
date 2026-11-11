# OLTAVYN and Affiliate OS — Product Boundaries

## Ownership and positioning

### AVORLUNE — parent business

AVORLUNE is the business and customer-facing brand. It owns the commercial strategy, customer relationships, affiliate media/channels, and future customer-facing products. Creative Production and Affiliate Media remain distinct business lines with separate acquisition messages and calls to action.

### OLTAVYN — Core Engine

OLTAVYN is the reusable internal technology engine. It provides shared capabilities:

- Authentication, sessions, and workspace isolation
- Evidence ledger and provenance
- Opportunities and decision records
- Content assets, immutable versions, and claim mapping
- Human approval gates
- Experiments, observations, and learning
- Audit, export, and deletion controls
- Replaceable external provider adapters

OLTAVYN should remain platform-neutral. It is not renamed to Affiliate OS and is not limited to Shopee or affiliate marketing.

### Affiliate OS — first operating product

Affiliate OS is the first focused operating product built on OLTAVYN. It adds affiliate-specific workflows:

- Channel registry
- Product intelligence and evidence mapping
- Transparent product scorecards
- Product-to-content preparation
- Manual affiliate-link and publishing records
- Commission and performance learning as evidence becomes available

The initial validation market is Shopee Affiliate Indonesia. That is a starting use case, not a permanent platform restriction.

## Technical composition

```
AVORLUNE (business / owner)
├── Affiliate Media (owned channels and commission operations)
├── Creative Production (customer-facing creative services)
└── Affiliate OS (operating product)
    └── OLTAVYN Core Engine
        ├── Identity and workspaces
        ├── Evidence and opportunities
        ├── Content and approvals
        ├── Experiments and learning
        └── Provider adapters
            ├── Groq (LLM)
            ├── Tavily (web research)
            ├── Apify (approved Actors)
            └── Scrape.ly (approved Actors)
```

## Deployment boundary

The existing `oltavyn.pages.dev` deployment is the known OLTAVYN application endpoint. `affiliate-os.avorlune.biz.id` is a candidate hostname for the Affiliate OS workbench; this repository change does not configure DNS, Cloudflare Pages custom domains, D1 bindings, secrets, or deployment.

## Product and data boundaries

- OLTAVYN owns canonical user/workspace/evidence/content/approval/experiment records.
- Affiliate OS owns affiliate-specific product/channel/scorecard records and references the core evidence ledger.
- Provider data is untrusted input. Preserve source URL, capture time, method, excerpt, interpretation, and limitations when promoting it into evidence.
- Unknown values remain NULL, never zero.
- External providers are optional. A missing key must not break manual product entry or the core engine.
- Publishing, affiliate-link creation, account changes, and spending remain human-approved.
- Customer-facing AVORLUNE services must not expose internal provider implementation details.

## Domain evolution

Keep Affiliate OS in the OLTAVYN repository while it shares the same auth, database, release cadence, and security boundary. Consider a separate repository only when independent deployment, tenancy, database, team ownership, or release lifecycle becomes necessary.
