import { Hono } from 'hono'
import { ApiError, AppEnv, audit, newId, nowIso, rateLimit } from '../lib/core'
import { requireAuth } from './auth'
import { reconcilePayment } from './commercial'

const api = new Hono<AppEnv>()
const clean = (v: unknown, max=2000) => typeof v === 'string' ? v.trim().slice(0,max) : ''
const uid = (c:any) => c.get('user').id

async function requireAdmin(c:any,next:()=>Promise<void>) {
  const configured=String((c.env as any).OLTAVYN_ADMIN_EMAILS||'').split(',').map((x:string)=>x.trim().toLowerCase()).filter(Boolean)
  const email=String(c.get('user')?.email||'').toLowerCase()
  if (!configured.length || !configured.includes(email)) throw new ApiError(403,'admin_required','Akun ini tidak memiliki akses Command Center.')
  await next()
}
api.use('*',requireAuth,requireAdmin)

api.get('/dashboard',async c=>{
  const [orders,jobs,users,revenue,revisions]=await Promise.all([
    c.env.DB.prepare(`SELECT status,COUNT(*) AS count FROM commercial_orders GROUP BY status`).all<any>(),
    c.env.DB.prepare(`SELECT status,COUNT(*) AS count FROM commercial_service_jobs GROUP BY status`).all<any>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE status=\'active\'').first<any>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount_idr),0) AS total FROM commercial_payments WHERE status='paid'").first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM commercial_revision_requests WHERE status='open'").first<any>()
  ])
  return c.json({orders:orders.results,jobs:jobs.results,active_users:users?.count||0,paid_revenue_idr:revenue?.total||0,open_revisions:revisions?.count||0})
})
api.get('/orders',async c=>{
  const status=clean(c.req.query('status'),40), q=clean(c.req.query('q'),120)
  const rows=await c.env.DB.prepare(`SELECT o.id,o.merchant_order_id,o.status,o.total_idr,o.currency,o.created_at,o.updated_at,u.email,u.display_name,w.name AS workspace_name,i.name_snapshot AS package_name,j.id AS job_id,j.status AS job_status,j.revision_count,j.revision_limit
    FROM commercial_orders o JOIN users u ON u.id=o.user_id JOIN workspaces w ON w.id=o.workspace_id
    LEFT JOIN commercial_order_items i ON i.order_id=o.id LEFT JOIN commercial_service_jobs j ON j.order_id=o.id
    WHERE (?='' OR o.status=?) AND (?='' OR lower(u.email) LIKE '%'||lower(?)||'%' OR lower(o.merchant_order_id) LIKE '%'||lower(?)||'%')
    ORDER BY o.created_at DESC LIMIT 200`).bind(status,status,q,q,q).all()
  return c.json({orders:rows.results})
})
api.get('/orders/:id',async c=>{
  const order=await c.env.DB.prepare(`SELECT o.*,u.email,u.display_name,w.name AS workspace_name FROM commercial_orders o JOIN users u ON u.id=o.user_id JOIN workspaces w ON w.id=o.workspace_id WHERE o.id=?`).bind(c.req.param('id')).first<any>()
  if(!order) throw new ApiError(404,'not_found','Pesanan tidak ditemukan.')
  const [items,payments,jobs]=await Promise.all([
    c.env.DB.prepare('SELECT * FROM commercial_order_items WHERE order_id=?').bind(order.id).all(),
    c.env.DB.prepare('SELECT provider,reference,payment_method,amount_idr,status,created_at,updated_at FROM commercial_payments WHERE order_id=? ORDER BY created_at DESC').bind(order.id).all(),
    c.env.DB.prepare('SELECT * FROM commercial_service_jobs WHERE order_id=?').bind(order.id).all<any>()
  ])
  const job=jobs.results[0]||null
  const [deliverables,events,revisions]=job?await Promise.all([
    c.env.DB.prepare('SELECT * FROM commercial_deliverables WHERE job_id=? ORDER BY created_at DESC').bind(job.id).all(),
    c.env.DB.prepare('SELECT * FROM commercial_job_events WHERE job_id=? ORDER BY created_at DESC LIMIT 100').bind(job.id).all(),
    c.env.DB.prepare('SELECT * FROM commercial_revision_requests WHERE job_id=? ORDER BY created_at DESC').bind(job.id).all()
  ]):[{results:[]},{results:[]},{results:[]}]
  return c.json({order,items:items.results,payments:payments.results,job,deliverables:deliverables.results,events:events.results,revisions:revisions.results})
})
api.patch('/orders/:id/job',async c=>{
  await rateLimit(c.env.DB,'admin-job:'+uid(c),120,3600)
  const body=await c.req.json().catch(()=>null)
  if(!body||typeof body!=='object') throw new ApiError(400,'invalid_json','Body JSON tidak valid.')
  const status=clean(body.status,40), note=clean(body.note,2000)
  const allowed=['queued','in_progress','waiting_customer','review','delivered','cancelled']
  if(!allowed.includes(status)) throw new ApiError(400,'invalid_status','Status pekerjaan tidak valid.')
  const job=await c.env.DB.prepare('SELECT * FROM commercial_service_jobs WHERE order_id=?').bind(c.req.param('id')).first<any>()
  if(!job) throw new ApiError(404,'job_not_found','Pekerjaan belum tersedia untuk pesanan ini.')
  const now=nowIso()
  await c.env.DB.prepare('UPDATE commercial_service_jobs SET status=?,delivery_note=?,completed_at=?,updated_at=? WHERE id=?')
    .bind(status,note||job.delivery_note,status==='delivered'?now:null,now,job.id).run()
  const orderStatus=status==='delivered'?'delivered':status==='cancelled'?'cancelled':status==='queued'?'paid':'processing'
  await c.env.DB.prepare('UPDATE commercial_orders SET status=?,updated_at=? WHERE id=? AND status IN (\'paid\',\'processing\',\'delivered\')').bind(orderStatus,now,c.req.param('id')).run()
  await c.env.DB.prepare('INSERT INTO commercial_job_events (id,job_id,actor_user_id,event_type,note,from_status,to_status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(newId('jev'),job.id,uid(c),'status_changed',note||null,job.status,status,now).run()
  await audit(c.env.DB,{workspace_id:job.workspace_id,actor_user_id:uid(c),action:'admin.job.status_changed',resource_type:'commercial_service_job',resource_id:job.id})
  return c.json({ok:true,status,order_status:orderStatus})
})
api.post('/orders/:id/deliverables',async c=>{
  const body=await c.req.json().catch(()=>null)
  const title=clean(body?.title,160), url=clean(body?.file_url,2000), description=clean(body?.description,1000)
  if(!title||!url) throw new ApiError(400,'validation_failed','Judul dan URL deliverable wajib diisi.')
  let parsed:URL;try{parsed=new URL(url)}catch{throw new ApiError(400,'invalid_url','URL tidak valid.')}
  if(parsed.protocol!=='https:') throw new ApiError(400,'invalid_url','Deliverable harus menggunakan HTTPS.')
  const job=await c.env.DB.prepare('SELECT * FROM commercial_service_jobs WHERE order_id=?').bind(c.req.param('id')).first<any>()
  if(!job) throw new ApiError(404,'job_not_found','Pekerjaan tidak ditemukan.')
  const id=newId('del'),now=nowIso()
  await c.env.DB.prepare('INSERT INTO commercial_deliverables (id,job_id,title,description,file_url,file_type,visibility,created_by,created_at) VALUES (?,?,?,?,?,\'link\',\'customer\',?,?)')
    .bind(id,job.id,title,description||null,url,uid(c),now).run()
  await c.env.DB.prepare('INSERT INTO commercial_job_events (id,job_id,actor_user_id,event_type,note,created_at) VALUES (?,?,?,\'deliverable_added\',?,?)')
    .bind(newId('jev'),job.id,uid(c),title,now).run()
  await audit(c.env.DB,{workspace_id:job.workspace_id,actor_user_id:uid(c),action:'admin.deliverable.added',resource_type:'commercial_deliverable',resource_id:id})
  return c.json({ok:true,id},201)
})
api.patch('/revisions/:id',async c=>{
  const body=await c.req.json().catch(()=>null), status=clean(body?.status,30), note=clean(body?.admin_note,2000)
  if(!['accepted','rejected','completed'].includes(status)) throw new ApiError(400,'invalid_status','Keputusan revisi tidak valid.')
  const revision=await c.env.DB.prepare('SELECT r.*,j.workspace_id FROM commercial_revision_requests r JOIN commercial_service_jobs j ON j.id=r.job_id WHERE r.id=?').bind(c.req.param('id')).first<any>()
  if(!revision) throw new ApiError(404,'not_found','Permintaan revisi tidak ditemukan.')
  if(revision.status!=='open') throw new ApiError(409,'revision_already_handled','Permintaan revisi ini sudah diproses.')
  if(status==='accepted') {
    const job=await c.env.DB.prepare('SELECT revision_count,revision_limit,order_id FROM commercial_service_jobs WHERE id=?').bind(revision.job_id).first<any>()
    if(!job || job.revision_count>=job.revision_limit) throw new ApiError(409,'revision_limit_reached','Batas revisi paket ini telah digunakan.')
    await c.env.DB.prepare("UPDATE commercial_service_jobs SET revision_count=revision_count+1,status='in_progress',updated_at=? WHERE id=? AND revision_count<revision_limit").bind(nowIso(),revision.job_id).run()
    await c.env.DB.prepare("UPDATE commercial_orders SET status='processing',updated_at=? WHERE id=? AND status='delivered'").bind(nowIso(),job.order_id).run()
  }
  await c.env.DB.prepare('UPDATE commercial_revision_requests SET status=?,admin_note=?,updated_at=? WHERE id=? AND status=\'open\'').bind(status,note||null,nowIso(),revision.id).run()
  await c.env.DB.prepare('INSERT INTO commercial_job_events (id,job_id,actor_user_id,event_type,note,created_at) VALUES (?,?,?,\'revision_updated\',?,?)').bind(newId('jev'),revision.job_id,uid(c),status+': '+note,nowIso()).run()
  await audit(c.env.DB,{workspace_id:revision.workspace_id,actor_user_id:uid(c),action:'admin.revision.updated',resource_type:'commercial_revision_request',resource_id:revision.id})
  return c.json({ok:true})
})
// Payment reconciliation via Duitku Check Transaction (read-only at Duitku; applies the same idempotent state machine).
api.post('/orders/:id/reconcile',async c=>{
  await rateLimit(c.env.DB,'admin-reconcile:'+uid(c),30,3600)
  const order=await c.env.DB.prepare('SELECT id,merchant_order_id,workspace_id FROM commercial_orders WHERE id=?').bind(c.req.param('id')).first<any>()
  if(!order) throw new ApiError(404,'not_found','Pesanan tidak ditemukan.')
  const result=await reconcilePayment(c.env,c.env.DB,order.merchant_order_id)
  await audit(c.env.DB,{workspace_id:order.workspace_id,actor_user_id:uid(c),action:'admin.payment.reconciled',resource_type:'commercial_order',resource_id:order.id,outcome:String(result.applied)})
  return c.json({ok:true,result})
})
export default api
