import { Hono } from 'hono'
import { ApiError, AppEnv, audit, newId, notFound, nowIso, rateLimit } from '../lib/core'

export const affiliateApi = new Hono<AppEnv>()
const json = async (c: any) => { try { return await c.req.json() } catch { throw new ApiError(400, 'invalid_json', 'JSON tidak valid.') } }
const text = (v: unknown, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const numOrNull = (v: unknown, min: number, max: number) => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, 'invalid_number', 'Nilai angka di luar rentang.')
  return n
}
async function workspace(c: any, id: string) {
  const row = await c.env.DB.prepare('SELECT * FROM workspaces WHERE id = ? AND owner_user_id = ?').bind(id, c.get('user').id).first()
  if (!row) throw notFound()
  return row as any
}
async function product(c: any, id: string) {
  const row = await c.env.DB.prepare('SELECT p.* FROM affiliate_products p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND w.owner_user_id=?').bind(id, c.get('user').id).first()
  if (!row) throw notFound()
  return row as any
}
async function channel(c: any, id: string) {
  const row = await c.env.DB.prepare('SELECT ch.* FROM affiliate_channels ch JOIN workspaces w ON w.id=ch.workspace_id WHERE ch.id=? AND w.owner_user_id=?').bind(id, c.get('user').id).first()
  if (!row) throw notFound()
  return row as any
}
const platformValues = ['shopee_video','tiktok','instagram','youtube','facebook']
const statusValues = ['planned','active','paused','archived']
const productStatuses = ['candidate','shortlisted','selected','rejected','archived']

affiliateApi.get('/workspaces/:workspaceId/summary', async (c) => {
  const ws = await workspace(c, c.req.param('workspaceId'))
  const [products, shortlisted, channels, activeChannels] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) n FROM affiliate_products WHERE workspace_id=?').bind(ws.id).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) n FROM affiliate_products WHERE workspace_id=? AND lifecycle_status='shortlisted'").bind(ws.id).first<any>(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM affiliate_channels WHERE workspace_id=?').bind(ws.id).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) n FROM affiliate_channels WHERE workspace_id=? AND status='active'").bind(ws.id).first<any>(),
  ])
  return c.json({ summary: { products: products?.n ?? 0, shortlisted: shortlisted?.n ?? 0, channels: channels?.n ?? 0, active_channels: activeChannels?.n ?? 0 } })
})

affiliateApi.get('/workspaces/:workspaceId/channels', async (c) => {
  const ws = await workspace(c, c.req.param('workspaceId'))
  const { results } = await c.env.DB.prepare('SELECT * FROM affiliate_channels WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200').bind(ws.id).all()
  return c.json({ channels: results })
})
affiliateApi.post('/workspaces/:workspaceId/channels', async (c) => {
  const ws = await workspace(c, c.req.param('workspaceId')), d = await json(c)
  const platform = text(d.platform, 40), name = text(d.channel_name, 120), handle = text(d.handle, 120)
  if (!platformValues.includes(platform) || !name) throw new ApiError(400, 'validation_failed', 'Platform dan nama kanal wajib diisi.')
  const url = text(d.external_url, 2000)
  if (url && !/^https?:\/\//i.test(url)) throw new ApiError(400, 'invalid_url', 'URL kanal harus http(s).')
  const id = newId('ach'), t = nowIso()
  await c.env.DB.prepare(`INSERT INTO affiliate_channels (id,workspace_id,platform,channel_name,handle,category,external_url,status,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, ws.id, platform, name, handle || null, text(d.category, 120) || null, url || null, statusValues.includes(d.status) ? d.status : 'planned', text(d.notes, 1000) || null, c.get('user').id, t, t).run()
  await audit(c.env.DB, { workspace_id: ws.id, actor_user_id: c.get('user').id, action: 'affiliate.channel.create', resource_type: 'affiliate_channel', resource_id: id })
  return c.json({ channel: await channel(c, id) }, 201)
})
affiliateApi.patch('/channels/:id', async (c) => {
  const row = await channel(c, c.req.param('id')), d = await json(c)
  const fields: Record<string, unknown> = {}
  if (d.channel_name !== undefined) { const v = text(d.channel_name, 120); if (!v) throw new ApiError(400,'validation_failed','Nama kanal wajib diisi.'); fields.channel_name = v }
  if (d.handle !== undefined) fields.handle = text(d.handle,120) || null
  if (d.category !== undefined) fields.category = text(d.category,120) || null
  if (d.notes !== undefined) fields.notes = text(d.notes,1000) || null
  if (d.status !== undefined) { if (!statusValues.includes(d.status)) throw new ApiError(400,'validation_failed','Status kanal tidak valid.'); fields.status = d.status }
  if (d.external_url !== undefined) { const v=text(d.external_url,2000); if(v && !/^https?:\/\//i.test(v)) throw new ApiError(400,'invalid_url','URL kanal harus http(s).'); fields.external_url=v||null }
  if (!Object.keys(fields).length) throw new ApiError(400,'no_changes','Tidak ada perubahan.')
  fields.updated_at=nowIso()
  const sets=Object.keys(fields).map(k=>`${k}=?`).join(',')
  await c.env.DB.prepare(`UPDATE affiliate_channels SET ${sets} WHERE id=?`).bind(...Object.values(fields),row.id).run()
  return c.json({ channel: await channel(c,row.id) })
})

affiliateApi.get('/workspaces/:workspaceId/products', async (c) => {
  const ws = await workspace(c, c.req.param('workspaceId'))
  const status = c.req.query('status')
  const { results } = status && productStatuses.includes(status)
    ? await c.env.DB.prepare('SELECT * FROM affiliate_products WHERE workspace_id=? AND lifecycle_status=? ORDER BY updated_at DESC LIMIT 500').bind(ws.id,status).all()
    : await c.env.DB.prepare('SELECT * FROM affiliate_products WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 500').bind(ws.id).all()
  return c.json({ products: results })
})
affiliateApi.post('/workspaces/:workspaceId/products', async (c) => {
  const ws = await workspace(c, c.req.param('workspaceId')), d = await json(c)
  const title=text(d.title,200), url=text(d.canonical_url,2000), marketplace=text(d.marketplace || 'shopee',40).toLowerCase()
  if (!title || !/^https?:\/\//i.test(url)) throw new ApiError(400,'validation_failed','Nama produk dan URL http(s) wajib diisi.')
  const price=numOrNull(d.price_amount,0,1000000000), commissionRate=numOrNull(d.commission_rate_percent,0,100)
  const commissionAmount=numOrNull(d.commission_amount,0,1000000000), rating=numOrNull(d.product_rating,0,5)
  const reviewCount=numOrNull(d.review_count,0,1000000000), soldCount=numOrNull(d.sold_count,0,1000000000)
  const sellerRating=numOrNull(d.seller_rating,0,5)
  const id=newId('apr'), t=nowIso()
  await c.env.DB.prepare(`INSERT INTO affiliate_products (id,workspace_id,marketplace,external_product_id,canonical_url,title,category,price_amount,currency,commission_rate_percent,commission_amount,product_rating,review_count,sold_count,seller_name,seller_rating,seller_location,primary_image_url,evidence_state,lifecycle_status,notes,created_by,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(id,ws.id,marketplace,text(d.external_product_id,160)||null,url,title,text(d.category,120)||null,price,'IDR',commissionRate,commissionAmount,rating,reviewCount,soldCount,text(d.seller_name,200)||null,sellerRating,text(d.seller_location,160)||null,text(d.primary_image_url,2000)||null,'unverified',productStatuses.includes(d.lifecycle_status)?d.lifecycle_status:'candidate',text(d.notes,2000)||null,c.get('user').id,t,t).run()
  await audit(c.env.DB,{workspace_id:ws.id,actor_user_id:c.get('user').id,action:'affiliate.product.create',resource_type:'affiliate_product',resource_id:id})
  return c.json({ product: await product(c,id) },201)
})
affiliateApi.patch('/products/:id', async (c) => {
  const row=await product(c,c.req.param('id')), d=await json(c), fields:Record<string,unknown>={}
  const stringFields:Record<string,number>={title:200,category:120,external_product_id:160,seller_name:200,seller_location:160,notes:2000,primary_image_url:2000}
  for(const [k,max] of Object.entries(stringFields)) if(d[k]!==undefined) fields[k]=text(d[k],max)||null
  if(d.canonical_url!==undefined){const v=text(d.canonical_url,2000);if(!/^https?:\/\//i.test(v))throw new ApiError(400,'invalid_url','URL produk harus http(s).');fields.canonical_url=v}
  if(d.lifecycle_status!==undefined){if(!productStatuses.includes(d.lifecycle_status))throw new ApiError(400,'validation_failed','Status produk tidak valid.');fields.lifecycle_status=d.lifecycle_status}
  if(d.evidence_state!==undefined){if(!['unverified','verified','conflicting'].includes(d.evidence_state))throw new ApiError(400,'validation_failed','Status evidence tidak valid.');fields.evidence_state=d.evidence_state}
  const numeric:Record<string,[number,number]>={price_amount:[0,1e9],commission_rate_percent:[0,100],commission_amount:[0,1e9],product_rating:[0,5],review_count:[0,1e9],sold_count:[0,1e9],seller_rating:[0,5]}
  for(const [k,range] of Object.entries(numeric)) if(d[k]!==undefined) fields[k]=numOrNull(d[k],...range)
  if(!Object.keys(fields).length)throw new ApiError(400,'no_changes','Tidak ada perubahan.')
  fields.updated_at=nowIso();const sets=Object.keys(fields).map(k=>`${k}=?`).join(',')
  await c.env.DB.prepare(`UPDATE affiliate_products SET ${sets} WHERE id=?`).bind(...Object.values(fields),row.id).run()
  return c.json({product:await product(c,row.id)})
})

affiliateApi.post('/products/:id/evidence', async (c) => {
  const p=await product(c,c.req.param('id')), d=await json(c), evidenceId=text(d.evidence_item_id,100), relationship=text(d.relationship,20)
  if(!['supports','challenges','context'].includes(relationship))throw new ApiError(400,'validation_failed','Relasi evidence tidak valid.')
  const ev=await c.env.DB.prepare('SELECT id FROM evidence_items WHERE id=? AND workspace_id=?').bind(evidenceId,p.workspace_id).first()
  if(!ev)throw new ApiError(400,'invalid_evidence','Evidence harus berasal dari workspace yang sama.')
  await c.env.DB.prepare('INSERT OR REPLACE INTO affiliate_product_evidence (product_id,evidence_item_id,relationship,created_at) VALUES (?,?,?,?)').bind(p.id,evidenceId,relationship,nowIso()).run()
  await c.env.DB.prepare("UPDATE affiliate_products SET evidence_state='verified',updated_at=? WHERE id=?").bind(nowIso(),p.id).run()
  await audit(c.env.DB,{workspace_id:p.workspace_id,actor_user_id:c.get('user').id,action:'affiliate.product.evidence_link',resource_type:'affiliate_product',resource_id:p.id})
  return c.json({ok:true})
})
affiliateApi.get('/products/:id/evidence', async (c) => {
  const p=await product(c,c.req.param('id'))
  const {results}=await c.env.DB.prepare('SELECT e.*,pe.relationship FROM affiliate_product_evidence pe JOIN evidence_items e ON e.id=pe.evidence_item_id WHERE pe.product_id=? AND e.workspace_id=? ORDER BY e.created_at DESC').bind(p.id,p.workspace_id).all()
  return c.json({evidence:results})
})
affiliateApi.post('/products/:id/scorecards', async (c) => {
  const p=await product(c,c.req.param('id')), d=await json(c)
  const keys=['demand','quality','commission','visual_potential','price_accessibility','seller_risk']
  const scores:Record<string,number|null>={}
  for(const k of keys)scores[k]=numOrNull(d[k],1,5)
  const complete=keys.every(k=>scores[k]!==null)
  const total=complete ? (Number(scores.demand)*.25+Number(scores.quality)*.20+Number(scores.commission)*.20+Number(scores.visual_potential)*.15+Number(scores.price_accessibility)*.10+(6-Number(scores.seller_risk))*.10)*20 : null
  const rationale:Record<string,string>={}
  for(const k of keys)rationale[k]=text(d.rationale?.[k],500)
  if(keys.some(k=>scores[k]!==null&&!rationale[k]))throw new ApiError(400,'rationale_required','Setiap dimensi yang diberi skor wajib memiliki alasan.')
  const id=newId('asc'),t=nowIso()
  await c.env.DB.prepare(`INSERT INTO affiliate_product_scorecards (id,product_id,rubric_version,score_demand,score_quality,score_commission,score_visual_potential,score_price_accessibility,score_seller_risk,weighted_total,rationale_json,scored_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(id,p.id,'v1',scores.demand,scores.quality,scores.commission,scores.visual_potential,scores.price_accessibility,scores.seller_risk,total,JSON.stringify(rationale),c.get('user').id,t).run()
  return c.json({scorecard:{id,product_id:p.id,rubric_version:'v1',scores,weighted_total:total,rationale,created_at:t}},201)
})
affiliateApi.get('/products/:id/scorecards', async (c) => {
  const p=await product(c,c.req.param('id'))
  const {results}=await c.env.DB.prepare('SELECT * FROM affiliate_product_scorecards WHERE product_id=? ORDER BY created_at DESC LIMIT 50').bind(p.id).all()
  return c.json({scorecards:results.map((r:any)=>({...r,rationale:JSON.parse(String(r.rationale_json||'{}'))}))})
})

// Provider health is configuration-only: it never sends a billable request.
affiliateApi.get('/providers', (c) => {
  const env=c.env as any
  return c.json({providers:[
    {id:'groq',purpose:'LLM generation',configured:!!env.GROQ_API_KEY,mode:'chat-completions'},
    {id:'tavily',purpose:'web research',configured:!!env.TAVILY_API_KEY,mode:'search'},
    {id:'apify',purpose:'authorized Actor runs',configured:!!env.APIFY_API_TOKEN,mode:'manual-approval'},
    {id:'scrapely',purpose:'authorized Actor runs',configured:!!env.SCRAPELY_TOKEN,mode:'manual-approval'},
  ]})
})
affiliateApi.post('/providers/groq/generate', async (c) => {
  const env=c.env as any
  if(!env.GROQ_API_KEY)throw new ApiError(503,'provider_not_configured','GROQ_API_KEY belum dikonfigurasi.')
  await rateLimit(c.env.DB,`provider:groq:${c.get('user').id}`,20,3600)
  const d=await json(c), prompt=text(d.prompt,12000), model=text(d.model,100)||'llama-3.3-70b-versatile'
  if(!prompt)throw new ApiError(400,'validation_failed','Prompt wajib diisi.')
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'Anda membantu menyusun materi konten affiliate yang faktual. Jangan mengarang pengalaman produk, angka, rating, komisi, atau klaim. Tandai hal yang belum didukung evidence sebagai perlu verifikasi.'},{role:'user',content:prompt}],temperature:0.4,max_tokens:1800})})
  if(!res.ok){const err=await res.text();throw new ApiError(res.status>=500?502:400,'provider_error',`Groq menolak permintaan (${res.status}). ${err.slice(0,250)}`)}
  const data:any=await res.json()
  return c.json({provider:'groq',model:data.model,text:data.choices?.[0]?.message?.content||'',usage:data.usage||null})
})
affiliateApi.post('/providers/tavily/search', async (c) => {
  const env=c.env as any
  if(!env.TAVILY_API_KEY)throw new ApiError(503,'provider_not_configured','TAVILY_API_KEY belum dikonfigurasi.')
  await rateLimit(c.env.DB,`provider:tavily:${c.get('user').id}`,20,3600)
  const d=await json(c), query=text(d.query,500)
  if(!query)throw new ApiError(400,'validation_failed','Query wajib diisi.')
  const res=await fetch('https://api.tavily.com/search',{method:'POST',headers:{Authorization:`Bearer ${env.TAVILY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query,search_depth:'basic',max_results:8,include_answer:false})})
  if(!res.ok)throw new ApiError(502,'provider_error',`Tavily gagal (${res.status}).`)
  const data:any=await res.json()
  return c.json({provider:'tavily',query,results:(data.results||[]).map((x:any)=>({title:x.title,url:x.url,content:x.content,score:x.score,published_date:x.published_date||null}))})
})
async function runActor(c:any, provider:'apify'|'scrapely') {
  const env=c.env as any, token=provider==='apify'?env.APIFY_API_TOKEN:env.SCRAPELY_TOKEN
  if(!token)throw new ApiError(503,'provider_not_configured',`${provider.toUpperCase()} token belum dikonfigurasi.`)
  const d=await json(c), actorId=text(d.actor_id,180)
  if(!actorId||!d.confirm_run)throw new ApiError(400,'explicit_approval_required','Actor ID dan confirm_run=true wajib dikirim untuk setiap eksekusi yang berpotensi memakai kredit.')
  const input=d.input && typeof d.input==='object' && !Array.isArray(d.input)?d.input:{}
  if(JSON.stringify(input).length>20000)throw new ApiError(400,'input_too_large','Input Actor maksimal 20 KB.')
  await rateLimit(c.env.DB,`provider:${provider}:${c.get('user').id}`,2,3600)
  const base=provider==='apify'?'https://api.apify.com/v2/acts/':'https://api.scrape.ly/v2/actors/'
  const res=await fetch(`${base}${encodeURIComponent(actorId)}/runs`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(input)})
  if(!res.ok)throw new ApiError(502,'provider_error',`${provider} run gagal (${res.status}). Periksa actor, saldo, izin, dan limit di dashboard provider.`)
  const data:any=await res.json(), run=data.data||data
  await audit(c.env.DB,{actor_user_id:c.get('user').id,action:`provider.${provider}.actor_run_requested`,resource_type:'provider_run',resource_id:text(run.id,100)||'unknown'})
  return c.json({provider,run_id:run.id||null,status:run.status||'submitted',dataset_id:run.defaultDatasetId||null,warning:'Eksekusi Actor dapat mengonsumsi saldo/kredit provider. Hasil belum diimpor ke workspace.'},202)
}
affiliateApi.post('/providers/apify/run',(c)=>runActor(c,'apify'))
affiliateApi.post('/providers/scrapely/run',(c)=>runActor(c,'scrapely'))
