// Affiliate OS end-to-end smoke + two-user isolation test against a running instance.
// Usage: BASE_URL=http://127.0.0.1:3000 node tests/affiliate-smoke.mjs
// Creates throwaway users/workspaces and deletes the workspaces at the end. Makes NO provider calls
// (provider endpoints are only exercised in their unconfigured state).
const BASE = process.env.BASE_URL || 'http://localhost:3000'
let pass = 0, fail = 0
const ok = (cond, name, extra) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name, extra ?? '') } }
function client() {
  let cookie = ''
  return async (method, path, body, headers = {}) => {
    const h = { ...headers }
    if (cookie) h.cookie = cookie
    if (body !== undefined) h['content-type'] ??= 'application/json'
    const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
    let j = null; try { j = await r.json() } catch {}
    return { s: r.status, j }
  }
}
const rnd = Math.random().toString(36).slice(2, 8)
const A = client(), B = client(), anon = client()
const AF = '/affiliate'

console.log('Setup')
let r = await anon('GET', `${AF}/providers`); ok(r.s === 401, 'affiliate API requires auth')
r = await A('POST', '/auth/register', { email: `aa_${rnd}@test.local`, password: 'correct-horse-1' }); ok(r.s === 201, 'register A')
r = await B('POST', '/auth/register', { email: `ab_${rnd}@test.local`, password: 'correct-horse-2' }); ok(r.s === 201, 'register B')
r = await A('POST', '/workspaces', { name: `AFF ${rnd}`, audience: 'Penghuni kos', goal: 'Uji produk dapur' }); const ws = r.j.workspace.id
r = await B('POST', '/workspaces', { name: `AFFB ${rnd}` }); const wsB = r.j.workspace.id

console.log('Channels')
r = await A('POST', `${AF}/workspaces/${ws}/channels`, { platform: 'myspace', channel_name: 'x' }); ok(r.s === 400, 'invalid platform rejected')
r = await A('POST', `${AF}/workspaces/${ws}/channels`, { platform: 'tiktok', channel_name: 'Dapur Kos', handle: '@dapurkos', external_url: 'javascript:alert(1)' }); ok(r.s === 400, 'non-http channel URL rejected')
r = await A('POST', `${AF}/workspaces/${ws}/channels`, { platform: 'tiktok', channel_name: 'Dapur Kos', handle: '@dapurkos' }); ok(r.s === 201 && r.j.channel.handle === 'dapurkos', 'create channel (handle normalized)'); const ch = r.j.channel.id
r = await A('POST', `${AF}/workspaces/${ws}/channels`, { platform: 'tiktok', channel_name: 'Dup', handle: 'dapurkos' }); ok(r.s === 409, 'duplicate handle rejected')
r = await A('PATCH', `${AF}/channels/${ch}`, { status: 'active' }); ok(r.s === 200 && r.j.channel.status === 'active', 'activate channel')

console.log('Products')
r = await A('POST', `${AF}/workspaces/${ws}/products`, { title: 'Rak', canonical_url: 'ftp://x' }); ok(r.s === 400, 'non-http product URL rejected')
r = await A('POST', `${AF}/workspaces/${ws}/products`, { title: 'Rak', canonical_url: 'https://shopee.co.id/rak', product_rating: 7 }); ok(r.s === 400, 'rating out of range rejected')
r = await A('POST', `${AF}/workspaces/${ws}/products`, { title: 'Rak Bumbu Lipat', canonical_url: 'https://Shopee.co.id/rak-bumbu/#top', category: 'Dapur', price_amount: 0, sold_count: '' })
ok(r.s === 201, 'create product'); const p = r.j.product
ok(p.price_amount === 0 && p.sold_count === null && p.commission_rate_percent === null && p.product_rating === null, 'real zero kept; unknown metrics stay NULL', JSON.stringify(p))
ok(p.canonical_url === 'https://shopee.co.id/rak-bumbu', 'canonical URL normalized', p.canonical_url)
r = await A('POST', `${AF}/workspaces/${ws}/products`, { title: 'Dup', canonical_url: 'https://shopee.co.id/rak-bumbu/' }); ok(r.s === 409, 'duplicate canonical URL rejected')
r = await A('PATCH', `${AF}/products/${p.id}`, { price_amount: 45000, lifecycle_status: 'shortlisted' }); ok(r.s === 200 && r.j.product.price_amount === 45000, 'edit product')
r = await A('PATCH', `${AF}/products/${p.id}`, { evidence_state: 'verified' }); ok(r.s === 409, 'cannot mark verified without supporting evidence')
r = await A('GET', `${AF}/workspaces/${ws}/products?status=shortlisted`); ok(r.s === 200 && r.j.products.length === 1, 'filter by status')
r = await A('GET', `${AF}/workspaces/${ws}/products?q=bumbu`); ok(r.s === 200 && r.j.products.length === 1, 'search by title')

console.log('Evidence links')
r = await A('POST', `/workspaces/${ws}/evidence`, { source_type: 'web_page', source_url: 'https://shopee.co.id/rak-bumbu', title: 'Listing rak bumbu', excerpt: 'Harga tertera Rp45.000', observed_at: '2026-11-10T08:00:00Z', collection_method: 'manual_entry', limitations: 'Harga dapat berubah' })
const ev = r.j.evidence.id
r = await B('POST', `/workspaces/${wsB}/evidence`, { source_type: 'web_page', source_url: 'https://example.com', title: 'B evidence', collection_method: 'manual_entry' }); const evB = r.j.evidence.id
r = await A('POST', `${AF}/products/${p.id}/evidence`, { evidence_item_id: evB, relationship: 'supports' }); ok(r.s === 400, 'cannot link evidence from another workspace')
r = await A('POST', `${AF}/products/${p.id}/evidence`, { evidence_item_id: ev, relationship: 'supports' }); ok(r.s === 201, 'link evidence')
r = await A('GET', `${AF}/products/${p.id}`); ok(r.j.product.evidence.length === 1 && r.j.product.evidence_state === 'unverified', 'linking does not auto-verify')
r = await A('PATCH', `${AF}/products/${p.id}`, { evidence_state: 'verified' }); ok(r.s === 200, 'operator marks verified after review')

console.log('Scorecards')
r = await A('POST', `${AF}/products/${p.id}/scorecards`, { demand: 4 }); ok(r.s === 400, 'score without rationale rejected')
r = await A('POST', `${AF}/products/${p.id}/scorecards`, { demand: 6, rationale: { demand: 'x' } }); ok(r.s === 400, 'score out of 1–5 rejected')
r = await A('POST', `${AF}/products/${p.id}/scorecards`, { demand: 4, quality: 3, rationale: { demand: 'Banyak dicari', quality: 'Rating cukup' } })
ok(r.s === 201 && r.j.scorecard.weighted_total === null && r.j.scorecard.missing_dimensions.length === 4, 'incomplete scorecard has no total')
const full = { demand: 4, quality: 3, commission: 2, visual_potential: 5, price_accessibility: 4, seller_risk: 2, rationale: { demand: 'a', quality: 'b', commission: 'c', visual_potential: 'd', price_accessibility: 'e', seller_risk: 'f' } }
r = await A('POST', `${AF}/products/${p.id}/scorecards`, full)
// (4*.25+3*.2+2*.2+5*.15+4*.1+(6-2)*.1)*20 = (1+0.6+0.4+0.75+0.4+0.4)*20 = 71
ok(r.s === 201 && r.j.scorecard.weighted_total === 71, 'complete scorecard total matches rubric (71)', r.j?.scorecard?.weighted_total)
r = await A('GET', `${AF}/products/${p.id}/scorecards`); ok(r.j.scorecards.length === 2 && r.j.rubric.version === 'v1', 'scorecard history kept')

console.log('Content pipeline → approval → experiment')
r = await A('POST', `/workspaces/${ws}/opportunities`, { title: 'Dapur kos sempit', audience_problem: 'Bumbu berantakan di dapur kos sempit', evidence_links: [{ evidence_item_id: ev, relationship: 'supports' }] }); const opp = r.j.opportunity.id
r = await A('POST', `${AF}/products/${p.id}/content-packages`, { opportunity_id: opp, duration_seconds: 45 }); ok(r.s === 400, 'unsupported duration rejected')
r = await B('POST', `/workspaces/${wsB}/opportunities`, { title: 'B', audience_problem: 'B' }); const oppB = r.j.opportunity.id
r = await A('POST', `${AF}/products/${p.id}/content-packages`, { opportunity_id: oppB, duration_seconds: 30 }); ok(r.s === 400, 'cannot use opportunity from another workspace')
for (const d of [15, 60]) { r = await A('POST', `${AF}/products/${p.id}/content-packages`, { opportunity_id: opp, duration_seconds: d, channel_id: ch }); ok(r.s === 201, `generate ${d}s package`) }
r = await A('POST', `${AF}/products/${p.id}/content-packages`, { opportunity_id: opp, duration_seconds: 30, channel_id: ch }); ok(r.s === 201, 'generate 30s package'); const pkg = r.j.package
r = await A('GET', `/assets/${pkg.asset_id}`); const asset = r.j.asset, v1 = asset.versions[0]
ok(/ILUSTRASI AI/.test(v1.body) && /komisi/.test(v1.body) && /Storyboard|storyboard/.test(v1.body), 'package has AI labels, disclosure, storyboard')
ok(!/terjual —/.test(v1.body) && /Jumlah terjual: _tidak diketahui/.test(v1.body), 'unknown metrics not asserted in content')
ok(v1.claims.length > 0 && v1.claims.every((c) => c.status !== 'supported'), 'claims never auto-marked supported')
r = await A('POST', `/asset-versions/${v1.id}/approval`, { decision: 'approved', body_sha256: v1.body_sha256, destination: 'TikTok @dapurkos — manual' }); ok(r.s === 201, 'approve exact version + destination')
r = await A('POST', `/workspaces/${ws}/experiments`, { asset_version_id: v1.id, hypothesis: 'Hook masalah lebih ditonton', channel: 'TikTok' }); const exp = r.j.experiment.id
r = await B('POST', `${AF}/products/${p.id}/experiments`, { experiment_id: exp, channel_id: ch }); ok(r.s === 404, 'B cannot link to A product')
r = await A('POST', `${AF}/products/${p.id}/experiments`, { experiment_id: exp, channel_id: ch, affiliate_url: 'https://s.shopee.co.id/secret-tracking-123' }); ok(r.s === 201, 'link experiment to product + channel')
r = await A('PATCH', `/experiments/${exp}`, { status: 'published', published_url: 'https://www.tiktok.com/@dapurkos/video/1' }); ok(r.s === 200, 'log manual publication')
r = await A('GET', `${AF}/products/${p.id}`); ok(r.j.product.experiments.length === 1 && r.j.product.experiments[0].has_affiliate_url === 1 && !JSON.stringify(r.j).includes('secret-tracking'), 'product detail hides tracking URL')
ok(r.j.product.content_packages.length === 3, 'product traces 3 content packages')

console.log('Isolation')
r = await B('GET', `${AF}/products/${p.id}`); ok(r.s === 404, 'B cannot read A product')
r = await B('PATCH', `${AF}/products/${p.id}`, { title: 'hack' }); ok(r.s === 404, 'B cannot edit A product')
r = await B('GET', `${AF}/channels/${ch}`); ok(r.s === 404, 'B cannot read A channel')
r = await B('PATCH', `${AF}/channels/${ch}`, { status: 'archived' }); ok(r.s === 404, 'B cannot archive A channel')
r = await B('GET', `${AF}/products/${p.id}/scorecards`); ok(r.s === 404, 'B cannot read A scorecards')
r = await B('POST', `${AF}/products/${p.id}/scorecards`, full); ok(r.s === 404, 'B cannot score A product')
r = await B('GET', `${AF}/products/${p.id}/evidence`); ok(r.s === 404, 'B cannot read A product evidence')
r = await B('DELETE', `${AF}/products/${p.id}/evidence/${ev}`); ok(r.s === 404, 'B cannot unlink A evidence')
r = await B('GET', `${AF}/workspaces/${ws}/products`); ok(r.s === 404, 'B cannot list A products')
r = await B('POST', `${AF}/workspaces/${ws}/channels`, { platform: 'tiktok', channel_name: 'x' }); ok(r.s === 404, 'B cannot create channel in A workspace')
r = await B('POST', `${AF}/products/${p.id}/content-packages`, { opportunity_id: opp, duration_seconds: 15 }); ok(r.s === 404, 'B cannot generate content from A product')
r = await B('POST', `${AF}/workspaces/${wsB}/products`, { title: 'B prod', canonical_url: 'https://shopee.co.id/b' }); const pB = r.j.product.id
r = await B('POST', `${AF}/products/${pB}/experiments`, { experiment_id: exp, channel_id: ch }); ok(r.s === 400, 'B cannot link A experiment/channel to B product')
r = await B('POST', `${AF}/products/${pB}/evidence`, { evidence_item_id: ev, relationship: 'supports' }); ok(r.s === 400, 'B cannot link A evidence to B product')

console.log('Agent Live Chat workspace boundaries')
r = await A('GET', AF + '/agent/conversations?workspace_id=' + encodeURIComponent(ws)); ok(r.s === 200 && Array.isArray(r.j.conversations), 'owner can list own workspace agent conversations')
r = await B('GET', AF + '/agent/conversations?workspace_id=' + encodeURIComponent(ws)); ok(r.s === 404, 'other user cannot list agent conversations in foreign workspace')
r = await A('GET', AF + '/agent/conversations?workspace_id=' + encodeURIComponent(wsB)); ok(r.s === 404, 'owner cannot access another workspace agent history')

console.log('Providers (unconfigured; no external calls)')
r = await A('GET', `${AF}/providers`); ok(r.s === 200 && r.j.providers.every((x) => ['unconfigured', 'configured_unverified', 'disabled'].includes(x.state)) && !JSON.stringify(r.j).match(/gsk_|tvly-|apify_api_/), 'provider status has no secrets')
r = await A('POST', `${AF}/providers/apify/run`, { actor_id: 'x/y', confirm_run: true }); ok([503, 403].includes(r.s), 'actor run refused without config/allowlist')

console.log('Evidence unlink, archive, export, delete')
r = await A('DELETE', `${AF}/products/${p.id}/evidence/${ev}`); ok(r.s === 200, 'unlink evidence')
r = await A('GET', `${AF}/products/${p.id}`); ok(r.j.product.evidence.length === 0 && r.j.product.evidence_state === 'unverified', 'verified state reverts when last support removed')
r = await A('PATCH', `${AF}/products/${p.id}`, { lifecycle_status: 'archived' }); ok(r.s === 200, 'archive product')
r = await A('GET', `${AF}/workspaces/${ws}/products`); ok(r.j.products.length === 0, 'archived hidden from default list')
r = await A('GET', `/workspaces/${ws}/export`)
ok(r.s === 200 && r.j.affiliate_products.length === 1 && r.j.affiliate_product_scorecards.length === 2 && r.j.affiliate_content_packages.length === 3 && r.j.affiliate_channels.length === 1, 'export includes affiliate data')
ok(!JSON.stringify(r.j).includes('secret-tracking'), 'export excludes affiliate tracking URL')
r = await B('GET', `/workspaces/${wsB}/export`); ok(r.j.affiliate_products.every((x) => x.id !== p.id), 'B export excludes A products')
r = await A('DELETE', `/workspaces/${ws}?confirm=${encodeURIComponent(`AFF ${rnd}`)}`); ok(r.s === 200, 'delete workspace with affiliate data')
r = await A('GET', `${AF}/products/${p.id}`); ok(r.s === 404, 'affiliate product gone after workspace delete')
await B('DELETE', `/workspaces/${wsB}?confirm=${encodeURIComponent(`AFFB ${rnd}`)}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
