// Duitku POP payment-safety tests against a real SQLite schema (all migrations), with a minimal D1 shim.
// NO network: Duitku is mocked. NO real charge. Run: npm run test:payments
// @ts-ignore node builtin
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { applyPaymentResult, duitkuWebhook, reconcilePayment, DUITKU_STATUS_URL } from '../src/routes/commercial'

let pass = 0, fail = 0
const ok = (c: unknown, n: string, x?: unknown) => { if (c) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, x ?? '') } }

// ---- D1 shim over node:sqlite ----
function d1(db: any): any {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } } },
    async first() { return db.prepare(sql).get(...args) ?? null },
    async all() { return { results: db.prepare(sql).all(...args) } },
  })
  return { prepare: (sql: string) => stmt(sql), batch: async (list: any[]) => { const out = []; for (const s of list) out.push(await s.run()); return out } }
}
const raw = new DatabaseSync(':memory:')
for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync('migrations/' + f, 'utf8'))
const DB = d1(raw)
const MERCHANT = 'DTEST1', KEY = 'test-only-api-key'
const env = { DB, DUITKU_MERCHANT_CODE: MERCHANT, DUITKU_API_KEY: KEY, DUITKU_BASE_URL: 'https://api-prod.duitku.com', PUBLIC_APP_URL: 'https://oltavyn.example', DUITKU_CHECKOUT_ENABLED: 'false' }

async function hmac(secret: string, v: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(v)))].map((x) => x.toString(16).padStart(2, '0')).join('')
}
// Seed: user, workspace, order (campaign_builder 299000), pending payment.
const now = new Date().toISOString()
raw.exec(`INSERT INTO users (id,email,password_hash,password_salt,password_iterations,created_at) VALUES ('u1','u1@test.local','x','00',1,'${now}')`)
raw.exec(`INSERT INTO workspaces (id,owner_user_id,name,created_at,updated_at) VALUES ('w1','u1','WS','${now}','${now}')`)
function seedOrder(n: number) {
  const o = 'o' + n, moid = 'OLT-TEST' + n, ref = 'REF' + n
  raw.exec(`INSERT INTO commercial_orders (id,merchant_order_id,user_id,workspace_id,status,currency,subtotal_idr,total_idr,idempotency_key,created_at,updated_at) VALUES ('${o}','${moid}','u1','w1','pending_payment','IDR',299000,299000,'key-${n}-xxxxxx','${now}','${now}')`)
  raw.exec(`INSERT INTO commercial_order_items (id,order_id,catalog_id,sku_snapshot,name_snapshot,quantity,unit_price_idr,line_total_idr,deliverables_snapshot_json,exclusions_snapshot_json) VALUES ('i${n}','${o}','cat_campaign_builder','campaign_builder','Campaign Builder',1,299000,299000,'[]','[]')`)
  raw.exec(`INSERT INTO commercial_payments (id,order_id,provider,merchant_order_id,reference,amount_idr,status,created_at,updated_at) VALUES ('p${n}','${o}','duitku_pop','${moid}','${ref}',299000,'pending','${now}','${now}')`)
  return { o, moid, ref }
}
const q = (sql: string) => raw.prepare(sql).get() as any
async function callback(fields: Record<string, string>, e: any = env) {
  const body = new URLSearchParams(fields)
  let status = 0, json: any = null
  const c = { env: e, req: { parseBody: async () => Object.fromEntries(body) }, json: (j: any, s = 200) => { json = j; status = s; return j } }
  try { await duitkuWebhook(c) } catch (err: any) { status = err.status; json = { error: err.code } }
  return { status, json }
}
async function signed(moid: string, ref: string, resultCode: string, amount = '299000', merchant = MERCHANT, key = KEY) {
  return { merchantCode: merchant, amount, merchantOrderId: moid, resultCode, reference: ref, paymentCode: 'BC', signature: await hmac(key, merchant + amount + moid) }
}

console.log('Callback authentication')
const A = seedOrder(1)
let r = await callback({ ...(await signed(A.moid, A.ref, '00')), signature: 'deadbeef' })
ok(r.status === 401, 'bad signature rejected (401)')
r = await callback(await signed(A.moid, A.ref, '00', '299000', 'DOTHER', KEY))
ok(r.status === 401, 'signature from another merchant code rejected')
r = await callback(await signed(A.moid, A.ref, '00', '1000'))
ok(r.status === 409, 'amount mismatch rejected (409)')
r = await callback(await signed(A.moid, 'WRONGREF', '00'))
ok(r.status === 409, 'reference mismatch rejected')
r = await callback(await signed('OLT-UNKNOWN', A.ref, '00'))
ok(r.status === 409, 'unknown order rejected')
r = await callback({ merchantCode: MERCHANT, amount: '299000' })
ok(r.status === 400, 'missing fields rejected (400)')
r = await callback(await signed(A.moid, A.ref, '99'))
ok(r.status === 400, 'undocumented resultCode rejected')
ok(q("SELECT status FROM commercial_payments WHERE id='p1'").status === 'pending' && q("SELECT COUNT(*) n FROM commercial_entitlements").n === 0, 'no state change from rejected callbacks')

console.log('Success, duplicates, late failure')
r = await callback(await signed(A.moid, A.ref, '00'))
ok(r.status === 200 && r.json.ok, 'valid success callback accepted')
ok(q("SELECT status FROM commercial_payments WHERE id='p1'").status === 'paid' && q("SELECT status FROM commercial_orders WHERE id='o1'").status === 'paid', 'payment + order paid')
ok(q("SELECT COUNT(*) n FROM commercial_entitlements WHERE order_id='o1'").n === 1 && q("SELECT COUNT(*) n FROM commercial_service_jobs WHERE order_id='o1'").n === 1, 'exactly one entitlement and one job')
ok(q("SELECT revision_limit FROM commercial_service_jobs WHERE order_id='o1'").revision_limit === 1, 'revision limit from SKU snapshot')
r = await callback(await signed(A.moid, A.ref, '00'))
ok(r.status === 200 && r.json.duplicate === true, 'replayed success is idempotent (duplicate)')
await Promise.all([1, 2, 3].map(async () => applyPaymentResult(DB, { id: 'p1', order_id: 'o1', user_id: 'u1', workspace_id: 'w1' }, 'paid', 'test')))
ok(q("SELECT COUNT(*) n FROM commercial_entitlements WHERE order_id='o1'").n === 1 && q("SELECT COUNT(*) n FROM commercial_service_jobs WHERE order_id='o1'").n === 1, 'concurrent success applications still create one entitlement/job')
r = await callback(await signed(A.moid, A.ref, '01'))
ok(r.status === 200, 'late failure callback acknowledged')
ok(q("SELECT status FROM commercial_payments WHERE id='p1'").status === 'paid' && q("SELECT status FROM commercial_orders WHERE id='o1'").status === 'paid', 'late failure never downgrades paid')

console.log('Failure then success')
const B = seedOrder(2)
r = await callback(await signed(B.moid, B.ref, '01'))
ok(q("SELECT status FROM commercial_payments WHERE id='p2'").status === 'failed' && q("SELECT status FROM commercial_orders WHERE id='o2'").status === 'payment_failed', 'failure marks payment failed / order payment_failed')
ok(q("SELECT COUNT(*) n FROM commercial_entitlements WHERE order_id='o2'").n === 0, 'failure grants nothing')
r = await callback(await signed(B.moid, B.ref, '00'))
ok(q("SELECT status FROM commercial_orders WHERE id='o2'").status === 'paid' && q("SELECT COUNT(*) n FROM commercial_service_jobs WHERE order_id='o2'").n === 1, 'later verified success still fulfils the order once')

console.log('Configuration fail-closed')
r = await callback(await signed(A.moid, A.ref, '00'), { ...env, DUITKU_BASE_URL: 'https://api-sandbox.duitku.com' })
ok(r.status === 503 && r.json.error === 'duitku_base_url_invalid', 'sandbox base URL refused')
r = await callback(await signed(A.moid, A.ref, '00'), { ...env, DUITKU_API_KEY: '' })
ok(r.status === 503, 'missing credentials refused')

console.log('Reconciliation (official Check Transaction, mocked)')
const C = seedOrder(3)
let seen: any = null
const mock = (body: any, status = 200) => (async (url: string, init: any) => { seen = { url, init }; return new Response(JSON.stringify(body), { status }) }) as any
let rec = await reconcilePayment(env, DB, C.moid, mock({ merchantOrderId: C.moid, reference: C.ref, amount: '299000', statusCode: '01', statusMessage: 'PROCESS' }))
const sentBody = new URLSearchParams(seen.init.body)
ok(seen.url === DUITKU_STATUS_URL && DUITKU_STATUS_URL.startsWith('https://passport.duitku.com/'), 'uses production Check Transaction endpoint')
ok(sentBody.get('signature') === await hmac(KEY, MERCHANT + C.moid) && !String(seen.init.body).includes(KEY), 'signature = HMAC(merchantCode+merchantOrderId), key never sent')
ok(rec.applied === 'none_pending' && q("SELECT status FROM commercial_payments WHERE id='p3'").status === 'pending', 'pending status leaves order unchanged')
try { await reconcilePayment(env, DB, C.moid, mock({ merchantOrderId: C.moid, amount: '1', statusCode: '00' })); ok(false, 'amount mismatch on reconcile refused') }
catch (e: any) { ok(e.code === 'duitku_amount_mismatch' && q("SELECT status FROM commercial_payments WHERE id='p3'").status === 'pending', 'amount mismatch on reconcile refused, nothing granted') }
rec = await reconcilePayment(env, DB, C.moid, mock({ merchantOrderId: C.moid, amount: '299000', statusCode: '00' }))
ok(rec.applied === 'paid' && q("SELECT COUNT(*) n FROM commercial_service_jobs WHERE order_id='o3'").n === 1, 'reconciled success fulfils once (missed callback recovery)')
rec = await reconcilePayment(env, DB, C.moid, mock({ merchantOrderId: C.moid, amount: '299000', statusCode: '02' }))
ok(q("SELECT status FROM commercial_payments WHERE id='p3'").status === 'paid', 'reconciled failure cannot downgrade paid')
try { await reconcilePayment(env, DB, C.moid, mock({}, 500)); ok(false, 'provider error surfaced') } catch (e: any) { ok(e.code === 'duitku_status_failed', 'provider error surfaced safely') }

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
