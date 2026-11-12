import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { ApiError, AppEnv } from './lib/core'
import { auth, csrfGuard, requireAuth } from './routes/auth'
import { api } from './routes/domain'
import { affiliateApi } from './routes/affiliate'
import commercialApi, { duitkuWebhook } from './routes/commercial'
import adminApi from './routes/admin'
import { requireCloudflareAccess } from './lib/cloudflareAccess'
const app = new Hono<AppEnv>()
app.use('*', async(c,next)=>{
  let clerkOrigin=''
  try { const key=c.env.CLERK_PUBLISHABLE_KEY; const part=key?.split('_')[2]; if(part) clerkOrigin='https://'+atob(part).slice(0,-1) } catch {}
  const policy={defaultSrc:["'self'"],scriptSrc:["'self'",'https://app-prod.duitku.com','https://challenges.cloudflare.com',...(clerkOrigin?[clerkOrigin]:[])],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com',...(clerkOrigin?[clerkOrigin]:[])],fontSrc:["'self'",'https://fonts.gstatic.com',...(clerkOrigin?[clerkOrigin]:[])],imgSrc:["'self'",'data:','https:'],connectSrc:["'self'",'https://app-prod.duitku.com',...(clerkOrigin?[clerkOrigin]:[]),'https://api.clerk.com'],frameSrc:["'self'",'https://app-prod.duitku.com','https://challenges.cloudflare.com',...(clerkOrigin?[clerkOrigin]:[]),'https://accounts.google.com'],workerSrc:["'self'",'blob:'],frameAncestors:["'none'"],formAction:["'self'"],baseUri:["'self'"]}
  return secureHeaders({contentSecurityPolicy:policy,referrerPolicy:'strict-origin-when-cross-origin'})(c,next)
})
// Production Clerk sessions are bound to the canonical domain; send page loads there (APIs/webhooks untouched).
app.use('*',async(c,next)=>{
  const env=c.env as any
  if(env.CANONICAL_REDIRECT==='true'&&env.PUBLIC_APP_URL&&c.req.method==='GET'&&!c.req.path.startsWith('/api/')&&!c.req.path.startsWith('/static/')){
    try{const canon=new URL(env.PUBLIC_APP_URL),u=new URL(c.req.url);if(u.host!==canon.host){u.protocol=canon.protocol;u.host=canon.host;return c.redirect(u.toString(),302)}}catch{}
  }
  await next()
})
app.use('/api/*',async(c,next)=>{await next();c.header('Cache-Control','no-store')})
app.use('/api/*',async(c,next)=>{if(c.req.path==='/api/webhooks/duitku/pop')return next();return csrfGuard(c,next)})
app.get('/api/health',(c)=>c.json({ok:true,service:'oltavyn',version:'0.3.0'}))
app.route('/api/auth',auth)
app.post('/api/webhooks/duitku/pop',duitkuWebhook)
app.get('/api/public/catalog',async(c)=>{
  const rows=await c.env.DB.prepare("SELECT sku,name,description,price_idr,billing_type,deliverables_json,exclusions_json FROM commercial_catalog WHERE status='active' ORDER BY sort_order").all()
  const env=c.env as any
  return c.json({checkout_enabled:env.DUITKU_CHECKOUT_ENABLED==='true'&&!!env.DUITKU_MERCHANT_CODE&&!!env.DUITKU_API_KEY,catalog:(rows.results as any[]).map(r=>({...r,currency:'IDR',deliverables:JSON.parse(r.deliverables_json),exclusions:JSON.parse(r.exclusions_json)}))})
})
app.use('/admin',requireCloudflareAccess)
app.use('/admin/*',requireCloudflareAccess)
app.use('/api/admin',requireCloudflareAccess)
app.use('/api/admin/*',requireCloudflareAccess)
app.use('/api/*',async(c,next)=>{if(c.req.path.startsWith('/api/auth/'))return next();return requireAuth(c,next)})
app.route('/api',api)
app.route('/api/affiliate',affiliateApi)
app.route('/api/commercial',commercialApi)
app.route('/api/admin',adminApi)
const shell=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OLTAVYN — Agentic Content OS</title><meta name="description" content="Workbench berbasis bukti: Riset → Peluang → Konten → Publikasi → Pembelajaran."><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="/static/app.css"></head><body><a class="skip-link" href="#main">Lewati ke konten</a><div id="app" aria-live="polite"><p class="boot">Memuat OLTAVYN…</p></div><script type="module" src="/static/app.js"></script></body></html>`
const affiliateShell=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Affiliate OS — OLTAVYN</title><link rel="stylesheet" href="/static/affiliate.css"></head><body><main class="wrap" id="main">
<header class="top"><div><div class="muted small">AVORLUNE · OLTAVYN / PRODUK 01</div><h1 style="margin:5px 0">Affiliate OS</h1><div class="muted small">Product Intelligence · Scorecard · Content Factory · Publikasi manual</div></div><div class="row"><a href="/">← Core Engine</a><span id="who" class="pill">Memeriksa sesi…</span></div></header>
<div id="message" class="msg hide" role="status" aria-live="polite"></div>
<section id="login" class="card hide"><h2>Masuk ke OLTAVYN</h2><p>Sesi belum aktif. Masuk melalui halaman utama, lalu buka kembali halaman ini.</p><a class="btn" href="/">Buka halaman login</a></section>
<section id="app" class="hide">
<div class="card row"><label for="workspace" style="min-width:90px">Workspace</label><select id="workspace" style="max-width:420px"></select></div>
<nav class="tabs" role="tablist" aria-label="Bagian Affiliate OS"><button role="tab" data-tab="overview">Ikhtisar</button><button role="tab" data-tab="products">Produk</button><button role="tab" data-tab="detail">Detail produk</button><button role="tab" data-tab="channels">Kanal</button><button role="tab" data-tab="agent">AI Agent</button><button role="tab" data-tab="providers">Provider</button></nav>
<section data-panel="overview" role="tabpanel"><div id="overview-body"></div></section>
<section data-panel="products" role="tabpanel" class="hide">
<div class="card"><h2>Tambah kandidat produk</h2><p class="small muted">Isi hanya yang terlihat di sumber. Kosongkan yang tidak diketahui (bukan 0).</p><form id="product-form"><div class="grid">
<div class="field"><label for="np-title">Nama produk *</label><input id="np-title" name="title" required maxlength="200"></div>
<div class="field"><label for="np-url">URL produk *</label><input id="np-url" name="canonical_url" type="url" required placeholder="https://shopee.co.id/..."></div>
<div class="field"><label for="np-cat">Kategori</label><input id="np-cat" name="category"></div>
<div class="field"><label for="np-price">Harga IDR</label><input id="np-price" name="price_amount" type="number" min="0"></div>
<div class="field"><label for="np-comm">Komisi %</label><input id="np-comm" name="commission_rate_percent" type="number" min="0" max="100" step=".01"></div>
<div class="field"><label for="np-rating">Rating produk</label><input id="np-rating" name="product_rating" type="number" min="0" max="5" step=".1"></div>
<div class="field"><label for="np-sold">Terjual (terlihat)</label><input id="np-sold" name="sold_count" type="number" min="0"></div>
<div class="field"><label for="np-seller">Nama toko</label><input id="np-seller" name="seller_name"></div>
</div><button class="btn">Simpan produk</button></form></div>
<div class="card"><form id="filter-form" class="row" role="search"><div class="field" style="flex:2"><label for="filter-q">Cari</label><input id="filter-q" placeholder="Nama atau kategori"></div><div class="field" style="flex:1"><label for="filter-status">Status</label><select id="filter-status"><option value="">Semua aktif</option><option value="candidate">Kandidat</option><option value="shortlisted">Shortlist</option><option value="selected">Terpilih</option><option value="rejected">Ditolak</option><option value="archived">Diarsipkan</option></select></div><button class="btn btn-ghost" style="align-self:flex-end;margin-bottom:8px">Terapkan</button></form><div id="products"></div></div>
</section>
<section data-panel="detail" role="tabpanel" class="hide"><div class="card" id="detail-body"></div></section>
<section data-panel="channels" role="tabpanel" class="hide"><div class="cols">
<div class="card"><h2>Tambah kanal</h2><form id="channel-form"><div class="field"><label for="nc-platform">Platform</label><select id="nc-platform" name="platform"><option value="shopee_video">Shopee Video</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="facebook">Facebook</option></select></div><div class="field"><label for="nc-name">Nama kanal *</label><input id="nc-name" name="channel_name" required maxlength="120"></div><div class="field"><label for="nc-handle">Handle</label><input id="nc-handle" name="handle" placeholder="@akun"></div><div class="field"><label for="nc-url">URL profil</label><input id="nc-url" name="external_url" type="url"></div><div class="field"><label for="nc-cat">Kategori/niche</label><input id="nc-cat" name="category"></div><button class="btn">Simpan kanal</button></form><p class="small muted">Aplikasi tidak pernah meminta atau menyimpan password, cookie, OTP, atau token sesi akun platform.</p></div>
<div class="card"><div class="spread"><h2>Channel Registry</h2><label class="row small"><input type="checkbox" id="channel-archived" style="width:auto"> Tampilkan arsip</label></div><div id="channels"></div></div>
</div></section>
<section data-panel="agent" role="tabpanel" class="hide">
<div class="card agent-intro"><div class="spread"><div><div class="eyebrow">OLTAVYN INTELLIGENCE</div><h2>Live AI Agent</h2><p class="small muted">Satu chat untuk membantu riset, analisis produk, scorecard, ide konten, dan keputusan operasional di workspace aktif.</p></div><span class="pill">Workspace-aware</span></div></div>
<div class="agent-layout">
<aside class="card agent-sidebar"><div class="spread"><h3>Percakapan</h3><button class="btn btn-ghost btn-sm" id="agent-new">+ Baru</button></div><div id="agent-conversations" class="agent-conversations"><p class="small muted">Memuat percakapan…</p></div></aside>
<div class="card agent-chat">
<div id="agent-messages" class="agent-messages" role="log" aria-live="polite" aria-relevant="additions text"><div class="agent-empty"><strong>Mulai dari tujuanmu.</strong><p class="muted small">Contoh: “Bantu saya memilih produk affiliate untuk niche dapur kos dan susun langkah validasinya.”</p><div class="agent-prompts"><button class="prompt-chip" data-agent-prompt="Analisis kondisi workspace saya dan rekomendasikan langkah berikutnya.">Analisis workspace</button><button class="prompt-chip" data-agent-prompt="Bantu saya menyusun kriteria produk affiliate yang layak diuji.">Seleksi produk</button><button class="prompt-chip" data-agent-prompt="Buat 3 konsep video affiliate faceless 15 detik berdasarkan data produk yang tersedia.">Konsep konten</button></div></div></div>
<form id="agent-form" class="agent-composer"><details class="agent-model-settings"><summary>Model Groq</summary><label class="small" for="agent-model">Model ID dari Groq Console (opsional)</label><input id="agent-model" value="openai/gpt-oss-120b" maxlength="100" autocomplete="off"></details><label class="sr-only" for="agent-message">Pesan untuk OLTAVYN Agent</label><textarea id="agent-message" name="message" rows="2" maxlength="6000" required placeholder="Tanyakan sesuatu atau berikan instruksi ke OLTAVYN…"></textarea><div class="spread agent-compose-actions"><label class="agent-research-toggle"><input id="agent-use-tavily" type="checkbox"> Izinkan riset web via Tavily (menggunakan kredit provider)</label><button class="btn" id="agent-send" type="submit">Kirim <span aria-hidden="true">↑</span></button></div></form>
<p class="small muted agent-footnote">Chat memakai kuota Groq saat tersedia. Agent membaca data workspace aktif (produk, kanal, evidence, peluang, scorecard, konten, eksperimen); percakapan disimpan di D1. Riset Tavily opsional dan memakai kredit provider. Apify/Scrape.ly memerlukan persetujuan per eksekusi di tab Provider. Agent tidak menerbitkan konten otomatis.</p>
</div></div>
</section>
<section data-panel="providers" role="tabpanel" class="hide">
<div class="card">
  <div class="spread"><div><h2>Multi-Provider Hub</h2><p class="small muted">Satu pusat kendali untuk provider riset, AI generation, dan Actor. Provider hanya alat bantu; OLTAVYN tetap menjadi sumber data dan alur persetujuan.</p></div><button class="btn btn-ghost btn-sm" id="refresh-providers">Perbarui status</button></div>
  <div id="providers"><p class="loading">Memuat status provider…</p></div>
  <div id="provider-usage" class="small muted" aria-live="polite"></div>
</div>
<div class="card">
  <h3>Aturan aktivasi dan biaya</h3>
  <ul class="small">
    <li>Secret hanya dipasang di Cloudflare Pages → Settings → Variables and Secrets. Jangan masukkan API key ke formulir ini, GitHub, atau chat.</li>
    <li>Status <strong>terkonfigurasi</strong> bukan berarti API key sudah tervalidasi. Groq/Tavily perlu uji request; Actor perlu persetujuan setiap eksekusi.</li>
    <li>Apify/Scrape.ly bisa memakai kredit atau saldo. Allowlist Actor bukan batas biaya. Periksa harga Actor dan usage dashboard sebelum menekan eksekusi.</li>
    <li>Biaya/token aktual tidak bisa dihitung oleh OLTAVYN saat ini. Panel menampilkan jumlah panggilan audit, bukan saldo atau tagihan.</li>
    <li>Scrape.ly memakai endpoint resmi v2; tetap nonaktif sampai secret dan Actor allowlist disiapkan.</li>
  </ul>
</div>
<div class="cols">
  <div class="card">
    <h3>Groq · AI draft generation</h3><p class="small muted">Menghasilkan draf teks. Tidak menyimpan atau menerbitkan otomatis.</p>
    <form id="groq-form">
      <div class="field"><label for="g-prompt">Instruksi / prompt</label><textarea id="g-prompt" name="prompt" required maxlength="12000" placeholder="Buat 3 hook video faceless berdasarkan bukti yang saya berikan. Tandai klaim yang belum terbukti."></textarea></div>
      <div class="field"><label for="g-model">Model Groq</label><input id="g-model" name="model" value="openai/gpt-oss-120b" maxlength="100"></div>
      <button class="btn" type="submit" disabled>Buat draf</button>
    </form><pre id="groq-result" aria-live="polite">Menunggu konfigurasi provider…</pre>
  </div>
  <div class="card">
    <h3>Tavily · Web research</h3><p class="small muted">Mencari sumber publik. Hasil menjadi petunjuk riset, bukan klaim terverifikasi.</p>
    <form id="tavily-form">
      <div class="field"><label for="t-q">Kata kunci / pertanyaan riset</label><input id="t-q" name="query" required maxlength="400" placeholder="masalah penyimpanan dapur kos di Indonesia"></div>
      <button class="btn" type="submit" disabled>Cari sumber</button>
    </form><div id="tavily-result" aria-live="polite"></div>
  </div>
  <div class="card">
    <h3>Firecrawl · Ambil satu halaman publik</h3><p class="small muted">1 kredit per halaman. Hanya URL publik http(s). Hasil = lead belum terverifikasi; simpan sebagai bukti setelah ditinjau.</p>
    <form id="firecrawl-form"><div class="field"><label for="fc-url">URL publik</label><input id="fc-url" name="url" type="url" required maxlength="2000" placeholder="https://..."></div><button class="btn" type="submit">Ambil halaman</button></form>
    <div id="firecrawl-result" aria-live="polite"></div>
  </div>
  <div class="card">
    <h3>Apify · Actor execution</h3><p class="small muted">Hanya Actor yang sudah di-allowlist. Satu klik = satu run yang mungkin mengonsumsi kredit.</p>
    <form id="apify-form">
      <div class="field"><label for="a-actor">Actor ID (harus sudah diizinkan)</label><input id="a-actor" name="actor_id" required maxlength="180" placeholder="username/actor-name"></div>
      <div class="field"><label for="a-input">Input Actor (JSON object)</label><textarea id="a-input" name="input_json" rows="5" maxlength="20000" placeholder='{"startUrls":[{"url":"https://example.com"}]}'></textarea></div>
      <div class="grid"><div class="field"><label for="a-cap">Batas biaya maksimum (USD)</label><input id="a-cap" name="max_total_charge_usd" type="number" min="0.01" max="1" step="0.01" value="0.05" required></div><div class="field"><label for="a-items">Batas item berbayar</label><input id="a-items" name="max_items" type="number" min="1" max="100" step="1" value="10" required></div><div class="field"><label for="a-timeout">Timeout (detik)</label><input id="a-timeout" name="timeout_seconds" type="number" min="1" max="120" step="1" value="60" required></div></div>
      <label class="check"><input id="a-confirm" type="checkbox" required> Saya sudah memeriksa Actor, sumber, terms, batas, dan potensi biayanya; saya menyetujui satu eksekusi ini.</label>
      <button class="btn" type="submit" disabled>Jalankan satu Actor</button>
    </form><pre id="apify-result" aria-live="polite">Menunggu konfigurasi dan allowlist…</pre>
  </div>
  <div class="card">
    <h3>Scrape.ly · Actor execution</h3><p class="small muted">API resmi Scrape.ly v2. Tetap memerlukan secret, Actor allowlist, persetujuan per-run, dan batas biaya maksimum.</p>
    <form id="scrapely-form">
      <div class="field"><label for="s-actor">Actor / task ID yang diizinkan</label><input id="s-actor" name="actor_id" required maxlength="180" placeholder="ID dari dashboard Scrape.ly"></div>
      <div class="field"><label for="s-input">Input JSON object</label><textarea id="s-input" name="input_json" rows="5" maxlength="20000" placeholder="{}"></textarea></div>
      <div class="grid"><div class="field"><label for="s-cap">Batas biaya maksimum (USD)</label><input id="s-cap" name="max_total_charge_usd" type="number" min="0.01" max="1" step="0.01" value="0.05" required></div><div class="field"><label for="s-items">Batas item berbayar</label><input id="s-items" name="max_items" type="number" min="1" max="100" step="1" value="10" required></div><div class="field"><label for="s-timeout">Timeout (detik)</label><input id="s-timeout" name="timeout_seconds" type="number" min="1" max="120" step="1" value="60" required></div></div>
      <label class="check"><input id="s-confirm" type="checkbox" required> Saya menyetujui satu eksekusi setelah memeriksa biaya dan hak akses.</label>
      <button class="btn" type="submit" disabled>Jalankan satu task</button>
    </form><pre id="scrapely-result" aria-live="polite">Dikunci sampai endpoint resmi diverifikasi.</pre>
  </div>
</div>
</section>
</section></main><script src="/static/affiliate.js" defer></script></body></html>`
const adminShell=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Command Center — OLTAVYN</title><link rel="stylesheet" href="/static/admin.css"></head><body><div class="admin-shell"><header class="admin-top"><a class="brand" href="/admin"><span class="brand-mark" aria-hidden="true">O</span><span>OLTAVYN<small>COMMAND CENTER</small></span></a><div class="top-actions"><span id="admin-who" class="muted">Memeriksa akses…</span><a class="button" href="/">← Aplikasi</a></div></header><div id="admin-message" role="status" aria-live="polite"></div><main id="admin-main"><p class="muted">Memuat…</p></main></div><script src="/static/admin.js" defer></script></body></html>`
app.get('/affiliate',(c)=>c.html(affiliateShell))
app.get('/admin',(c)=>c.html(adminShell))
app.get('/admin/*',(c)=>c.html(adminShell))
app.get('*',(c)=>c.html(shell))
app.onError((err,c)=>{if(err instanceof ApiError)return c.json({error:{code:err.code,message:err.message,details:err.details??null}},err.status as any);const reqId=crypto.randomUUID();console.error(JSON.stringify({reqId,path:c.req.path,err:String((err as Error)?.message||err).slice(0,300)}));return c.json({error:{code:'internal_error',message:'Terjadi kesalahan di server.',request_id:reqId}},500)})
export default app
