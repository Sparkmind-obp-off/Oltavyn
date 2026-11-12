import { Hono } from 'hono'
import { ApiError, AppEnv, audit, newId, nowIso, rateLimit, safeEqual } from '../lib/core'
import { requireAuth } from './auth'

type DuitkuEnv = {
  DUITKU_MERCHANT_CODE?: string
  DUITKU_API_KEY?: string
  DUITKU_BASE_URL?: string
  PUBLIC_APP_URL?: string
  DUITKU_CHECKOUT_ENABLED?: string
}
const api = new Hono<AppEnv>()
const clean = (v: unknown, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const json = async (c: any) => { try { const v = await c.req.json(); if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; return v } catch { throw new ApiError(400,'invalid_json','Body JSON tidak valid.') } }
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('')
async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))
}
function duitkuConfig(env: DuitkuEnv, requireEnabled = true) {
  if (requireEnabled && env.DUITKU_CHECKOUT_ENABLED !== 'true') throw new ApiError(503,'checkout_disabled','Checkout Duitku belum diaktifkan oleh administrator.')
  if (!env.DUITKU_MERCHANT_CODE || !env.DUITKU_API_KEY) throw new ApiError(503,'duitku_not_configured','Duitku belum dikonfigurasi di Cloudflare Secrets.')
  const base = (env.DUITKU_BASE_URL || 'https://api-prod.duitku.com').replace(/\/$/,'')
  if (base !== 'https://api-prod.duitku.com') throw new ApiError(503,'duitku_base_url_invalid','OLTAVYN hanya menerima endpoint Duitku Production. Sandbox tidak diizinkan pada konfigurasi ini.')
  const origin = (env.PUBLIC_APP_URL || 'https://oltavyn.pages.dev').replace(/\/$/,'')
  let u: URL
  try { u = new URL(origin) } catch { throw new ApiError(503,'public_url_invalid','PUBLIC_APP_URL tidak valid.') }
  if (u.protocol !== 'https:') throw new ApiError(503,'public_url_invalid','PUBLIC_APP_URL harus HTTPS.')
  return { merchant: env.DUITKU_MERCHANT_CODE, key: env.DUITKU_API_KEY, base, origin }
}
const uid = (c: any) => c.get('user').id

// Catalog is authenticated for now; price and scope always come from server-side D1.
api.get('/catalog', async c => {
  const rows = await c.env.DB.prepare("SELECT sku,name,description,price_idr,billing_type,deliverables_json,exclusions_json FROM commercial_catalog WHERE status='active' ORDER BY sort_order").all()
  return c.json({ checkout_enabled: (c.env as any).DUITKU_CHECKOUT_ENABLED === 'true' && !!(c.env as any).DUITKU_MERCHANT_CODE && !!(c.env as any).DUITKU_API_KEY, catalog: (rows.results as any[]).map(r=>({...r,currency:'IDR',deliverables:JSON.parse(r.deliverables_json),exclusions:JSON.parse(r.exclusions_json)})) })
})

// Every order is bound to a workspace owned by the authenticated user.
api.post('/orders', async c => {
  await rateLimit(c.env.DB, `commercial-order:${uid(c)}`, 10, 3600)
  const d = await json(c), workspaceId = clean(d.workspace_id,120), sku = clean(d.sku,80)
  const key = clean(c.req.header('idempotency-key') || d.idempotency_key,120)
  if (!workspaceId || !sku || !/^[a-zA-Z0-9._:-]{8,120}$/.test(key)) throw new ApiError(400,'validation_failed','workspace_id, sku, dan Idempotency-Key valid wajib diisi.')
  const ws = await c.env.DB.prepare('SELECT id FROM workspaces WHERE id=? AND owner_user_id=?').bind(workspaceId,uid(c)).first()
  if (!ws) throw new ApiError(404,'not_found','Workspace tidak ditemukan.')
  const existing = await c.env.DB.prepare('SELECT id,status,total_idr FROM commercial_orders WHERE user_id=? AND idempotency_key=?').bind(uid(c),key).first<any>()
  if (existing) return c.json({ order: existing, reused: true })
  const item = await c.env.DB.prepare("SELECT * FROM commercial_catalog WHERE sku=? AND status='active'").bind(sku).first<any>()
  if (!item) throw new ApiError(404,'catalog_item_not_found','Paket tidak tersedia.')
  const orderId = newId('ord'), itemId = newId('oit'), merchantOrderId = 'OLT-' + crypto.randomUUID().replace(/-/g,'').slice(0,20).toUpperCase(), now = nowIso()
  const note = clean(d.customer_note,1000) || null
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO commercial_orders (id,merchant_order_id,user_id,workspace_id,status,currency,subtotal_idr,total_idr,customer_note,idempotency_key,created_at,updated_at) VALUES (?,?,?,?, 'pending_payment','IDR',?,?,?,?,?,?)")
      .bind(orderId,merchantOrderId,uid(c),workspaceId,item.price_idr,item.price_idr,note,key,now,now),
    c.env.DB.prepare("INSERT INTO commercial_order_items (id,order_id,catalog_id,sku_snapshot,name_snapshot,quantity,unit_price_idr,line_total_idr,deliverables_snapshot_json,exclusions_snapshot_json) VALUES (?,?,?,?,?,1,?,?,?,?)")
      .bind(itemId,orderId,item.id,item.sku,item.name,item.price_idr,item.price_idr,item.deliverables_json,item.exclusions_json)
  ])
  await audit(c.env.DB,{workspace_id:workspaceId,actor_user_id:uid(c),action:'commercial.order.created',resource_type:'commercial_order',resource_id:orderId})
  return c.json({order:{id:orderId,merchant_order_id:merchantOrderId,status:'pending_payment',total_idr:item.price_idr,currency:'IDR'}},201)
})

api.get('/orders', async c => {
  const rows = await c.env.DB.prepare('SELECT id,merchant_order_id,status,total_idr,currency,created_at,updated_at FROM commercial_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(uid(c)).all()
  return c.json({orders:rows.results})
})
api.get('/orders/:id', async c => {
  const order = await c.env.DB.prepare('SELECT * FROM commercial_orders WHERE id=? AND user_id=?').bind(c.req.param('id'),uid(c)).first<any>()
  if (!order) throw new ApiError(404,'not_found','Pesanan tidak ditemukan.')
  const [items,payment] = await Promise.all([
    c.env.DB.prepare('SELECT sku_snapshot,name_snapshot,quantity,unit_price_idr,line_total_idr,deliverables_snapshot_json,exclusions_snapshot_json FROM commercial_order_items WHERE order_id=?').bind(order.id).all(),
    c.env.DB.prepare('SELECT provider,reference,payment_method,payment_url,amount_idr,status,created_at,updated_at FROM commercial_payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1').bind(order.id).first()
  ])
  return c.json({order,items:items.results,payment})
})

api.post('/orders/:id/checkout', async c => {
  await rateLimit(c.env.DB, `commercial-checkout:${uid(c)}`, 10, 3600)
  const order = await c.env.DB.prepare('SELECT * FROM commercial_orders WHERE id=? AND user_id=?').bind(c.req.param('id'),uid(c)).first<any>()
  if (!order) throw new ApiError(404,'not_found','Pesanan tidak ditemukan.')
  if (order.status !== 'pending_payment') throw new ApiError(409,'order_not_payable','Pesanan tidak lagi menunggu pembayaran.')
  const previous = await c.env.DB.prepare("SELECT * FROM commercial_payments WHERE order_id=? AND status IN ('created','pending') ORDER BY created_at DESC LIMIT 1").bind(order.id).first<any>()
  if (previous?.payment_url) return c.json({payment_url:previous.payment_url,reference:previous.reference,merchant_order_id:previous.merchant_order_id,reused:true})
  const cfg = duitkuConfig(c.env as unknown as DuitkuEnv)
  const items = await c.env.DB.prepare('SELECT name_snapshot,quantity,line_total_idr FROM commercial_order_items WHERE order_id=?').bind(order.id).all<any>()
  const itemDetails = items.results.map((x:any)=>({name:String(x.name_snapshot).slice(0,50),price:Number(x.line_total_idr),quantity:Number(x.quantity)}))
  const timestamp = String(Date.now())
  const signature = await hmacHex(cfg.key,cfg.merchant+timestamp)
  const payload = {
    paymentAmount:order.total_idr,
    merchantOrderId:order.merchant_order_id,
    productDetails:'OLTAVYN - '+itemDetails.map((x:any)=>x.name).join(', ').slice(0,220),
    paymentMethod:'',
    customerVaName:'OLTAVYN Customer',
    email:c.get('user').email,
    itemDetails,
    callbackUrl:cfg.origin+'/api/webhooks/duitku/pop',
    returnUrl:cfg.origin+'/#/commercial',
    expiryPeriod:60
  }
  const response = await fetch(cfg.base+'/api/merchant/createInvoice',{method:'POST',headers:{'Content-Type':'application/json','x-duitku-timestamp':timestamp,'x-duitku-signature':signature,'x-duitku-merchantcode':cfg.merchant},body:JSON.stringify(payload)})
  const data:any = await response.json().catch(()=>null)
  let paymentUrl: URL | null = null
  try { paymentUrl = new URL(String(data?.paymentUrl || '')) } catch {}
  const allowedPaymentHosts = ['app-prod.duitku.com']
  if (!response.ok || !paymentUrl || paymentUrl.protocol !== 'https:' || !allowedPaymentHosts.includes(paymentUrl.hostname) || !data?.reference) throw new ApiError(502,'duitku_invoice_failed','Duitku belum berhasil membuat invoice.',{provider_status:response.status,provider_message:clean(data?.Message || data?.message,240)})
  const paymentId = newId('pay'), now = nowIso()
  await c.env.DB.prepare("INSERT INTO commercial_payments (id,order_id,provider,merchant_order_id,reference,payment_method,payment_url,amount_idr,status,provider_payload_json,created_at,updated_at) VALUES (?,?,'duitku_pop',?,?,?,?,?,'pending',?,?,?)")
    .bind(paymentId,order.id,order.merchant_order_id,String(data.reference),clean(data.paymentMethod,40)||null,String(data.paymentUrl).slice(0,2000),order.total_idr,JSON.stringify({statusCode:data.statusCode||null}),now,now).run()
  await audit(c.env.DB,{workspace_id:order.workspace_id,actor_user_id:uid(c),action:'commercial.checkout.created',resource_type:'commercial_payment',resource_id:paymentId})
  return c.json({payment_url:data.paymentUrl,reference:String(data.reference),merchant_order_id:order.merchant_order_id,reused:false})
})

// ---------- Payment state machine (shared by callback and reconciliation) ----------
// Rules: success is terminal (never downgraded); entitlement/job creation is idempotent via UNIQUE keys;
// failed/expired payments close the order so the customer starts a fresh order (no reused merchantOrderId).
export async function applyPaymentResult(db: D1Database, payment: any, result: 'paid' | 'failed' | 'expired', source: string) {
  const now = nowIso()
  if (result === 'paid') {
    await db.prepare("UPDATE commercial_payments SET status='paid',updated_at=? WHERE id=? AND status<>'paid'").bind(now,payment.id).run()
    await db.prepare("UPDATE commercial_orders SET status='paid',updated_at=? WHERE id=? AND status IN ('pending_payment','payment_failed','expired')").bind(now,payment.order_id).run()
    const items = await db.prepare('SELECT * FROM commercial_order_items WHERE order_id=?').bind(payment.order_id).all()
    for (const item of items.results as any[]) {
      await db.prepare("INSERT OR IGNORE INTO commercial_entitlements (id,order_id,order_item_id,user_id,workspace_id,sku,status,granted_at) VALUES (?,?,?,?,?,?,'active',?)")
        .bind(newId('ent'),payment.order_id,item.id,payment.user_id,payment.workspace_id,item.sku_snapshot,now).run()
      const entitlement = await db.prepare('SELECT id FROM commercial_entitlements WHERE order_item_id=?').bind(item.id).first() as any
      if (entitlement) {
        const revisionLimit = item.sku_snapshot === 'affiliate_starter' ? 0 : item.sku_snapshot === 'affiliate_growth' ? 2 : 1
        await db.prepare("INSERT OR IGNORE INTO commercial_service_jobs (id,entitlement_id,order_id,workspace_id,status,brief_json,revision_limit,created_at,updated_at) VALUES (?,?,?,?,'queued','{}',?,?,?)")
          .bind(newId('job'),entitlement.id,payment.order_id,payment.workspace_id,revisionLimit,now,now).run()
      }
    }
    await audit(db,{workspace_id:payment.workspace_id,actor_user_id:null,action:'commercial.payment.verified',resource_type:'commercial_payment',resource_id:payment.id,outcome:source})
    return
  }
  const r = await db.prepare("UPDATE commercial_payments SET status=?,updated_at=? WHERE id=? AND status IN ('created','pending')").bind(result,now,payment.id).run()
  if (r.meta.changes) {
    await db.prepare("UPDATE commercial_orders SET status=?,updated_at=? WHERE id=? AND status='pending_payment'").bind(result==='expired'?'expired':'payment_failed',now,payment.order_id).run()
    await audit(db,{workspace_id:payment.workspace_id,actor_user_id:null,action:'commercial.payment.'+result,resource_type:'commercial_payment',resource_id:payment.id,outcome:source})
  }
}
const PAYMENT_BY_MOID = "SELECT p.*,o.workspace_id,o.user_id,o.status AS order_status FROM commercial_payments p JOIN commercial_orders o ON o.id=p.order_id WHERE p.merchant_order_id=? AND p.provider='duitku_pop'"

// Duitku server callback (x-www-form-urlencoded). Never grant access based on browser return/JS callbacks.
export const duitkuWebhook = async (c: any) => {
  const cfg = duitkuConfig(c.env as unknown as DuitkuEnv, false)
  const form = await c.req.parseBody()
  const merchantCode = clean(form.merchantCode,80), amount = clean(form.amount,30), merchantOrderId = clean(form.merchantOrderId,120)
  const resultCode = clean(form.resultCode,20), reference = clean(form.reference,120), signature = clean(form.signature,256)
  if (!merchantCode || !amount || !merchantOrderId || !reference || !signature || !/^\d+$/.test(amount) || !['00','01'].includes(resultCode)) return c.json({error:'invalid_callback'},400)
  const expected = await hmacHex(cfg.key,merchantCode+amount+merchantOrderId)
  const valid = safeEqual(signature.toLowerCase(),expected.toLowerCase()) && safeEqual(merchantCode,cfg.merchant)
  if (!valid) return c.json({error:'invalid_signature'},401)
  const payment = await c.env.DB.prepare(PAYMENT_BY_MOID).bind(merchantOrderId).first() as any
  if (!payment || Number(amount)!==Number(payment.amount_idr) || reference!==payment.reference) return c.json({error:'payment_mismatch'},409)
  const eventKey = reference+':'+resultCode+':'+amount
  try {
    await c.env.DB.prepare('INSERT INTO commercial_payment_events (id,payment_id,provider_event_key,result_code,amount_idr,payload_json,signature_valid,received_at) VALUES (?,?,?,?,?,?,1,?)')
      .bind(newId('pev'),payment.id,eventKey,resultCode,Number(amount),JSON.stringify({merchantOrderId,resultCode,reference,paymentCode:clean(form.paymentCode,80)}),nowIso()).run()
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(String((e as Error).message))) return c.json({ok:true,duplicate:true})
    throw e
  }
  await applyPaymentResult(c.env.DB, payment, resultCode==='00' ? 'paid' : 'failed', 'callback')
  return c.json({ok:true})
}

// Official Duitku "Check Transaction" (production host only). Used by admin reconciliation; never charges.
export const DUITKU_STATUS_URL = 'https://passport.duitku.com/webapi/api/merchant/transactionStatus'
export async function reconcilePayment(env: any, db: D1Database, merchantOrderId: string, fetchImpl: typeof fetch = fetch) {
  const cfg = duitkuConfig(env as DuitkuEnv, false)
  const payment = await db.prepare(PAYMENT_BY_MOID).bind(merchantOrderId).first() as any
  if (!payment) throw new ApiError(404,'payment_not_found','Pembayaran untuk pesanan ini belum dibuat.')
  const signature = await hmacHex(cfg.key, cfg.merchant + merchantOrderId)
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),15000)
  let data: any
  try {
    const res = await fetchImpl(DUITKU_STATUS_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({merchantCode:cfg.merchant,merchantOrderId,signature}).toString(),signal:ctrl.signal})
    data = await res.json().catch(()=>null)
    if (!res.ok || !data) throw new ApiError(502,'duitku_status_failed','Duitku belum dapat memberikan status transaksi.',{provider_status:res.status})
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(504,'duitku_unreachable','Duitku tidak dapat dihubungi.') } finally { clearTimeout(t) }
  const code = clean(data.statusCode,4), amount = Number(data.amount)
  if (data.merchantOrderId && String(data.merchantOrderId) !== merchantOrderId) throw new ApiError(502,'duitku_status_mismatch','Respons Duitku tidak cocok dengan pesanan.')
  if (code === '00' && amount !== Number(payment.amount_idr)) throw new ApiError(409,'duitku_amount_mismatch','Nominal dari Duitku tidak sama dengan pesanan; perlu penanganan manual.')
  const result = code === '00' ? 'paid' : code === '02' ? 'failed' : null
  if (result) await applyPaymentResult(db, payment, result, 'reconciliation')
  return { merchant_order_id: merchantOrderId, provider_status_code: code || null, provider_status_message: clean(data.statusMessage,120) || null, applied: result ?? 'none_pending' }
}

api.get('/orders/:id/work', async c => {
  const order=await c.env.DB.prepare('SELECT id,status,created_at,updated_at FROM commercial_orders WHERE id=? AND user_id=?').bind(c.req.param('id'),uid(c)).first<any>()
  if(!order) throw new ApiError(404,'not_found','Pesanan tidak ditemukan.')
  const job=await c.env.DB.prepare('SELECT id,status,delivery_note,revision_count,revision_limit,created_at,updated_at,completed_at FROM commercial_service_jobs WHERE order_id=?').bind(order.id).first<any>()
  if(!job) return c.json({order,job:null,deliverables:[],revisions:[]})
  const [deliverables,revisions]=await Promise.all([
    c.env.DB.prepare("SELECT id,title,description,file_url,file_type,created_at FROM commercial_deliverables WHERE job_id=? AND visibility='customer' ORDER BY created_at DESC").bind(job.id).all(),
    c.env.DB.prepare('SELECT id,message,status,admin_note,created_at,updated_at FROM commercial_revision_requests WHERE job_id=? AND user_id=? ORDER BY created_at DESC').bind(job.id,uid(c)).all()
  ])
  return c.json({order,job,deliverables:deliverables.results,revisions:revisions.results})
})
api.post('/orders/:id/revisions', async c => {
  const body=await json(c), message=clean(body.message,2000)
  if(!message) throw new ApiError(400,'validation_failed','Jelaskan revisi yang dibutuhkan.')
  const order=await c.env.DB.prepare('SELECT id FROM commercial_orders WHERE id=? AND user_id=?').bind(c.req.param('id'),uid(c)).first<any>()
  if(!order) throw new ApiError(404,'not_found','Pesanan tidak ditemukan.')
  const job=await c.env.DB.prepare("SELECT * FROM commercial_service_jobs WHERE order_id=? AND status IN ('waiting_customer','review','delivered')").bind(order.id).first<any>()
  if(!job) throw new ApiError(409,'revision_unavailable','Permintaan revisi hanya tersedia saat pekerjaan menunggu tanggapan, ditinjau, atau telah dikirim.')
  if(job.revision_count>=job.revision_limit) throw new ApiError(409,'revision_limit_reached','Batas revisi paket ini telah digunakan.')
  const id=newId('rev'),now=nowIso()
  await c.env.DB.prepare("INSERT INTO commercial_revision_requests (id,job_id,user_id,message,status,created_at,updated_at) VALUES (?,?,?,?,'open',?,?)").bind(id,job.id,uid(c),message,now,now).run()
  await c.env.DB.prepare("INSERT INTO commercial_job_events (id,job_id,actor_user_id,event_type,note,created_at) VALUES (?,?,?,'revision_requested',?,?)").bind(newId('jev'),job.id,uid(c),message,now).run()
  await audit(c.env.DB,{workspace_id:job.workspace_id,actor_user_id:uid(c),action:'commercial.revision.requested',resource_type:'commercial_revision_request',resource_id:id})
  return c.json({ok:true,id},201)
})

export default api;
