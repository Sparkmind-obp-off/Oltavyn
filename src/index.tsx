import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { ApiError, AppEnv } from './lib/core'
import { auth, csrfGuard, requireAuth } from './routes/auth'
import { api } from './routes/domain'
import { affiliateApi } from './routes/affiliate'
const app = new Hono<AppEnv>()
app.use('*', secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:','https:'],connectSrc:["'self'"],frameAncestors:["'none'"],formAction:["'self'"],baseUri:["'self'"]},referrerPolicy:'strict-origin-when-cross-origin'}))
app.use('/api/*',async(c,next)=>{await next();c.header('Cache-Control','no-store')})
app.use('/api/*',csrfGuard)
app.get('/api/health',(c)=>c.json({ok:true,service:'oltavyn',version:'0.3.0'}))
app.route('/api/auth',auth)
app.use('/api/*',requireAuth)
app.route('/api',api)
app.route('/api/affiliate',affiliateApi)
const shell=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OLTAVYN — Agentic Content OS</title><meta name="description" content="Workbench berbasis bukti: Riset → Peluang → Konten → Publikasi → Pembelajaran."><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="/static/app.css"></head><body><a class="skip-link" href="#main">Lewati ke konten</a><div id="app" aria-live="polite"><p class="boot">Memuat OLTAVYN…</p></div><script type="module" src="/static/app.js"></script></body></html>`
const affiliateShell=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Affiliate OS — OLTAVYN</title><link rel="stylesheet" href="/static/affiliate.css"></head><body><main class="wrap" id="main">
<header class="top"><div><div class="muted small">AVORLUNE · OLTAVYN / PRODUK 01</div><h1 style="margin:5px 0">Affiliate OS</h1><div class="muted small">Product Intelligence · Scorecard · Content Factory · Publikasi manual</div></div><div class="row"><a href="/">← Core Engine</a><span id="who" class="pill">Memeriksa sesi…</span></div></header>
<div id="message" class="msg hide" role="status" aria-live="polite"></div>
<section id="login" class="card hide"><h2>Masuk ke OLTAVYN</h2><p>Sesi belum aktif. Masuk melalui halaman utama, lalu buka kembali halaman ini.</p><a class="btn" href="/">Buka halaman login</a></section>
<section id="app" class="hide">
<div class="card row"><label for="workspace" style="min-width:90px">Workspace</label><select id="workspace" style="max-width:420px"></select></div>
<nav class="tabs" role="tablist" aria-label="Bagian Affiliate OS"><button role="tab" data-tab="overview">Ikhtisar</button><button role="tab" data-tab="products">Produk</button><button role="tab" data-tab="detail">Detail produk</button><button role="tab" data-tab="channels">Kanal</button><button role="tab" data-tab="providers">Provider</button></nav>
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
<section data-panel="providers" role="tabpanel" class="hide">
<div class="card"><h2>Status provider & biaya</h2><p class="small muted">Provider opsional. Semua alur manual berfungsi tanpa kunci API. Kebijakan biaya: Rp0 — tidak ada eksekusi berbayar tanpa persetujuan pemilik.</p><div id="providers"></div></div>
<div class="cols"><div class="card"><h2>Draf LLM · Groq</h2><form id="groq-form"><div class="field"><label for="g-prompt">Prompt</label><textarea id="g-prompt" name="prompt" required maxlength="12000" placeholder="Buat 3 hook video faceless. Jangan mengarang klaim produk."></textarea></div><div class="field"><label for="g-model">Model</label><input id="g-model" name="model" value="llama-3.3-70b-versatile"></div><button class="btn">Buat draf</button></form><pre id="groq-result" aria-live="polite"></pre></div>
<div class="card"><h2>Riset · Tavily</h2><form id="tavily-form"><div class="field"><label for="t-q">Query</label><input id="t-q" name="query" required maxlength="400" placeholder="masalah penyimpanan dapur kos"></div><button class="btn">Cari sumber</button></form><div id="tavily-result" aria-live="polite"></div></div></div>
</section>
</section></main><script src="/static/affiliate.js" defer></script></body></html>`
app.get('/affiliate',(c)=>c.html(affiliateShell))
app.get('*',(c)=>c.html(shell))
app.onError((err,c)=>{if(err instanceof ApiError)return c.json({error:{code:err.code,message:err.message,details:err.details??null}},err.status as any);const reqId=crypto.randomUUID();console.error(JSON.stringify({reqId,path:c.req.path,err:String((err as Error)?.message||err).slice(0,300)}));return c.json({error:{code:'internal_error',message:'Terjadi kesalahan di server.',request_id:reqId}},500)})
export default app
