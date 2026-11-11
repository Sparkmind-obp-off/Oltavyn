# Provider review register

Status: initial inventory; no provider credential or live request is verified.  
Budget rule: no subscriptions, paid trials, credit purchases or chargeable calls without explicit owner approval.

| Provider | Intended use | Official documentation to verify | Auth/permission review | Cost/quota review | Current status |
|---|---|---|---|---|---|
| Groq | Draft generation only | https://console.groq.com/docs/api-reference | API key; server-side only; confirm current model availability and data terms | Check current model pricing, free limits, overage and retention | IMPLEMENTED_NOT_VERIFIED |
| Tavily | Research discovery | https://docs.tavily.com/ | API key; bounded search; verify retention and permitted use | Check current search credits, limits and paid overage | IMPLEMENTED_NOT_VERIFIED |
| Apify | Explicit Actor runs | https://docs.apify.com/api/v2 | Token; Actor-specific input, access rights and source terms | Actor compute/unit consumption may be billable; estimate per run | IMPLEMENTED_NOT_VERIFIED |
| Scrape.ly | Explicit scraping task/Actor runs | Verify current vendor documentation from provider's official site before use | Confirm API auth and exact task semantics | Verify plan, credits, overage and Actor pricing | IMPLEMENTED_NOT_VERIFIED |
| Shopee | Initial affiliate validation source | Verify current official Affiliate/Seller/Partner documentation and account eligibility | Do not assume public API or affiliate reporting access | Confirm commission/reporting terms and eligibility | PROPOSED |
| TikTok / social channels | Future publishing/analytics | Verify current official developer documentation and app review requirements | OAuth scopes, account eligibility, user consent | Verify API limits and commercial terms | PROPOSED |

## Approval checklist per provider

- [ ] Official docs URL and date checked
- [ ] Account/region eligibility confirmed
- [ ] Intended data and purpose documented
- [ ] OAuth scopes / API key permissions minimized
- [ ] Data retention, deletion and training-use terms reviewed
- [ ] Commercial-use rights reviewed
- [ ] Free quota, expiration, pricing and overage recorded
- [ ] Rate limits and retry rules recorded
- [ ] Provider failure and manual fallback defined
- [ ] Mock contract tests pass
- [ ] Secret stored in Cloudflare secret manager (never repository/chat)
- [ ] Owner approved first real request and any possible spend
- [ ] Provider dashboard usage checked after test

Do not label a provider VERIFIED until a credential is tested in an isolated environment and the provider dashboard confirms usage. A successful API call does not establish commercial rights.
