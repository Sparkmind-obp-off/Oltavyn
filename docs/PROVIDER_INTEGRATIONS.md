# OLTAVYN Provider Integrations

Status: Multi-Provider Hub UI and backend adapters are implemented on `feat/multi-provider-hub`; credentials and external calls are not configured or verified.

## Product boundary

- **AVORLUNE** owns the customer-facing business, affiliate media/channels, and future Affiliate OS product.
- **OLTAVYN** is the reusable internal Core Engine: identity, workspaces, evidence, content assets/versions, approvals, experiments, observations, audit, and learning.
- **Affiliate OS** is OLTAVYN's first operational product mode. It owns the affiliate-specific channel registry, product intelligence, scorecards, and provider workbench.
- Providers are replaceable adapters. They are not the product's source of truth.

## Supported adapters

| Provider | Purpose | API path | Required Cloudflare secret |
|---|---|---|---|
| Groq | LLM draft generation | `POST /api/affiliate/providers/groq/generate` | `GROQ_API_KEY` |
| Tavily | Search/research source discovery | `POST /api/affiliate/providers/tavily/search` | `TAVILY_API_KEY` |
| Apify | Explicitly approved Actor run request | `POST /api/affiliate/providers/apify/run` | `APIFY_API_TOKEN` |
| Scrape.ly | Explicitly approved Actor run request | `POST /api/affiliate/providers/scrapely/run` | `SCRAPELY_TOKEN` |

All endpoints require an authenticated OLTAVYN session. Keys are read only from Worker environment bindings; they are never returned by the provider status endpoint, written to D1, or sent to browser JavaScript.

### Groq

Uses the OpenAI-compatible chat-completions endpoint. The endpoint creates a draft only; it does not publish or save content automatically. The selected model is passed explicitly. Verify current model availability, rate limits, retention, and commercial terms in the Groq console before use.

### Tavily

Uses the Search API with basic depth and a small result count. Returned source URLs and excerpts are research leads, not verified product claims. Save relevant results into the OLTAVYN evidence ledger with the capture date, collection method, interpretation, and limitations before relying on them.

### Apify and Scrape.ly

Both adapters accept a caller-supplied Actor ID and JSON input. Each run requires `confirm_run: true`, is rate-limited, and returns the run/dataset identifiers only. The adapter does not select an Actor, retrieve datasets, import records, or publish content automatically. The Multi-Provider Hub UI requires a second explicit browser confirmation and disables execution unless the provider secret is present and the Actor allowlist is non-empty.

Apify uses its documented `/acts/{actorId}/runs` API path. Scrape.ly uses the official `https://api.scrape.ly/v2/actors/{actorId}/runs` endpoint and Bearer-token authentication. Both receive the Actor input object at the top level. The Scrape.ly API base and run path are grounded in the official [API guide](https://scrape.ly/docs/api) and [API overview](https://scrape.ly/docs/api-overview).

**Cost safety:** an Actor run may consume a provider's prepaid balance or paid credits even when the account has a free allowance. Do not call these endpoints unless the operator has inspected the Actor, its input schema, terms, and expected cost, and explicitly confirms that individual run. The confirmation flag is not a spending cap.

## Configure secrets (operator action)

Do not put values in source code, `.env` committed to Git, D1, screenshots, or chat. For a Cloudflare Pages project, add secrets in the Cloudflare dashboard under Workers & Pages → OLTAVYN project → Settings → Variables and Secrets. Add only providers the owner chooses to activate.

For local development, use Wrangler's local secret mechanism or an untracked `.dev.vars` file and keep it out of Git. Example variable names only:

```dotenv
GROQ_API_KEY=
TAVILY_API_KEY=
APIFY_API_TOKEN=
SCRAPELY_TOKEN=
```

No credentials are supplied by this repository. No provider is configured merely because an adapter exists.

## Cost and access snapshot (checked 2026-11-11)

- Tavily currently advertises a free tier with 1,000 API credits/month and no credit card; paid usage is separate. Credit consumption depends on request type. See [Tavily pricing](https://www.tavily.com/pricing).
- Apify currently advertises $5/month in free platform usage; Actor Store pricing, compute, and proxies may still consume usage. See [Apify pricing](https://apify.com/pricing).
- Scrape.ly currently advertises $5 of monthly usage on its free tier, with prepaid balance mechanics. Individual Actors can have their own pricing and usage. See [Scrape.ly pricing](https://scrape.ly/pricing).
- Groq provides API access through API keys; model access and rate limits depend on the current account and model. Do not assume unlimited free inference. See [Groq API reference](https://console.groq.com/docs/api-reference).

Pricing and terms change. Re-check provider dashboards before enabling a run. No payment method, subscription, credit purchase, or paid request is initiated by this code.

## Multi-Provider Hub UI and observability

- `/affiliate` → Provider tab now exposes status cards and separate Groq, Tavily, Apify and Scrape.ly task forms.
- `/api/affiliate/providers` reports configuration-only state and allowlisted Actor IDs; it never reveals secrets.
- `/api/affiliate/providers/usage` aggregates audit-log call counts and last-call timestamps over 30 days. This is not token, credit, balance, or monetary cost metering.
- Actor forms require a JSON object, a visible acknowledgement checkbox, a browser confirmation dialog, server-side `confirm_run: true`, an allowlisted Actor ID, and a per-run spend cap (USD 0.01–1.00), max items (1–100), and timeout (1–120 seconds).
- Apify and Scrape.ly document `maxTotalChargeUsd`, `maxItems`, and `timeout` run options; the hub sends these as query parameters for each run. See [Apify Run Actor](https://docs.apify.com/api/v2/actors-runs-post) and [Scrape.ly Run Actors](https://scrape.ly/docs/run-actors).
- The UI never accepts provider API keys. Configure them only in Cloudflare Pages → Settings → Variables and Secrets.

## Current limitations

- Provider connection status checks only whether a secret binding exists; it does not test or validate the key.
- No scheduled scraping, background polling, automatic dataset import, or automatic content generation from scraped records.
- No direct Shopee private/login scraping, cookie/session handling, CAPTCHA bypass, or account automation.
- Provider output must be reviewed and saved as evidence manually; imported text is untrusted data.
- Do not mark demand, commission, sold counts, product ratings, or seller quality as verified without a source.
- Publishing and affiliate-link creation remain manual and approval-gated.

## Verification gate

Before enabling production use:
1. Apply migration `0002_affiliate_factory.sql` to a clean local D1 database.
2. Run typecheck, build, smoke tests, and workspace-isolation tests.
3. Configure one provider secret in a non-production environment.
4. Test a low-cost request with an owner-approved limit and verify provider usage.
5. Inspect logs to ensure secrets and sensitive tracking URLs are not recorded.
6. Only then request approval for any production migration or deployment.
