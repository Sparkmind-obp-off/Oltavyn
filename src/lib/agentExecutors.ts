// Server-owned executors for the central OLTAVYN Agent.
// Read tools run immediately, always scoped to the caller's workspace.
// Write tools never execute directly: they create an approval request bound to an action hash;
// a separate, explicit user decision revalidates and executes it exactly once.
import { AGENT_TOOLS, DRAFT_FORMATS, actionHash, authorizeTool } from './agentRuntime'
import { newId, nowIso, sha256Hex } from './core'

const PRODUCT_STATUSES = ['candidate', 'shortlisted', 'selected', 'rejected', 'archived']
const APPROVAL_TTL_MS = 24 * 3600 * 1000

export class AgentToolError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export async function executeReadTool(db: D1Database, wsId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
  const first = (sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).first() as Promise<any>
  const all = async (sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).all()).results
  switch (name) {
    case 'workspace.get_summary': {
      const [p, sl, ch, act, ev, ca, ex, pend] = await Promise.all([
        first("SELECT COUNT(*) n FROM affiliate_products WHERE workspace_id=? AND lifecycle_status<>'archived'", wsId),
        first("SELECT COUNT(*) n FROM affiliate_products WHERE workspace_id=? AND lifecycle_status IN ('shortlisted','selected')", wsId),
        first("SELECT COUNT(*) n FROM affiliate_channels WHERE workspace_id=? AND status<>'archived'", wsId),
        first("SELECT COUNT(*) n FROM affiliate_channels WHERE workspace_id=? AND status='active'", wsId),
        first("SELECT COUNT(*) n FROM evidence_items WHERE workspace_id=? AND status='active'", wsId),
        first('SELECT COUNT(*) n FROM content_assets WHERE workspace_id=?', wsId),
        first('SELECT COUNT(*) n FROM experiments WHERE workspace_id=?', wsId),
        first("SELECT COUNT(*) n FROM agent_approval_requests WHERE workspace_id=? AND status='pending'", wsId),
      ])
      return { products: p?.n || 0, shortlisted: sl?.n || 0, channels: ch?.n || 0, active_channels: act?.n || 0, evidence_items: ev?.n || 0, content_assets: ca?.n || 0, experiments: ex?.n || 0, pending_approvals: pend?.n || 0 }
    }
    case 'products.list': {
      const status = typeof input.status === 'string' && PRODUCT_STATUSES.includes(input.status) ? input.status : null
      const query = typeof input.query === 'string' ? input.query : ''
      const where = ['workspace_id=?'], binds: unknown[] = [wsId]
      if (status) { where.push('lifecycle_status=?'); binds.push(status) } else where.push("lifecycle_status<>'archived'")
      if (query) { where.push('(title LIKE ? OR category LIKE ?)'); binds.push('%' + query + '%', '%' + query + '%') }
      return { products: await all('SELECT id,title,category,price_amount,commission_rate_percent,product_rating,review_count,sold_count,evidence_state,lifecycle_status FROM affiliate_products WHERE ' + where.join(' AND ') + ' ORDER BY updated_at DESC LIMIT 50', ...binds) }
    }
    case 'product.get': {
      const p = await first('SELECT id,title,category,canonical_url,marketplace,price_amount,commission_rate_percent,commission_amount,product_rating,review_count,sold_count,seller_name,seller_rating,evidence_state,lifecycle_status,notes FROM affiliate_products WHERE id=? AND workspace_id=?', input.product_id, wsId)
      if (!p) throw new AgentToolError(404, 'not_found', 'Produk tidak ditemukan di workspace ini.')
      const [evidence, score] = await Promise.all([
        all('SELECT e.id,e.title,e.source_url,e.excerpt,e.observed_at,pe.relationship FROM affiliate_product_evidence pe JOIN evidence_items e ON e.id=pe.evidence_item_id WHERE pe.product_id=? AND e.workspace_id=? LIMIT 20', p.id, wsId),
        first('SELECT score_demand,score_quality,score_commission,score_visual_potential,score_price_accessibility,score_seller_risk,weighted_total,rationale_json,created_at FROM affiliate_product_scorecards WHERE product_id=? ORDER BY created_at DESC LIMIT 1', p.id),
      ])
      return { product: p, evidence, latest_scorecard: score || null }
    }
    case 'channels.list':
      return { channels: await all("SELECT id,platform,channel_name,handle,status FROM affiliate_channels WHERE workspace_id=? AND status<>'archived' ORDER BY created_at DESC LIMIT 50", wsId) }
    case 'evidence.list':
      return { evidence: await all("SELECT id,title,source_type,source_url,excerpt,observed_at,status FROM evidence_items WHERE workspace_id=? AND status='active' ORDER BY captured_at DESC LIMIT 50", wsId) }
    case 'opportunities.list':
      return { opportunities: await all("SELECT id,title,audience_problem,is_hypothesis,status FROM opportunities WHERE workspace_id=? AND status<>'rejected' ORDER BY updated_at DESC LIMIT 50", wsId) }
    case 'content.list':
      return { content: await all('SELECT id,title,format,status,updated_at FROM content_assets WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 50', wsId) }
  }
  throw new AgentToolError(400, 'executor_not_found', 'Executor tool tidak tersedia.')
}

// Validate a write request and park it as a pending approval. Nothing is saved here.
export async function createApproval(db: D1Database, a: { runId: string; stepId: string | null; wsId: string; userId: string; toolId: string; input: Record<string, unknown> }) {
  if (a.toolId !== 'content.save_draft') throw new AgentToolError(403, 'tool_disabled', 'Tool tulis ini belum memiliki executor.')
  const format = String(a.input.format)
  if (!(DRAFT_FORMATS as readonly string[]).includes(format)) throw new AgentToolError(400, 'invalid_format', 'Format draf tidak didukung: ' + DRAFT_FORMATS.join(', '))
  const opp = await db.prepare("SELECT id,title FROM opportunities WHERE id=? AND workspace_id=? AND status<>'rejected'").bind(a.input.opportunity_id, a.wsId).first() as any
  if (!opp) throw new AgentToolError(400, 'invalid_opportunity', 'Peluang tidak ditemukan di workspace ini. Gunakan opportunities.list terlebih dahulu.')
  const hash = await actionHash(a.toolId, a.input)
  const id = newId('apv'), now = nowIso(), expires = new Date(Date.now() + APPROVAL_TTL_MS).toISOString()
  const summary = { tool_id: a.toolId, input: a.input, preview: { title: a.input.title, format, opportunity: opp.title, body_excerpt: String(a.input.body).slice(0, 600), body_length: String(a.input.body).length } }
  await db.prepare("INSERT INTO agent_approval_requests (id,run_id,step_id,workspace_id,requested_by,permission_class,action_hash,summary_json,status,expires_at,created_at) VALUES (?,?,?,?,?,'W1',?,?,'pending',?,?)")
    .bind(id, a.runId, a.stepId, a.wsId, a.userId, hash, JSON.stringify(summary), expires, now).run()
  return { approval_required: true, approval_id: id, expires_at: expires, preview: summary.preview, note: 'BELUM TERSIMPAN. Pengguna harus menyetujui di panel persetujuan.' }
}

// Explicit user decision. Revalidates ownership, expiry, action hash and tool policy; executes once.
export async function decideApproval(db: D1Database, a: { approvalId: string; userId: string; decision: 'approve' | 'reject' }) {
  const row = await db.prepare('SELECT r.* FROM agent_approval_requests r JOIN workspaces w ON w.id=r.workspace_id WHERE r.id=? AND w.owner_user_id=?').bind(a.approvalId, a.userId).first() as any
  if (!row) throw new AgentToolError(404, 'not_found', 'Permintaan persetujuan tidak ditemukan.')
  if (row.status !== 'pending') throw new AgentToolError(409, 'already_decided', 'Permintaan ini sudah diproses (' + row.status + ').')
  const now = nowIso()
  if (Date.parse(row.expires_at) < Date.now()) {
    await db.prepare("UPDATE agent_approval_requests SET status='expired' WHERE id=? AND status='pending'").bind(row.id).run()
    throw new AgentToolError(410, 'approval_expired', 'Permintaan persetujuan sudah kedaluwarsa. Minta Agent membuat ulang.')
  }
  if (a.decision === 'reject') {
    await db.prepare("UPDATE agent_approval_requests SET status='rejected',decided_by=?,decided_at=? WHERE id=? AND status='pending'").bind(a.userId, now, row.id).run()
    if (row.step_id) await db.prepare("UPDATE agent_run_steps SET status='skipped',error_code='rejected_by_user',completed_at=? WHERE id=?").bind(now, row.step_id).run()
    await settleRun(db, row.run_id)
    return { status: 'rejected' }
  }
  const summary = JSON.parse(String(row.summary_json))
  const auth = authorizeTool(summary.tool_id, summary.input)
  if (!auth.ok || !auth.requiresApproval) throw new AgentToolError(403, 'policy_changed', 'Policy tool berubah; tindakan tidak dapat dijalankan.')
  if ((await actionHash(summary.tool_id, summary.input)) !== row.action_hash) throw new AgentToolError(409, 'action_tampered', 'Isi tindakan tidak cocok dengan yang diminta.')
  const opp = await db.prepare("SELECT id FROM opportunities WHERE id=? AND workspace_id=? AND status<>'rejected'").bind(summary.input.opportunity_id, row.workspace_id).first() as any
  if (!opp) throw new AgentToolError(409, 'opportunity_unavailable', 'Peluang terkait sudah tidak tersedia.')
  // Claim the approval first so concurrent approvals cannot double-save.
  const claim = await db.prepare("UPDATE agent_approval_requests SET status='approved',decided_by=?,decided_at=? WHERE id=? AND status='pending'").bind(a.userId, now, row.id).run()
  if (!claim.meta.changes) throw new AgentToolError(409, 'already_decided', 'Permintaan ini sudah diproses.')
  const assetId = newId('ast'), versionId = newId('ver'), body = String(summary.input.body)
  const claims = [{ text: 'Draf dihasilkan AI (OLTAVYN Agent). Semua klaim faktual wajib diverifikasi dan dipetakan ke bukti sebelum disetujui.', evidence_ids: [], status: 'unsupported' }]
  try {
    await db.batch([
      db.prepare("INSERT INTO content_assets (id,workspace_id,opportunity_id,title,format,status,current_version_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?,?)")
        .bind(assetId, row.workspace_id, opp.id, String(summary.input.title).slice(0, 200), String(summary.input.format), versionId, a.userId, now, now),
      db.prepare('INSERT INTO content_versions (id,asset_id,version_number,body,body_sha256,claims_json,generator,created_by,created_at) VALUES (?,?,1,?,?,?,?,?,?)')
        .bind(versionId, assetId, body, await sha256Hex(body), JSON.stringify(claims), 'agent_groq', a.userId, now),
    ])
  } catch (e) {
    await db.prepare("UPDATE agent_approval_requests SET status='pending',decided_by=NULL,decided_at=NULL WHERE id=?").bind(row.id).run()
    throw e
  }
  if (row.step_id) await db.prepare("UPDATE agent_run_steps SET status='completed',output_json=?,completed_at=? WHERE id=?").bind(JSON.stringify({ saved: true, asset_id: assetId, version_id: versionId }), now, row.step_id).run()
  await settleRun(db, row.run_id)
  return { status: 'approved', saved: true, asset_id: assetId, version_id: versionId, workspace_id: row.workspace_id }
}

async function settleRun(db: D1Database, runId: string) {
  const pending = await db.prepare("SELECT COUNT(*) n FROM agent_approval_requests WHERE run_id=? AND status='pending'").bind(runId).first() as any
  if (!pending?.n) await db.prepare("UPDATE agent_runs SET state='completed',updated_at=? WHERE id=? AND state='needs_approval'").bind(nowIso(), runId).run()
}

export const toolPermission = (id: string) => AGENT_TOOLS.find((t) => t.id === id)?.permission || 'R0'
export const toolVersion = (id: string) => AGENT_TOOLS.find((t) => t.id === id)?.version || 'unknown'
