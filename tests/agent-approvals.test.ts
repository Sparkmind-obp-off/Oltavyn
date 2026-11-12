// Agent write-approval + provider budget tests on a real SQLite schema (all migrations). No network.
// Run: npm run test:agent-approvals
// @ts-ignore node builtin
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { authorizeTool } from '../src/lib/agentRuntime'
import { createApproval, decideApproval, executeReadTool, AgentToolError } from '../src/lib/agentExecutors'
import { assertBudget, recordUsage, usageSummary, BudgetError } from '../src/lib/usageLedger'

let pass = 0, fail = 0
const ok = (c: unknown, n: string, x?: unknown) => { if (c) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, x ?? '') } }
function d1(db: any): any {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } } },
    async first() { return db.prepare(sql).get(...args) ?? null },
    async all() { return { results: db.prepare(sql).all(...args) } },
  })
  return { prepare: (sql: string) => stmt(sql), batch: async (l: any[]) => { const o = []; for (const s of l) o.push(await s.run()); return o } }
}
const raw = new DatabaseSync(':memory:')
for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync('migrations/' + f, 'utf8'))
const DB = d1(raw)
const now = new Date().toISOString()
raw.exec(`INSERT INTO users (id,email,password_hash,password_salt,password_iterations,created_at) VALUES ('uA','a@t.local','x','00',1,'${now}'),('uB','b@t.local','x','00',1,'${now}')`)
raw.exec(`INSERT INTO workspaces (id,owner_user_id,name,created_at,updated_at) VALUES ('wA','uA','A','${now}','${now}'),('wB','uB','B','${now}','${now}')`)
raw.exec(`INSERT INTO opportunities (id,workspace_id,title,audience_problem,is_hypothesis,status,created_by,created_at,updated_at) VALUES ('oA','wA','Dapur kos','Bumbu berantakan',1,'candidate','uA','${now}','${now}'),('oB','wB','B','B',1,'candidate','uB','${now}','${now}')`)
raw.exec(`INSERT INTO affiliate_products (id,workspace_id,canonical_url,title,created_by,created_at,updated_at) VALUES ('pA','wA','https://shopee.co.id/a','Rak','uA','${now}','${now}'),('pB','wB','https://shopee.co.id/b','B','uB','${now}','${now}')`)
raw.exec(`INSERT INTO agent_runs (id,workspace_id,user_id,intent,state,idempotency_key,created_at,updated_at) VALUES ('run1','wA','uA','x','needs_approval','k1','${now}','${now}')`)
const q = (s: string) => raw.prepare(s).get() as any
const draft = { opportunity_id: 'oA', title: 'Naskah 30 detik rak bumbu', format: 'short_video_script', body: 'Hook: Bumbu berantakan? [PERLU VERIFIKASI]' }

console.log('Policy')
ok(authorizeTool('content.save_draft', draft).ok && (authorizeTool('content.save_draft', draft) as any).requiresApproval === true, 'save_draft is allowed only as approval-gated')
ok(!authorizeTool('content.save_draft', { ...draft, sql: 'DROP TABLE users' }).ok, 'unknown input field rejected')
ok(!authorizeTool('provider.actor.run', { provider: 'apify', actor_id: 'x' }).ok, 'paid Actor tool stays disabled for Agent')
ok(!authorizeTool('publication.publish', {}).ok, 'publishing stays disabled')
ok(!authorizeTool('db.query', {}).ok, 'unregistered tool rejected')

console.log('Read tools are workspace-scoped')
let out: any = await executeReadTool(DB, 'wA', 'products.list', {})
ok(out.products.length === 1 && out.products[0].id === 'pA', 'products.list returns only own workspace')
try { await executeReadTool(DB, 'wA', 'product.get', { product_id: 'pB' }); ok(false, 'cross-workspace product.get blocked') } catch (e) { ok(e instanceof AgentToolError && e.code === 'not_found', 'cross-workspace product.get blocked') }
out = await executeReadTool(DB, 'wA', 'opportunities.list', {})
ok(out.opportunities.length === 1 && out.opportunities[0].id === 'oA', 'opportunities.list scoped')

console.log('Write → approval (nothing saved yet)')
try { await createApproval(DB, { runId: 'run1', stepId: null, wsId: 'wA', userId: 'uA', toolId: 'content.save_draft', input: { ...draft, opportunity_id: 'oB' } }); ok(false, 'foreign opportunity refused') }
catch (e) { ok(e instanceof AgentToolError && e.code === 'invalid_opportunity', 'foreign-workspace opportunity refused') }
try { await createApproval(DB, { runId: 'run1', stepId: null, wsId: 'wA', userId: 'uA', toolId: 'content.save_draft', input: { ...draft, format: 'malware' } }); ok(false, 'bad format refused') }
catch (e) { ok(e instanceof AgentToolError && e.code === 'invalid_format', 'unsupported format refused') }
const ap: any = await createApproval(DB, { runId: 'run1', stepId: null, wsId: 'wA', userId: 'uA', toolId: 'content.save_draft', input: draft })
ok(ap.approval_required && ap.approval_id && q('SELECT COUNT(*) n FROM content_assets').n === 0, 'approval created; NO content saved before decision')

console.log('Decision')
try { await decideApproval(DB, { approvalId: ap.approval_id, userId: 'uB', decision: 'approve' }); ok(false, 'other user cannot approve') }
catch (e) { ok(e instanceof AgentToolError && e.code === 'not_found', 'another user cannot approve (IDOR)') }
raw.exec(`UPDATE agent_approval_requests SET summary_json=replace(summary_json,'Hook:','INJECTED:') WHERE id='${ap.approval_id}'`)
try { await decideApproval(DB, { approvalId: ap.approval_id, userId: 'uA', decision: 'approve' }); ok(false, 'tamper detected') }
catch (e) { ok(e instanceof AgentToolError && e.code === 'action_tampered' && q('SELECT COUNT(*) n FROM content_assets').n === 0, 'tampered action hash refused, nothing saved') }
raw.exec(`UPDATE agent_approval_requests SET summary_json=replace(summary_json,'INJECTED:','Hook:') WHERE id='${ap.approval_id}'`)
const res: any = await decideApproval(DB, { approvalId: ap.approval_id, userId: 'uA', decision: 'approve' })
ok(res.saved && q(`SELECT COUNT(*) n FROM content_assets WHERE id='${res.asset_id}' AND workspace_id='wA' AND status='draft'`).n === 1, 'approve saves exactly one draft in own workspace')
ok(q(`SELECT generator, claims_json FROM content_versions WHERE id='${res.version_id}'`).generator === 'agent_groq' && /unsupported/.test(q(`SELECT claims_json FROM content_versions WHERE id='${res.version_id}'`).claims_json), 'saved version labelled AI, claims unsupported until verified')
try { await decideApproval(DB, { approvalId: ap.approval_id, userId: 'uA', decision: 'approve' }); ok(false, 'double approve blocked') }
catch (e) { ok(e instanceof AgentToolError && e.code === 'already_decided' && q('SELECT COUNT(*) n FROM content_assets').n === 1, 'second approval cannot double-save') }
ok(q("SELECT state FROM agent_runs WHERE id='run1'").state === 'completed', 'run settles to completed when no approvals pending')

const ap2: any = await createApproval(DB, { runId: 'run1', stepId: null, wsId: 'wA', userId: 'uA', toolId: 'content.save_draft', input: { ...draft, title: 'Kedua' } })
const rj: any = await decideApproval(DB, { approvalId: ap2.approval_id, userId: 'uA', decision: 'reject' })
ok(rj.status === 'rejected' && q('SELECT COUNT(*) n FROM content_assets').n === 1, 'reject saves nothing')
const ap3: any = await createApproval(DB, { runId: 'run1', stepId: null, wsId: 'wA', userId: 'uA', toolId: 'content.save_draft', input: { ...draft, title: 'Ketiga' } })
raw.exec(`UPDATE agent_approval_requests SET expires_at='2000-01-01T00:00:00Z' WHERE id='${ap3.approval_id}'`)
try { await decideApproval(DB, { approvalId: ap3.approval_id, userId: 'uA', decision: 'approve' }); ok(false, 'expired refused') }
catch (e) { ok(e instanceof AgentToolError && e.code === 'approval_expired' && q('SELECT COUNT(*) n FROM content_assets').n === 1, 'expired approval refused') }

console.log('Budget hard stop')
try { await assertBudget(DB, {}, 0.05); ok(false, 'no budget → refuse') } catch (e) { ok(e instanceof BudgetError && e.code === 'budget_not_configured', 'paid run refused when no budget configured (fail closed)') }
const env = { PROVIDER_MONTHLY_BUDGET_USD: '0.10' }
await assertBudget(DB, env, 0.05)
await recordUsage(DB, { workspaceId: 'wA', userId: 'uA', provider: 'apify', operation: 'actor.run', status: 'succeeded', reservedUsd: 0.05, costBasis: 'per_run_cap_reserved' })
await recordUsage(DB, { workspaceId: 'wA', userId: 'uA', provider: 'apify', operation: 'actor.run', status: 'failed', reservedUsd: 0.05, costBasis: 'none' })
await assertBudget(DB, env, 0.05)
ok(true, 'failed runs do not consume budget')
await recordUsage(DB, { workspaceId: 'wA', userId: 'uA', provider: 'apify', operation: 'actor.run', status: 'succeeded', reservedUsd: 0.05, costBasis: 'per_run_cap_reserved' })
try { await assertBudget(DB, env, 0.01); ok(false, 'over budget refused') } catch (e) { ok(e instanceof BudgetError && e.code === 'budget_exhausted', 'hard stop when monthly budget reached') }
await recordUsage(DB, { workspaceId: 'wA', userId: 'uA', provider: 'groq', operation: 'agent.chat', status: 'succeeded', units: { total_tokens: 1234 }, costBasis: 'tokens_only_free_tier' })
const sum: any = await usageSummary(DB, env, 'uA')
const g = sum.providers.find((p: any) => p.provider === 'groq')
ok(g.tokens === 1234 && g.actual_cost_usd === null && sum.month_spend_usd === 0.1 && sum.remaining_usd === 0, 'summary: tokens counted, unknown cost stays NULL, remaining budget 0')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
