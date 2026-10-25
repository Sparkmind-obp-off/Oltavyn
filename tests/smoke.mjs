// End-to-end smoke test against a running instance.
// Usage: BASE_URL=http://localhost:3000 node tests/smoke.mjs
// Creates two throwaway users; deletes their workspaces at the end.
const BASE = process.env.BASE_URL || 'http://localhost:3000'
let pass = 0, fail = 0
const ok = (cond, name, extra) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name, extra ?? '') } }

function client() {
  let cookie = ''
  return async (method, path, body, headers = {}) => {
    const h = { ...headers }
    if (cookie) h.cookie = cookie
    if (body !== undefined) h['content-type'] ??= 'application/json'
    const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
    let j = null; try { j = await r.json() } catch {}
    return { s: r.status, j }
  }
}
const rnd = Math.random().toString(36).slice(2, 8)
const A = client(), B = client(), anon = client()

console.log('Auth')
let r = await anon('GET', '/workspaces'); ok(r.s === 401, 'unauthenticated private request denied')
r = await A('POST', '/auth/register', { email: `a_${rnd}@test.local`, password: 'short' }); ok(r.s === 400, 'weak password rejected')
r = await A('POST', '/auth/register', { email: `a_${rnd}@test.local`, password: 'correct-horse-1', display_name: 'A' }); ok(r.s === 201, 'register user A')
r = await B('POST', '/auth/register', { email: `b_${rnd}@test.local`, password: 'correct-horse-2' }); ok(r.s === 201, 'register user B')
r = await A('POST', '/auth/login', { email: `a_${rnd}@test.local`, password: 'wrong-password' }); ok(r.s === 401, 'wrong password rejected')
r = await A('POST', '/workspaces', 'name=x', { 'content-type': 'application/x-www-form-urlencoded' }); ok(r.s === 415, 'non-JSON mutation rejected (CSRF guard)')
r = await A('POST', '/workspaces', { name: 'x' }, { origin: 'https://evil.example' }); ok(r.s === 403, 'cross-origin mutation rejected')

console.log('Workspace + evidence')
r = await A('POST', '/workspaces', { name: `WS ${rnd}`, niche: 'Dapur kos', audience: 'Mahasiswa', goal: 'Uji 2 sudut' }); ok(r.s === 201, 'create workspace')
const ws = r.j.workspace.id
r = await A('POST', `/workspaces/${ws}/evidence`, { source_type: 'web_page', title: 'Tanpa sumber', collection_method: 'manual_entry' }); ok(r.s === 400, 'evidence without source rejected')
r = await A('POST', `/workspaces/${ws}/evidence`, { source_type: 'user_interview', source_reference: 'Wawancara #1', title: 'Mahasiswa kesulitan masak di kos', excerpt: 'Saya tidak punya kompor.', observed_at: '2026-10-20T10:00:00Z', collection_method: 'manual_entry', limitations: 'n=1' })
ok(r.s === 201, 'add evidence'); const ev = r.j.evidence.id

console.log('Opportunity')
r = await A('POST', `/workspaces/${ws}/opportunities`, { title: 'Hipotesis', audience_problem: 'x' }); ok(r.s === 201 && r.j.opportunity.is_hypothesis === 1, 'opportunity w/o support flagged hypothesis')
r = await A('POST', `/workspaces/${ws}/opportunities`, { title: 'Resep tanpa kompor', audience_problem: 'Tidak ada kompor di kos', score_evidence: 2, evidence_links: [{ evidence_item_id: ev, relationship: 'supports' }] })
ok(r.s === 201 && r.j.opportunity.is_hypothesis === 0 && r.j.opportunity.evidence.length === 1, 'opportunity linked to evidence'); const opp = r.j.opportunity.id
r = await A('PATCH', `/opportunities/${opp}`, { status: 'accepted' }); ok(r.s === 200 && r.j.opportunity.status === 'accepted', 'accept opportunity')
r = await A('POST', `/workspaces/${ws}/opportunities`, { title: 'x', audience_problem: 'y', score_relevance: 9 }); ok(r.s === 400, 'score out of range rejected')

console.log('Content + approval')
r = await A('POST', `/opportunities/${opp}/generate-brief`, { format: 'short_video_script' }); ok(r.s === 201 && r.j.asset.status === 'draft', 'generate draft (no side effects)')
const asset = r.j.asset; const v1 = asset.versions[0]
ok(v1.claims.some((c) => c.evidence_ids.includes(ev)), 'claims mapped to evidence')
r = await A('POST', `/workspaces/${ws}/experiments`, { asset_version_id: v1.id, hypothesis: 'h', channel: 'TikTok' }); ok(r.s === 409, 'experiment blocked before approval')
r = await A('POST', `/asset-versions/${v1.id}/approval`, { decision: 'approved', body_sha256: 'deadbeef', destination: 'TikTok @a' }); ok(r.s === 409, 'approval with wrong content hash rejected')
r = await A('POST', `/asset-versions/${v1.id}/approval`, { decision: 'approved', body_sha256: v1.body_sha256 }); ok(r.s === 400, 'approval without destination rejected')
r = await A('POST', `/assets/${asset.id}/versions`, { body: v1.body + '\n\nSuntingan.', claims: [{ text: 'Klaim palsu', evidence_ids: [], status: 'supported' }] })
ok(r.s === 201 && r.j.asset.versions[0].claims[0].status === 'unsupported', 'edit creates v2; unsupported claim cannot be marked supported')
const v2 = r.j.asset.versions[0]
r = await A('POST', `/asset-versions/${v1.id}/approval`, { decision: 'approved', body_sha256: v1.body_sha256, destination: 'TikTok @a' }); ok(r.s === 409, 'stale version cannot be approved')
r = await A('POST', `/asset-versions/${v2.id}/approval`, { decision: 'approved', body_sha256: v2.body_sha256, destination: 'TikTok @a — manual' }); ok(r.s === 201 && r.j.asset.status === 'approved', 'approve exact v2')

console.log('Experiment + observations')
r = await A('POST', `/workspaces/${ws}/experiments`, { asset_version_id: v2.id, hypothesis: 'Hook masalah > hook produk', channel: 'TikTok' }); ok(r.s === 201, 'create experiment from approved version'); const exp = r.j.experiment.id
r = await A('PATCH', `/experiments/${exp}`, { status: 'published' }); ok(r.s === 400, 'published without URL rejected')
r = await A('PATCH', `/experiments/${exp}`, { status: 'published', published_url: 'https://www.tiktok.com/@a/video/1' }); ok(r.s === 200 && r.j.experiment.published_at, 'log manual publication')
r = await A('POST', `/experiments/${exp}/observations`, { metric_name: 'views', value_status: 'observed', unit: 'tayangan', origin: 'manual' }); ok(r.s === 400, 'observed value without number/window rejected')
r = await A('POST', `/experiments/${exp}/observations`, { metric_name: 'saves', value_status: 'not_yet_available', unit: 'kali', origin: 'manual', numeric_value: 5 })
ok(r.s === 201 && r.j.experiment.observations[0].numeric_value === null, 'missing data stored as null, not number')
r = await A('POST', `/experiments/${exp}/observations`, { metric_name: 'views', value_status: 'observed', numeric_value: 0, unit: 'tayangan', origin: 'manual', window_start: '2026-10-21T00:00:00Z', window_end: '2026-10-22T00:00:00Z' })
ok(r.s === 201 && r.j.experiment.observations.some((o) => o.numeric_value === 0), 'real zero preserved')
r = await A('PATCH', `/experiments/${exp}`, { next_decision: 'Uji hook lain' }); ok(r.s === 200, 'record next decision')

console.log('Learning + overview')
r = await A('GET', `/workspaces/${ws}/learning-summary`); ok(r.s === 200 && r.j.summary.comparisons.length === 1 && r.j.summary.missing_data.length === 1, 'learning summary uses recorded data only')
r = await A('GET', `/workspaces/${ws}/overview`); ok(r.s === 200 && r.j.well.loops === 1 && r.j.well.loops_with_observed_results === 1, 'WELL loop counted', JSON.stringify(r.j?.well))

console.log('Isolation')
r = await B('GET', `/workspaces/${ws}`); ok(r.s === 404, 'B cannot read A workspace')
r = await B('GET', `/evidence/${ev}`); ok(r.s === 404, 'B cannot read A evidence')
r = await B('PATCH', `/opportunities/${opp}`, { status: 'rejected' }); ok(r.s === 404, 'B cannot modify A opportunity')
r = await B('GET', `/workspaces/${ws}/export`); ok(r.s === 404, 'B cannot export A workspace')
r = await B('DELETE', `/workspaces/${ws}?confirm=${encodeURIComponent(`WS ${rnd}`)}`); ok(r.s === 404, 'B cannot delete A workspace')
r = await B('POST', '/workspaces', { name: 'B ws' }); const wsB = r.j.workspace.id
r = await B('POST', `/workspaces/${wsB}/opportunities`, { title: 't', audience_problem: 'p', evidence_links: [{ evidence_item_id: ev, relationship: 'supports' }] }); ok(r.s === 400, 'B cannot link A evidence')
r = await B('POST', `/workspaces/${wsB}/experiments`, { asset_version_id: v2.id, hypothesis: 'h', channel: 'c' }); ok(r.s === 404, 'B cannot use A content version')
r = await B('GET', '/workspaces'); ok(r.s === 200 && r.j.workspaces.every((w) => w.id !== ws), 'B list excludes A workspace')

console.log('Export + delete')
r = await A('GET', `/workspaces/${ws}/export`)
ok(r.s === 200 && r.j.evidence_items.length === 1 && r.j.observations.length === 2 && !JSON.stringify(r.j).includes('password'), 'export contains workspace data, no secrets')
r = await A('DELETE', `/workspaces/${ws}?confirm=wrong`); ok(r.s === 400, 'delete requires exact name confirmation')
r = await A('DELETE', `/workspaces/${ws}?confirm=${encodeURIComponent(`WS ${rnd}`)}`); ok(r.s === 200, 'delete workspace')
r = await A('GET', `/evidence/${ev}`); ok(r.s === 404, 'deleted evidence gone')
await B('DELETE', `/workspaces/${wsB}?confirm=${encodeURIComponent('B ws')}`)
r = await A('POST', '/auth/logout', {}); r = await A('GET', '/workspaces'); ok(r.s === 401, 'logout invalidates session')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
