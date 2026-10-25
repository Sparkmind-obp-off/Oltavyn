import { Hono } from 'hono'
import { ApiError, AppEnv, audit, newId, notFound, nowIso, rateLimit, sha256Hex, validate } from '../lib/core'
import { generateBriefTemplate } from '../lib/generator'
import { buildLearningSummary } from '../lib/learning'

export const api = new Hono<AppEnv>()

// ---------- Authorization helpers (server-side, authoritative) ----------
async function ownWorkspace(c: any, wsId: string) {
  const ws = await c.env.DB.prepare('SELECT * FROM workspaces WHERE id = ? AND owner_user_id = ?').bind(wsId, c.get('user').id).first()
  if (!ws) throw notFound()
  return ws as any
}
// Load a workspace-owned row and verify the caller owns its workspace.
async function ownRow(c: any, table: 'evidence_items' | 'opportunities' | 'content_assets' | 'experiments', id: string) {
  const row = await c.env.DB.prepare(
    `SELECT t.* FROM ${table} t JOIN workspaces w ON w.id = t.workspace_id WHERE t.id = ? AND w.owner_user_id = ?`
  ).bind(id, c.get('user').id).first()
  if (!row) throw notFound()
  return row as any
}
async function ownVersion(c: any, versionId: string) {
  const row = await c.env.DB.prepare(
    `SELECT v.*, a.workspace_id, a.id AS asset_id, a.current_version_id FROM content_versions v
     JOIN content_assets a ON a.id = v.asset_id JOIN workspaces w ON w.id = a.workspace_id
     WHERE v.id = ? AND w.owner_user_id = ?`
  ).bind(versionId, c.get('user').id).first()
  if (!row) throw notFound()
  return row as any
}
const body = async (c: any) => { try { return await c.req.json() } catch { throw new ApiError(400, 'invalid_json', 'JSON tidak valid.') } }
function setClause(fields: Record<string, unknown>) {
  const keys = Object.keys(fields)
  if (!keys.length) throw new ApiError(400, 'no_changes', 'Tidak ada perubahan yang dikirim.')
  return { sql: keys.map((k) => `${k} = ?`).join(', '), values: keys.map((k) => fields[k]) }
}

// ---------- Workspaces ----------
const wsSchema = {
  name: { type: 'string', required: true, max: 120 },
  niche: { type: 'string', max: 300 },
  audience: { type: 'string', max: 500 },
  goal: { type: 'string', max: 500 },
  allowed_sources: { type: 'string', max: 1000 },
  locale: { type: 'string', enum: ['id-ID', 'en-US'] },
} as const

api.get('/workspaces', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM workspaces WHERE owner_user_id = ? ORDER BY created_at DESC').bind(c.get('user').id).all()
  return c.json({ workspaces: results })
})

api.post('/workspaces', async (c) => {
  const d = validate<any>(await body(c), wsSchema as any)
  const count = await c.env.DB.prepare('SELECT COUNT(*) n FROM workspaces WHERE owner_user_id = ?').bind(c.get('user').id).first<{ n: number }>()
  if ((count?.n ?? 0) >= 20) throw new ApiError(400, 'limit_reached', 'Batas 20 workspace per akun tercapai.')
  const id = newId('ws'), t = nowIso()
  await c.env.DB.prepare('INSERT INTO workspaces (id, owner_user_id, name, niche, audience, goal, allowed_sources, locale, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, c.get('user').id, d.name, d.niche ?? null, d.audience ?? null, d.goal ?? null, d.allowed_sources ?? null, d.locale ?? 'id-ID', t, t).run()
  await audit(c.env.DB, { workspace_id: id, actor_user_id: c.get('user').id, action: 'workspace.create', resource_type: 'workspace', resource_id: id })
  return c.json({ workspace: await ownWorkspace(c, id) }, 201)
})

api.get('/workspaces/:id', async (c) => c.json({ workspace: await ownWorkspace(c, c.req.param('id')) }))

api.patch('/workspaces/:id', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const d = validate<any>(await body(c), wsSchema as any, true)
  const { sql, values } = setClause({ ...d, updated_at: nowIso() })
  await c.env.DB.prepare(`UPDATE workspaces SET ${sql} WHERE id = ?`).bind(...values, ws.id).run()
  return c.json({ workspace: await ownWorkspace(c, ws.id) })
})

// Overview: real counts + loop status (WELL components). No invented metrics.
api.get('/workspaces/:id/overview', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const q = (sql: string) => c.env.DB.prepare(sql).bind(ws.id).first<{ n: number }>().then((r) => r?.n ?? 0)
  const counts = {
    evidence: await q("SELECT COUNT(*) n FROM evidence_items WHERE workspace_id = ? AND status = 'active'"),
    opportunities: await q('SELECT COUNT(*) n FROM opportunities WHERE workspace_id = ?'),
    opportunities_accepted: await q("SELECT COUNT(*) n FROM opportunities WHERE workspace_id = ? AND status = 'accepted'"),
    assets: await q('SELECT COUNT(*) n FROM content_assets WHERE workspace_id = ?'),
    assets_approved: await q("SELECT COUNT(*) n FROM content_assets WHERE workspace_id = ? AND status = 'approved'"),
    experiments: await q('SELECT COUNT(*) n FROM experiments WHERE workspace_id = ?'),
    experiments_closed: await q("SELECT COUNT(*) n FROM experiments WHERE workspace_id = ? AND status IN ('published','not_published')"),
    observations: await q('SELECT COUNT(*) n FROM observations o JOIN experiments e ON e.id = o.experiment_id WHERE e.workspace_id = ?'),
    observations_real: await q("SELECT COUNT(*) n FROM observations o JOIN experiments e ON e.id = o.experiment_id WHERE e.workspace_id = ? AND o.value_status = 'observed'"),
  }
  // WELL: loops completed in the last 7 days.
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const well = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT e.id) AS loops,
            COUNT(DISTINCT CASE WHEN o.value_status = 'observed' THEN e.id END) AS loops_with_observed
     FROM experiments e
     JOIN content_versions v ON v.id = e.asset_version_id
     JOIN content_assets a ON a.id = v.asset_id
     JOIN approvals ap ON ap.id = e.approval_id AND ap.decision = 'approved'
     JOIN observations o ON o.experiment_id = e.id
     WHERE e.workspace_id = ? AND e.status IN ('published','not_published')
       AND e.next_decision IS NOT NULL AND e.updated_at >= ?
       AND EXISTS (SELECT 1 FROM opportunity_evidence oe WHERE oe.opportunity_id = a.opportunity_id AND oe.relationship = 'supports')`
  ).bind(ws.id, since).first<any>()
  let next_action = 'Tambahkan bukti pertama di Riset.'
  if (counts.evidence > 0 && counts.opportunities === 0) next_action = 'Buat peluang yang ditautkan ke bukti.'
  else if (counts.opportunities > 0 && counts.assets === 0) next_action = 'Buat brief konten dari peluang yang diterima.'
  else if (counts.assets > 0 && counts.assets_approved === 0) next_action = 'Tinjau dan setujui satu versi konten.'
  else if (counts.assets_approved > 0 && counts.experiments === 0) next_action = 'Catat eksperimen untuk konten yang disetujui.'
  else if (counts.experiments > counts.experiments_closed) next_action = 'Catat status publikasi (terbit / sengaja tidak diterbitkan).'
  else if (counts.experiments > 0 && counts.observations === 0) next_action = 'Tambahkan observasi hasil atau tandai "belum tersedia".'
  else if (counts.experiments > 0) next_action = 'Tinjau ringkasan pembelajaran dan catat keputusan berikutnya.'
  return c.json({ workspace: ws, counts, well: { window_days: 7, loops: well?.loops ?? 0, loops_with_observed_results: well?.loops_with_observed ?? 0 }, next_action })
})

// ---------- Evidence ----------
const evidenceSchema = {
  source_type: { type: 'string', required: true, enum: ['web_page', 'platform_observation', 'user_interview', 'export_file', 'other'] },
  source_url: { type: 'string', max: 2000, url: true },
  source_reference: { type: 'string', max: 500 },
  title: { type: 'string', required: true, max: 200 },
  excerpt: { type: 'string', max: 5000 },
  interpretation: { type: 'string', max: 3000 },
  observed_at: { type: 'string', date: true },
  collection_method: { type: 'string', required: true, enum: ['manual_entry', 'user_export', 'official_api'] },
  reliability_notes: { type: 'string', max: 2000 },
  limitations: { type: 'string', max: 2000 },
  status: { type: 'string', enum: ['active', 'archived'] },
} as const

api.get('/workspaces/:id/evidence', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const status = c.req.query('status') === 'archived' ? 'archived' : 'active'
  const { results } = await c.env.DB.prepare('SELECT * FROM evidence_items WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT 500').bind(ws.id, status).all()
  return c.json({ evidence: results })
})

api.post('/workspaces/:id/evidence', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const d = validate<any>(await body(c), evidenceSchema as any)
  if (!d.source_url && !d.source_reference) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { source_url: 'isi URL sumber atau referensi sumber agar bukti dapat diperiksa' })
  const id = newId('evd'), t = nowIso()
  await c.env.DB.prepare(`INSERT INTO evidence_items (id, workspace_id, source_type, source_url, source_reference, title, excerpt, interpretation, observed_at, captured_at, collection_method, reliability_notes, limitations, status, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`)
    .bind(id, ws.id, d.source_type, d.source_url ?? null, d.source_reference ?? null, d.title, d.excerpt ?? null, d.interpretation ?? null, d.observed_at ?? null, t, d.collection_method, d.reliability_notes ?? null, d.limitations ?? null, c.get('user').id, t, t).run()
  await audit(c.env.DB, { workspace_id: ws.id, actor_user_id: c.get('user').id, action: 'evidence.create', resource_type: 'evidence', resource_id: id })
  return c.json({ evidence: await ownRow(c, 'evidence_items', id) }, 201)
})

api.get('/evidence/:id', async (c) => c.json({ evidence: await ownRow(c, 'evidence_items', c.req.param('id')) }))

api.patch('/evidence/:id', async (c) => {
  const ev = await ownRow(c, 'evidence_items', c.req.param('id'))
  const d = validate<any>(await body(c), evidenceSchema as any, true)
  const { sql, values } = setClause({ ...d, updated_at: nowIso() })
  await c.env.DB.prepare(`UPDATE evidence_items SET ${sql} WHERE id = ?`).bind(...values, ev.id).run()
  return c.json({ evidence: await ownRow(c, 'evidence_items', ev.id) })
})

// ---------- Opportunities ----------
const score = { type: 'int', min: 1, max: 5 } as const
const oppSchema = {
  title: { type: 'string', required: true, max: 200 },
  audience_problem: { type: 'string', required: true, max: 2000 },
  rationale: { type: 'string', max: 4000 },
  unknowns: { type: 'string', max: 3000 },
  score_relevance: score, score_evidence: score, score_repeat_signal: score, score_feasibility: score, score_risk: score,
  status: { type: 'string', enum: ['candidate', 'accepted', 'rejected'] },
  evidence_links: { type: 'array', max: 50 },
} as const

async function validateEvidenceLinks(c: any, wsId: string, links: unknown[]) {
  const clean: { evidence_item_id: string; relationship: string }[] = []
  for (const l of links as any[]) {
    if (!l || typeof l.evidence_item_id !== 'string' || !['supports', 'challenges', 'context'].includes(l.relationship)) {
      throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { evidence_links: 'setiap tautan butuh evidence_item_id dan relationship (supports|challenges|context)' })
    }
    // Reject evidence IDs from other workspaces / users.
    const ok = await c.env.DB.prepare('SELECT 1 FROM evidence_items WHERE id = ? AND workspace_id = ?').bind(l.evidence_item_id, wsId).first()
    if (!ok) throw new ApiError(400, 'invalid_evidence', 'Salah satu bukti tidak ditemukan di workspace ini.', { evidence_item_id: l.evidence_item_id })
    clean.push({ evidence_item_id: l.evidence_item_id, relationship: l.relationship })
  }
  return clean
}

async function loadOpportunity(c: any, id: string) {
  const o = await ownRow(c, 'opportunities', id)
  const { results } = await c.env.DB.prepare(
    `SELECT oe.relationship, e.id, e.title, e.source_type, e.source_url, e.source_reference, e.observed_at, e.excerpt, e.limitations, e.status
     FROM opportunity_evidence oe JOIN evidence_items e ON e.id = oe.evidence_item_id WHERE oe.opportunity_id = ?`
  ).bind(id).all()
  return { ...o, evidence: results }
}

api.get('/workspaces/:id/opportunities', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    `SELECT o.*,
      (SELECT COUNT(*) FROM opportunity_evidence oe WHERE oe.opportunity_id = o.id AND oe.relationship = 'supports') AS supports_count,
      (SELECT COUNT(*) FROM opportunity_evidence oe WHERE oe.opportunity_id = o.id AND oe.relationship = 'challenges') AS challenges_count
     FROM opportunities o WHERE o.workspace_id = ? ORDER BY o.created_at DESC LIMIT 500`
  ).bind(ws.id).all()
  return c.json({ opportunities: results })
})

api.post('/workspaces/:id/opportunities', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const d = validate<any>(await body(c), oppSchema as any)
  const links = await validateEvidenceLinks(c, ws.id, d.evidence_links ?? [])
  // No supporting evidence => explicitly a hypothesis (ADR-009).
  const isHypothesis = links.some((l) => l.relationship === 'supports') ? 0 : 1
  const id = newId('opp'), t = nowIso()
  const stmts = [
    c.env.DB.prepare(`INSERT INTO opportunities (id, workspace_id, title, audience_problem, rationale, unknowns, is_hypothesis, score_relevance, score_evidence, score_repeat_signal, score_feasibility, score_risk, status, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, ws.id, d.title, d.audience_problem, d.rationale ?? null, d.unknowns ?? null, isHypothesis, d.score_relevance ?? null, d.score_evidence ?? null, d.score_repeat_signal ?? null, d.score_feasibility ?? null, d.score_risk ?? null, d.status ?? 'candidate', c.get('user').id, t, t),
    ...links.map((l) => c.env.DB.prepare('INSERT INTO opportunity_evidence (opportunity_id, evidence_item_id, relationship) VALUES (?,?,?)').bind(id, l.evidence_item_id, l.relationship)),
  ]
  await c.env.DB.batch(stmts)
  await audit(c.env.DB, { workspace_id: ws.id, actor_user_id: c.get('user').id, action: 'opportunity.create', resource_type: 'opportunity', resource_id: id })
  return c.json({ opportunity: await loadOpportunity(c, id) }, 201)
})

api.get('/opportunities/:id', async (c) => c.json({ opportunity: await loadOpportunity(c, c.req.param('id')) }))

api.patch('/opportunities/:id', async (c) => {
  const o = await ownRow(c, 'opportunities', c.req.param('id'))
  const { evidence_links, ...d } = validate<any>(await body(c), oppSchema as any, true)
  const stmts: D1PreparedStatement[] = []
  if (Array.isArray(evidence_links)) {
    const links = await validateEvidenceLinks(c, o.workspace_id, evidence_links)
    stmts.push(c.env.DB.prepare('DELETE FROM opportunity_evidence WHERE opportunity_id = ?').bind(o.id))
    links.forEach((l) => stmts.push(c.env.DB.prepare('INSERT INTO opportunity_evidence (opportunity_id, evidence_item_id, relationship) VALUES (?,?,?)').bind(o.id, l.evidence_item_id, l.relationship)))
    d.is_hypothesis = links.some((l) => l.relationship === 'supports') ? 0 : 1
  }
  const { sql, values } = setClause({ ...d, updated_at: nowIso() })
  stmts.push(c.env.DB.prepare(`UPDATE opportunities SET ${sql} WHERE id = ?`).bind(...values, o.id))
  await c.env.DB.batch(stmts)
  return c.json({ opportunity: await loadOpportunity(c, o.id) })
})

// ---------- Content: generation (draft only, no side effects) ----------
api.post('/opportunities/:id/generate-brief', async (c) => {
  await rateLimit(c.env.DB, `gen:${c.get('user').id}`, 60, 3600)
  const opp = await loadOpportunity(c, c.req.param('id'))
  if (opp.status === 'rejected') throw new ApiError(409, 'opportunity_rejected', 'Peluang yang ditolak tidak dapat dijadikan konten.')
  const d = validate<any>(await body(c).catch(() => ({})), { format: { type: 'string', enum: ['brief', 'short_video_script', 'caption', 'article', 'thread', 'other'] } })
  const ws = await ownWorkspace(c, opp.workspace_id)
  const gen = generateBriefTemplate(ws, opp, d.format ?? 'brief')
  const assetId = newId('ast'), versionId = newId('ver'), t = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO content_assets (id, workspace_id, opportunity_id, title, format, status, current_version_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,'draft',?,?,?,?)`)
      .bind(assetId, ws.id, opp.id, gen.title, d.format ?? 'brief', versionId, c.get('user').id, t, t),
    c.env.DB.prepare(`INSERT INTO content_versions (id, asset_id, version_number, body, body_sha256, claims_json, generator, created_by, created_at) VALUES (?,?,1,?,?,?,?,?,?)`)
      .bind(versionId, assetId, gen.body, await sha256Hex(gen.body), JSON.stringify(gen.claims), 'template_v1', c.get('user').id, t),
  ])
  await audit(c.env.DB, { workspace_id: ws.id, actor_user_id: c.get('user').id, action: 'content.generate', resource_type: 'asset', resource_id: assetId })
  return c.json({ asset: await loadAsset(c, assetId) }, 201)
})

async function loadAsset(c: any, id: string) {
  const a = await ownRow(c, 'content_assets', id)
  const { results: versions } = await c.env.DB.prepare('SELECT * FROM content_versions WHERE asset_id = ? ORDER BY version_number DESC').bind(id).all()
  const { results: approvals } = await c.env.DB.prepare(
    `SELECT ap.* FROM approvals ap JOIN content_versions v ON v.id = ap.asset_version_id WHERE v.asset_id = ? ORDER BY ap.decided_at DESC`
  ).bind(id).all()
  return { ...a, versions: versions.map((v: any) => ({ ...v, claims: JSON.parse(v.claims_json) })), approvals }
}

api.get('/workspaces/:id/assets', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, o.title AS opportunity_title, v.version_number AS current_version_number
     FROM content_assets a JOIN opportunities o ON o.id = a.opportunity_id LEFT JOIN content_versions v ON v.id = a.current_version_id
     WHERE a.workspace_id = ? ORDER BY a.updated_at DESC LIMIT 500`
  ).bind(ws.id).all()
  return c.json({ assets: results })
})

api.get('/assets/:id', async (c) => c.json({ asset: await loadAsset(c, c.req.param('id')) }))

// Editing always creates a new immutable version; previous approvals do not carry over.
api.post('/assets/:id/versions', async (c) => {
  const a = await ownRow(c, 'content_assets', c.req.param('id'))
  const d = validate<any>(await body(c), { body: { type: 'string', required: true, max: 20000 }, claims: { type: 'array', max: 100 } })
  const claims = (d.claims ?? []).map((cl: any) => {
    if (!cl || typeof cl.text !== 'string' || !cl.text.trim()) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { claims: 'setiap klaim butuh teks' })
    const ids = Array.isArray(cl.evidence_ids) ? cl.evidence_ids.filter((x: unknown) => typeof x === 'string') : []
    const status = ['supported', 'unsupported', 'needs_verification'].includes(cl.status) ? cl.status : (ids.length ? 'supported' : 'unsupported')
    return { text: cl.text.slice(0, 1000), evidence_ids: ids, status }
  })
  for (const cl of claims) for (const eid of cl.evidence_ids) {
    const ok = await c.env.DB.prepare('SELECT 1 FROM evidence_items WHERE id = ? AND workspace_id = ?').bind(eid, a.workspace_id).first()
    if (!ok) throw new ApiError(400, 'invalid_evidence', 'Klaim merujuk bukti yang tidak ada di workspace ini.', { evidence_id: eid })
    if (cl.status === 'supported' && !cl.evidence_ids.length) cl.status = 'unsupported'
  }
  for (const cl of claims) if (cl.status === 'supported' && !cl.evidence_ids.length) cl.status = 'unsupported'
  const last = await c.env.DB.prepare('SELECT MAX(version_number) n FROM content_versions WHERE asset_id = ?').bind(a.id).first<{ n: number }>()
  const versionId = newId('ver'), t = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO content_versions (id, asset_id, version_number, body, body_sha256, claims_json, generator, created_by, created_at) VALUES (?,?,?,?,?,?,'manual',?,?)`)
      .bind(versionId, a.id, (last?.n ?? 0) + 1, d.body, await sha256Hex(d.body), JSON.stringify(claims), c.get('user').id, t),
    c.env.DB.prepare(`UPDATE content_assets SET current_version_id = ?, status = 'draft', updated_at = ? WHERE id = ?`).bind(versionId, t, a.id),
  ])
  return c.json({ asset: await loadAsset(c, a.id) }, 201)
})

api.post('/assets/:id/submit-review', async (c) => {
  const a = await ownRow(c, 'content_assets', c.req.param('id'))
  if (a.status !== 'draft' && a.status !== 'rejected') throw new ApiError(409, 'invalid_state', 'Hanya draf yang dapat diajukan untuk ditinjau.')
  await c.env.DB.prepare(`UPDATE content_assets SET status = 'in_review', updated_at = ? WHERE id = ?`).bind(nowIso(), a.id).run()
  return c.json({ asset: await loadAsset(c, a.id) })
})

// Approval is bound to an exact version id AND its body hash (client must echo it back).
api.post('/asset-versions/:id/approval', async (c) => {
  const v = await ownVersion(c, c.req.param('id'))
  const d = validate<any>(await body(c), {
    decision: { type: 'string', required: true, enum: ['approved', 'rejected'] },
    body_sha256: { type: 'string', required: true, max: 64 },
    destination: { type: 'string', max: 300 },
    note: { type: 'string', max: 2000 },
  })
  if (v.id !== v.current_version_id) throw new ApiError(409, 'stale_version', 'Versi ini bukan versi terbaru. Tinjau versi terbaru.')
  if (d.body_sha256 !== v.body_sha256) throw new ApiError(409, 'content_mismatch', 'Isi konten berubah sejak Anda meninjaunya. Muat ulang dan tinjau lagi.')
  if (d.decision === 'approved' && !d.destination) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { destination: 'tentukan tujuan/kanal persis untuk persetujuan' })
  const id = newId('apr'), t = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO approvals (id, asset_version_id, body_sha256, reviewer_user_id, decision, destination, note, decided_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, v.id, v.body_sha256, c.get('user').id, d.decision, d.destination ?? null, d.note ?? null, t),
    c.env.DB.prepare('UPDATE content_assets SET status = ?, updated_at = ? WHERE id = ?').bind(d.decision, t, v.asset_id),
  ])
  await audit(c.env.DB, { workspace_id: v.workspace_id, actor_user_id: c.get('user').id, action: `content.${d.decision}`, resource_type: 'asset_version', resource_id: v.id })
  return c.json({ approval_id: id, asset: await loadAsset(c, v.asset_id) }, 201)
})

// ---------- Experiments (manual publication log) ----------
api.get('/workspaces/:id/experiments', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    `SELECT e.*, a.title AS asset_title, a.id AS asset_id, v.version_number, ap.destination AS approved_destination,
       (SELECT COUNT(*) FROM observations o WHERE o.experiment_id = e.id) AS observation_count
     FROM experiments e JOIN content_versions v ON v.id = e.asset_version_id JOIN content_assets a ON a.id = v.asset_id
     LEFT JOIN approvals ap ON ap.id = e.approval_id
     WHERE e.workspace_id = ? ORDER BY e.created_at DESC LIMIT 500`
  ).bind(ws.id).all()
  return c.json({ experiments: results })
})

api.post('/workspaces/:id/experiments', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const d = validate<any>(await body(c), {
    asset_version_id: { type: 'string', required: true, max: 64 },
    hypothesis: { type: 'string', required: true, max: 2000 },
    channel: { type: 'string', required: true, max: 200 },
  })
  const v = await ownVersion(c, d.asset_version_id)
  if (v.workspace_id !== ws.id) throw notFound()
  const ap = await c.env.DB.prepare(`SELECT * FROM approvals WHERE asset_version_id = ? AND decision = 'approved' AND body_sha256 = ? ORDER BY decided_at DESC LIMIT 1`)
    .bind(v.id, v.body_sha256).first<any>()
  if (!ap) throw new ApiError(409, 'approval_required', 'Versi konten ini belum disetujui. Setujui versi persis ini terlebih dahulu.')
  const id = newId('exp'), t = nowIso()
  await c.env.DB.prepare(`INSERT INTO experiments (id, workspace_id, asset_version_id, approval_id, hypothesis, channel, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,'planned',?,?,?)`)
    .bind(id, ws.id, v.id, ap.id, d.hypothesis, d.channel, c.get('user').id, t, t).run()
  await audit(c.env.DB, { workspace_id: ws.id, actor_user_id: c.get('user').id, action: 'experiment.create', resource_type: 'experiment', resource_id: id })
  return c.json({ experiment: await loadExperiment(c, id) }, 201)
})

async function loadExperiment(c: any, id: string) {
  const e = await ownRow(c, 'experiments', id)
  const { results } = await c.env.DB.prepare('SELECT * FROM observations WHERE experiment_id = ? ORDER BY recorded_at DESC').bind(id).all()
  const v = await c.env.DB.prepare('SELECT v.version_number, v.body, a.title, a.id AS asset_id FROM content_versions v JOIN content_assets a ON a.id = v.asset_id WHERE v.id = ?').bind(e.asset_version_id).first()
  const ap = e.approval_id ? await c.env.DB.prepare('SELECT destination, decided_at FROM approvals WHERE id = ?').bind(e.approval_id).first() : null
  return { ...e, version: v, approval: ap, observations: results }
}

api.get('/experiments/:id', async (c) => c.json({ experiment: await loadExperiment(c, c.req.param('id')) }))

api.patch('/experiments/:id', async (c) => {
  const e = await ownRow(c, 'experiments', c.req.param('id'))
  const d = validate<any>(await body(c), {
    status: { type: 'string', enum: ['planned', 'published', 'not_published'] },
    published_at: { type: 'string', date: true },
    published_url: { type: 'string', max: 2000, url: true },
    stop_reason: { type: 'string', max: 2000 },
    next_decision: { type: 'string', max: 2000 },
    hypothesis: { type: 'string', max: 2000 },
  }, true)
  const status = d.status ?? e.status
  if (status === 'published' && !(d.published_url ?? e.published_url)) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { published_url: 'URL publikasi wajib saat status terbit' })
  if (status === 'not_published' && !(d.stop_reason ?? e.stop_reason)) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { stop_reason: 'alasan wajib saat sengaja tidak diterbitkan' })
  if (status === 'published' && !d.published_at && !e.published_at) d.published_at = nowIso()
  const { sql, values } = setClause({ ...d, updated_at: nowIso() })
  await c.env.DB.prepare(`UPDATE experiments SET ${sql} WHERE id = ?`).bind(...values, e.id).run()
  await audit(c.env.DB, { workspace_id: e.workspace_id, actor_user_id: c.get('user').id, action: 'experiment.update', resource_type: 'experiment', resource_id: e.id })
  return c.json({ experiment: await loadExperiment(c, e.id) })
})

api.post('/experiments/:id/observations', async (c) => {
  const e = await ownRow(c, 'experiments', c.req.param('id'))
  const d = validate<any>(await body(c), {
    metric_name: { type: 'string', required: true, max: 100 },
    value_status: { type: 'string', required: true, enum: ['observed', 'not_yet_available', 'not_collected', 'failed'] },
    numeric_value: { type: 'number', min: -1e12, max: 1e12 },
    unit: { type: 'string', required: true, max: 50 },
    window_start: { type: 'string', date: true },
    window_end: { type: 'string', date: true },
    origin: { type: 'string', required: true, enum: ['manual', 'imported', 'api'] },
    source_reference: { type: 'string', max: 500 },
    notes: { type: 'string', max: 2000 },
  })
  if (d.value_status === 'observed') {
    if (d.numeric_value === undefined || d.numeric_value === null) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { numeric_value: 'nilai wajib untuk status "teramati" (0 berarti nol nyata)' })
    if (!d.window_start || !d.window_end) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { window_start: 'jendela observasi wajib untuk nilai teramati' })
    if (Date.parse(d.window_end) < Date.parse(d.window_start)) throw new ApiError(400, 'validation_failed', 'Input tidak valid.', { window_end: 'harus setelah awal jendela' })
  } else d.numeric_value = null // missing data is never stored as zero
  const id = newId('obs')
  await c.env.DB.prepare(`INSERT INTO observations (id, experiment_id, metric_name, value_status, numeric_value, unit, window_start, window_end, origin, source_reference, notes, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, e.id, d.metric_name, d.value_status, d.numeric_value, d.unit, d.window_start ?? null, d.window_end ?? null, d.origin, d.source_reference ?? null, d.notes ?? null, c.get('user').id, nowIso()).run()
  return c.json({ experiment: await loadExperiment(c, e.id) }, 201)
})

// ---------- Learning summary (deterministic, from recorded data only) ----------
api.get('/workspaces/:id/learning-summary', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const { results: experiments } = await c.env.DB.prepare(
    `SELECT e.*, a.title AS asset_title, a.opportunity_id, o.title AS opportunity_title FROM experiments e
     JOIN content_versions v ON v.id = e.asset_version_id JOIN content_assets a ON a.id = v.asset_id JOIN opportunities o ON o.id = a.opportunity_id
     WHERE e.workspace_id = ? ORDER BY e.created_at`
  ).bind(ws.id).all<any>()
  const { results: observations } = await c.env.DB.prepare(
    'SELECT o.* FROM observations o JOIN experiments e ON e.id = o.experiment_id WHERE e.workspace_id = ?'
  ).bind(ws.id).all<any>()
  return c.json({ summary: buildLearningSummary(experiments, observations) })
})

// ---------- Export & delete ----------
api.get('/workspaces/:id/export', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  const all = (sql: string) => c.env.DB.prepare(sql).bind(ws.id).all().then((r) => r.results)
  const data = {
    format: 'oltavyn-export', format_version: 1, exported_at: nowIso(),
    workspace: ws,
    evidence_items: await all('SELECT * FROM evidence_items WHERE workspace_id = ?'),
    opportunities: await all('SELECT * FROM opportunities WHERE workspace_id = ?'),
    opportunity_evidence: await all('SELECT oe.* FROM opportunity_evidence oe JOIN opportunities o ON o.id = oe.opportunity_id WHERE o.workspace_id = ?'),
    content_assets: await all('SELECT * FROM content_assets WHERE workspace_id = ?'),
    content_versions: await all('SELECT v.* FROM content_versions v JOIN content_assets a ON a.id = v.asset_id WHERE a.workspace_id = ?'),
    approvals: await all('SELECT ap.* FROM approvals ap JOIN content_versions v ON v.id = ap.asset_version_id JOIN content_assets a ON a.id = v.asset_id WHERE a.workspace_id = ?'),
    experiments: await all('SELECT * FROM experiments WHERE workspace_id = ?'),
    observations: await all('SELECT o.* FROM observations o JOIN experiments e ON e.id = o.experiment_id WHERE e.workspace_id = ?'),
    audit_events: await all('SELECT id, action, resource_type, resource_id, outcome, created_at FROM audit_events WHERE workspace_id = ?'),
  }
  await audit(c.env.DB, { workspace_id: ws.id, actor_user_id: c.get('user').id, action: 'workspace.export', resource_type: 'workspace', resource_id: ws.id })
  c.header('Content-Disposition', `attachment; filename="oltavyn-${ws.id}.json"`)
  return c.json(data)
})

// Hard delete; requires typed confirmation of the workspace name. Children removed explicitly (no reliance on PRAGMA).
api.delete('/workspaces/:id', async (c) => {
  const ws = await ownWorkspace(c, c.req.param('id'))
  if (c.req.query('confirm') !== ws.name) throw new ApiError(400, 'confirmation_required', 'Ketik nama workspace persis untuk mengonfirmasi penghapusan.')
  const id = ws.id
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM observations WHERE experiment_id IN (SELECT id FROM experiments WHERE workspace_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM experiments WHERE workspace_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM approvals WHERE asset_version_id IN (SELECT v.id FROM content_versions v JOIN content_assets a ON a.id = v.asset_id WHERE a.workspace_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM content_versions WHERE asset_id IN (SELECT id FROM content_assets WHERE workspace_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM content_assets WHERE workspace_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM opportunity_evidence WHERE opportunity_id IN (SELECT id FROM opportunities WHERE workspace_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM opportunities WHERE workspace_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM evidence_items WHERE workspace_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id),
  ])
  await audit(c.env.DB, { workspace_id: id, actor_user_id: c.get('user').id, action: 'workspace.delete', resource_type: 'workspace', resource_id: id })
  return c.json({ deleted: true, id })
})
