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
  const base = (env.DUITKU_BASE_URL || 'https://api-sandbox.duitku.com').replace(/\/$/,'')
  if (!['https://api-sandbox.duitku.com','https://api-prod.duitku.com'].includes(base)) throw new ApiError(503,'duitku_base_url_invalid','Base URL Duitku tidak diizinkan.')
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
  const allowedPaymentHosts = cfg.base.includes('sandbox') ? ['app-sandbox.duitku.com'] : ['app-prod.duitku.com']
  if (!response.ok || !paymentUrl || paymentUrl.protocol !== 'https:' || !allowedPaymentHosts.includes(paymentUrl.hostname) || !data?.reference) throw new ApiError(502,'duitku_invoice_failed','Duitku belum berhasil membuat invoice.',{provider_status:response.status,provider_message:clean(data?.Message || data?.message,240)})
  const paymentId = newId('pay'), now = nowIso()
  await c.env.DB.prepare("INSERT INTO commercial_payments (id,order_id,provider,merchant_order_id,reference,payment_method,payment_url,amount_idr,status,provider_payload_json,created_at,updated_at) VALUES (?,?,'duitku_pop',?,?,?,?,?,'pending',?,?,?)")
    .bind(paymentId,order.id,order.merchant_order_id,String(data.reference),clean(data.paymentMethod,40)||null,String(data.paymentUrl,2000),order.total_idr,JSON.stringify({statusCode:data.statusCode||null}),now,now).run()
  await audit(c.env.DB,{workspace_id:order.workspace_id,actor_user_id:uid(c),action:'commercial.checkout.created',resource_type:'commercial_payment',resource_id:paymentId})
  return c.json({payment_url:data.paymentUrl,reference:String(data.reference),merchant_order_id:order.merchant_order_id,reused:false})
})

// Duitku server callback. Never grant access based on browser return/JS callbacks.
export const duitkuWebhook = async (c: any) => {
  const cfg = duitkuConfig(c.env as unknown as DuitkuEnv, false)
  const form = await c.req.parseBody()
  const merchantCode = clean(form.merchantCode,80), amount = clean(form.amount,30), merchantOrderId = clean(form.merchantOrderId,120)
  const resultCode = clean(form.resultCode,20), reference = clean(form.reference,120), signature = clean(form.signature,256)
  if (!merchantCode || !amount || !merchantOrderId || !reference || !signature || !/^\d+$/.test(amount)) return c.json({error:'invalid_callback'},400)
  const expected = await hmacHex(cfg.key,merchantCode+amount+merchantOrderId)
  const valid = safeEqual(signature.toLowerCase(),expected.toLowerCase()) && safeEqual(merchantCode,cfg.merchant)
  if (!valid) return c.json({error:'invalid_signature'},401)
  const payment = await c.env.DB.prepare("SELECT p.*,o.id AS order_id,o.workspace_id,o.user_id,o.status AS order_status FROM commercial_payments p JOIN commercial_orders o ON o.id=p.order_id WHERE p.merchant_order_id=? AND p.provider='duitku_pop'").bind(merchantOrderId).first<any>()
  if (!payment || Number(amount)!==Number(payment.amount_idr) || reference!==payment.reference) return c.json({error:'payment_mismatch'},409)
  const eventKey = (reference || merchantOrderId)+':'+resultCode+':'+amount
  const now = nowIso()
  try {
    await c.env.DB.prepare('INSERT INTO commercial_payment_events (id,payment_id,provider_event_key,result_code,amount_idr,payload_json,signature_valid,received_at) VALUES (?,?,?,?,?,?,1,?)')
      .bind(newId('pev'),payment.id,eventKey,resultCode,Number(amount),JSON.stringify({merchantCode,amount,merchantOrderId,resultCode,reference,paymentCode:clean(form.paymentCode,80)}),now).run()
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(String((e as Error).message))) return c.json({ok:true,duplicate:true})
    throw e
  }
  if (resultCode==='00') {
    await c.env.DB.prepare("UPDATE commercial_payments SET status='paid',updated_at=? WHERE id=? AND status<>'paid'").bind(now,payment.id).run()
    await c.env.DB.prepare("UPDATE commercial_orders SET status='paid',updated_at=? WHERE id=? AND status='pending_payment'").bind(now,payment.order_id).run()
    const items = await c.env.DB.prepare('SELECT * FROM commercial_order_items WHERE order_id=?').bind(payment.order_id).all<any>()
    for (const item of items.results) {
      const entitlementId = newId('ent')
      await c.env.DB.prepare("INSERT OR IGNORE INTO commercial_entitlements (id,order_id,order_item_id,user_id,workspace_id,sku,status,granted_at) VALUES (?,?,?,?,?,?,'active',?)")
        .bind(entitlementId,payment.order_id,item.id,payment.user_id,payment.workspace_id,item.sku_snapshot,now).run()
      const entitlement = await c.env.DB.prepare('SELECT id FROM commercial_entitlements WHERE order_item_id=?').bind(item.id).first<any>()
      if (entitlement) await c.env.DB.prepare("INSERT OR IGNORE INTO commercial_service_jobs (id,entitlement_id,order_id,workspace_id,status,brief_json,created_at,updated_at) VALUES (?,?,?,?,'queued','{}',?,?)")
        .bind(newId('job'),entitlement.id,payment.order_id,payment.workspace_id,now,now).run()
    }
    await audit(c.env.DB,{workspace_id:payment.workspace_id,actor_user_id:null,action:'commercial.payment.verified',resource_type:'commercial_payment',resource_id:payment.id})
  } else {
    await c.env.DB.prepare("UPDATE commercial_payments SET status='failed',updated_at=? WHERE id=? AND status<>'paid'").bind(now,payment.id).run()
  }
  return c.json({ok:true})
}

export default api;
