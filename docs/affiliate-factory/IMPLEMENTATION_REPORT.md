# Affiliate OS — implementation report (Phase 3)

Date: 2026-11-11 · Branch: `feat/faceless-affiliate-factory-phase1` · PR #1 (Draft)

This document describes **only what is implemented and tested in this branch**. "Implemented", "tested", "configured", "validated", "deployed" and "verified" are used in their strict sense.

## 1. Gap matrix (Step 0 → closed)

| Requirement | Before (a84be76) | Now | Evidence |
|---|---|---|---|
| Typecheck/build/migrations on branch | Not run | Pass | `npm run typecheck`, `npm run build`, clean local D1 0001→0003 |
| Channel CRUD | create/list/patch | + detail, archive, platform edit, duplicate handle → 409, archived filter | `tests/affiliate-smoke.mjs` |
| Product CRUD | create/list/patch | + detail (evidence, scorecards, packages, experiments), search, filter, archive, canonical-URL dedupe → 409, strict URL parse, integer checks | smoke |
| Unknown vs zero | NULL handled | Tested: `0` kept, empty → NULL | smoke "real zero kept; unknown metrics stay NULL" |
| Evidence linking | Link auto-set `verified` (unsafe) | Link never auto-verifies; `verified` requires ≥1 `supports` link; unlink endpoint; state reverts when last support removed | smoke |
| Scorecard | API only, no audit | Rationale required per scored dimension, total only when 6/6, history, `missing_dimensions`, audit, UI editor | smoke + `tests/providers.test.ts` (20/71/100/null) |
| Content pipeline | Not present | `POST /products/:id/content-packages` → existing Content Studio asset + immutable v1 (15/30/60s) | smoke |
| Approval binding | Core only | Packages flow into existing exact-hash + destination approval | smoke |
| Manual publishing ↔ product | Table only | Link/unlink experiment↔product↔channel; requires approved experiment; tracking URL private | smoke |
| Export/delete | Ignored affiliate tables | Included (tracking URLs excluded); delete cascades explicitly | smoke |
| Cross-workspace isolation | Not tested | 14 negative tests | smoke "Isolation" |
| Provider safety | Forwarded upstream error bodies; no timeout; no allowlist; status = "configured" | Timeout 15 s, error mapping, no upstream body, kill switches, Actor allowlist, `configured_unverified` state, injectable fetch | `tests/providers.test.ts` 29/29 |
| Operator UI | Two forms + tables | Tabs: overview/next action, products, product detail (edit, evidence, scorecard, pipeline, experiments), channels, providers & cost | browser console check: 0 errors |
| Release verification | CI workflow intentionally removed per owner policy | Manual local verification via `npm run test:all`; preview release is operator-triggered | `docs/MANUAL_RELEASE_AND_PROVIDER_RUNBOOK.md` |

## 2. Data model

Migrations (additive): `0002_affiliate_factory.sql` (channels, products, product_evidence, scorecards, experiment_products) and **new** `0003_affiliate_content_packages.sql`:

`affiliate_content_packages(id, workspace_id→workspaces, product_id→affiliate_products, asset_id→content_assets, channel_id→affiliate_channels NULL, duration_seconds ∈ {15,30,60}, generator, created_by, created_at)`

Relationships: product 1—N evidence links (N—1 `evidence_items`), product 1—N scorecards (append-only), product 1—N content packages (1—1 `content_assets` → immutable `content_versions` → `approvals`), product N—N experiments via `affiliate_experiment_products` (+ channel, private `affiliate_url`).

**Rollback 0003:** `DROP TABLE affiliate_content_packages;` (nothing depends on it). Rollback 0002 would drop all affiliate data — only after export.

## 3. API reference (all under `/api/affiliate`, session required, JSON only, CSRF/origin guard)

| Method & path | Purpose |
|---|---|
| `GET /rubric` | Rubric weights/version, allowed durations |
| `GET /workspaces/:ws/summary` | Counts + next action |
| `GET/POST /workspaces/:ws/channels` (`?status=`) | List / create |
| `GET/PATCH /channels/:id` | Detail / edit / archive (`status:"archived"`) |
| `GET/POST /workspaces/:ws/products` (`?status=&q=`) | List (latest score, evidence count) / create |
| `GET/PATCH /products/:id` | Detail (evidence, scorecards, packages, experiments) / edit / archive |
| `GET/POST /products/:id/evidence`, `DELETE /products/:id/evidence/:evidenceId` | Evidence links |
| `GET/POST /products/:id/scorecards` | History / new version |
| `POST /products/:id/content-packages` | `{opportunity_id, duration_seconds, channel_id?, angle?}` → draft asset v1 |
| `POST /products/:id/experiments`, `DELETE /products/:id/experiments/:exp/:channel` | Link/unlink manual publication |
| `GET /providers` | Config-only status (no network) |
| `POST /providers/groq/generate`, `/tavily/search`, `/apify/run`, `/scrapely/run` | Optional adapters |

Errors: `{error:{code,message,details}}`; ownership failures always return 404 (no existence leak).

## 4. Scorecard

`(demand·0.25 + quality·0.20 + commission·0.20 + visual·0.15 + price·0.10 + (6−risk)·0.10) × 20`, each 1–5 integer with rationale. Range 20–100. `weighted_total = NULL` unless all six present. Rubric `v1`. A score is a decision aid, not market truth.

## 5. Content Factory output (`affiliate_template_v1`, deterministic, no AI, Rp0)

Sections: product & audience → problem/opportunity (hypothesis flagged) → creative brief → 3 hooks → script + storyboard table (time, framing, visual, on-screen text, VO, sound, transition; 4/6/8 scenes for 15/30/60 s) → faceless asset plan → caption/CTA/affiliate disclosure → claim→evidence map → rights checklist → approval & manual publishing steps.
Guarantees (tested): AI scenes labelled `[ILUSTRASI AI — bukan footage produk asli]`; unknown metrics are never asserted; claims are never `supported` automatically; no testimonials/unboxing/test results are generated.

## 6. Providers & cost (Rp0 policy)

| Provider | Secret | Extra controls | Free allowance / risk (verify on official site before use) |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | `GROQ_ENABLED` | Free tier with rate limits; paid tier separate |
| Tavily | `TAVILY_API_KEY` | `TAVILY_ENABLED` | Monthly free credits; 1 credit / basic search |
| Apify | `APIFY_API_TOKEN` | `APIFY_ENABLED`, `APIFY_ALLOWED_ACTORS` (comma list), `confirm_run:true` per run | Limited monthly platform credit; Actors/proxies consume credit |
| Scrape.ly | `SCRAPELY_TOKEN` | `SCRAPELY_ENABLED`, `SCRAPELY_ALLOWED_ACTORS` | **Endpoint & pricing not verified — do not enable** |
| All | — | `PROVIDERS_ENABLED=false` global kill switch | — |

State: **no secret configured, no credential validated, no real external call made, no Actor run.** Secrets only via `wrangler pages secret put <NAME> --project-name oltavyn` or untracked `.dev.vars`. Never paste secrets in chat.

## 7. Threat model notes (implemented controls)

- Workspace isolation: every query joins `workspaces.owner_user_id`; linked IDs (evidence, opportunity, channel, experiment) are re-checked against the product's workspace.
- SQL: parameterized; dynamic `SET` columns come only from server-side allowlists.
- XSS: all UI output escaped; strict CSP (`script-src 'self'`), no inline handlers.
- URLs: `new URL()` + http(s) only; no server-side fetch of user URLs (no SSRF surface). Provider base URLs only from owner-set env.
- Secrets: never returned, logged, stored or exported; upstream error bodies dropped; `redact()` helper tested.
- Affiliate tracking URLs: stored, but never returned in detail/export/audit (only `has_affiliate_url`).
- Prompt injection: provider output treated as untrusted draft; system prompt instructs to ignore embedded instructions; nothing persisted automatically.
- Remaining risks: D1 fixed-window rate limit is best-effort; dev-only `npm audit` findings (sharp/libvips via wrangler/miniflare) — production bundle (`--omit=dev`) has 0 vulnerabilities.

## 8. QA report (local, 2026-11-11)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run build` | pass (`dist/_worker.js` ≈ 112 kB) |
| Clean local D1 migration 0001→0003 | pass |
| `npm run test:providers` (mocked) | **29 passed, 0 failed** |
| `npm run test:smoke` (core) | **44 passed, 0 failed** |
| `npm run test:affiliate` | **65 passed, 0 failed** |
| Browser console `/` and `/affiliate` | 0 messages |
| `npm audit --omit=dev` | 0 vulnerabilities |

## 9. Panduan operator (Bahasa Indonesia)

1. Masuk di `/`, buat workspace (isi audiens). Buka **`/affiliate`**.
2. **Kanal:** daftarkan akun (nama, platform, handle). Tidak ada password/cookie/OTP yang diminta.
3. **Produk:** tambahkan kandidat dari listing yang bisa diperiksa. Kosongkan angka yang tidak diketahui.
4. **Riset (`/#/research`):** catat bukti (URL, waktu, metode, kutipan, keterbatasan). Di detail produk, tautkan bukti → tinjau → ubah status bukti.
5. **Scorecard:** isi 6 dimensi + alasan. Total muncul hanya jika lengkap.
6. **Peluang (`/#/opportunities`):** tulis masalah audiens dan tautkan bukti.
7. **Pipeline konten:** di detail produk pilih peluang + durasi 15/30/60 → draf masuk Content Studio. Sunting (membuat versi baru), lalu setujui versi persis + destinasi.
8. Buat link afiliasi **manual** di portal resmi, publikasikan **manual**, buat Eksperimen dari versi yang disetujui, catat URL publikasi, lalu tautkan eksperimen ke produk.
9. Catat observasi nyata (status, unit, jendela, asal). Data yang belum ada ≠ nol. Tinjau di **Pembelajaran**.

## 10. Not implemented (roadmap)

Dataset import from Actor runs; promoting Tavily leads into evidence in one click; Groq-assisted pipeline drafts; per-channel publishing-package export (file); learning dashboard grouped by product; Scrape.ly official-API verification; image/voice/music adapters (require licensing review).

## 11. CI update pending (owner action)

The GitHub App used by Genspark lacks the `workflows` permission, so `.github/workflows/verify.yml` could not be pushed. The proposed workflow (adds `npm run test:providers` and `npm run test:affiliate`) is in `docs/ci/verify.yml.proposed` (diff: `docs/ci/verify-yml-add-affiliate-tests.patch`). Owner: copy it over `.github/workflows/verify.yml` via the GitHub web UI, or grant the app `workflows` permission. Until then CI runs only typecheck/build/migrations/core smoke.
