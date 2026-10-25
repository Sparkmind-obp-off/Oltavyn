// OLTAVYN frontend — vanilla JS SPA. All dynamic text is escaped via the `html` tag.
// The server is authoritative for auth/authorization; the UI only reflects server state.

// ---------- Safe templating ----------
class Raw { constructor(s) { this.s = s } }
const raw = (s) => new Raw(s)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function html(strings, ...vals) {
  let out = ''
  strings.forEach((s, i) => {
    out += s
    if (i < vals.length) {
      const v = vals[i]
      if (v instanceof Raw) out += v.s
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('')
      else if (v === false || v === null || v === undefined) out += ''
      else out += esc(v)
    }
  })
  return raw(out)
}
const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

// ---------- API ----------
class HttpError extends Error { constructor(status, body) { super(body?.error?.message || `HTTP ${status}`); this.status = status; this.body = body } }
async function api(method, path, data) {
  const opt = { method, headers: {}, credentials: 'same-origin' }
  if (data !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data) }
  let res
  try { res = await fetch(`/api${path}`, opt) } catch { throw new HttpError(0, { error: { message: 'Koneksi gagal. Periksa jaringan Anda.' } }) }
  const body = await res.json().catch(() => null)
  if (res.status === 401 && !path.startsWith('/auth/')) { state.user = null; render(); throw new HttpError(401, body) }
  if (!res.ok) throw new HttpError(res.status, body)
  return body
}

// ---------- Formatting ----------
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '—'
const LABELS = {
  source_type: { web_page: 'Halaman web', platform_observation: 'Observasi platform', user_interview: 'Wawancara pengguna', export_file: 'File ekspor', other: 'Lainnya' },
  collection_method: { manual_entry: 'Input manual', user_export: 'Ekspor pengguna', official_api: 'API resmi' },
  opp_status: { candidate: 'Kandidat', accepted: 'Diterima', rejected: 'Ditolak' },
  asset_status: { draft: 'Draf', in_review: 'Ditinjau', approved: 'Disetujui', rejected: 'Ditolak' },
  exp_status: { planned: 'Direncanakan', published: 'Terbit', not_published: 'Sengaja tidak diterbitkan' },
  value_status: { observed: 'Teramati', not_yet_available: 'Belum tersedia', not_collected: 'Tidak dikumpulkan', failed: 'Gagal diambil' },
  origin: { manual: 'Manual', imported: 'Impor', api: 'API' },
  relationship: { supports: 'Mendukung', challenges: 'Menantang', context: 'Konteks' },
  format: { brief: 'Brief', short_video_script: 'Naskah video pendek', caption: 'Caption', article: 'Artikel', thread: 'Thread', other: 'Lainnya' },
  claim_status: { supported: 'Didukung bukti', unsupported: 'Tanpa bukti', needs_verification: 'Perlu verifikasi' },
}
const badgeTone = {
  candidate: 'b-neutral', accepted: 'b-ok', rejected: 'b-bad', draft: 'b-neutral', in_review: 'b-info', approved: 'b-ok',
  planned: 'b-neutral', published: 'b-ok', not_published: 'b-warn', observed: 'b-ok', not_yet_available: 'b-warn', not_collected: 'b-neutral', failed: 'b-bad',
  supported: 'b-ok', unsupported: 'b-bad', needs_verification: 'b-warn', supports: 'b-ok', challenges: 'b-bad', context: 'b-neutral',
}
const badge = (group, v) => html`<span class="badge ${badgeTone[v] || 'b-neutral'}">${LABELS[group]?.[v] ?? v}</span>`

function toast(msg) {
  $$('.toast').forEach((x) => x.remove())
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200)
}
function errorBox(err) {
  if (!err) return ''
  const details = err.body?.error?.details
  const list = details && typeof details === 'object' ? Object.entries(details).map(([k, v]) => html`<li><strong>${k}</strong>: ${typeof v === 'string' ? v : JSON.stringify(v)}</li>`) : []
  return html`<div class="alert alert-error" role="alert">${err.message}${list.length ? html`<ul>${list}</ul>` : ''}</div>`
}
const skeleton = (n = 3) => raw(Array.from({ length: n }, () => '<div class="skeleton"></div>').join(''))

function formData(form) {
  const o = {}
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue
    if (el.type === 'checkbox') continue
    let v = el.value
    if (el.type === 'datetime-local' || el.type === 'date') v = v ? new Date(v).toISOString() : ''
    if (el.type === 'number') v = v === '' ? '' : Number(v)
    o[el.name] = v
  }
  return o
}
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined))

// ---------- State & routing ----------
const state = { user: undefined, workspaces: [], wsId: localStorage.getItem('olt_ws') || null }
const ws = () => state.workspaces.find((w) => w.id === state.wsId)
const NAV = [
  ['overview', 'Ikhtisar', '◎'], ['research', 'Riset', '1'], ['opportunities', 'Peluang', '2'],
  ['content', 'Content Studio', '3'], ['experiments', 'Eksperimen', '4'], ['learning', 'Pembelajaran', '5'], ['settings', 'Pengaturan', '⚙'],
]
function route() {
  const path = location.hash.replace(/^#\/?/, '').split('?')[0]
  const [page = 'overview', id = null] = path.split('/')
  return { page: page || 'overview', id }
}
const go = (hash) => { location.hash = hash }
window.addEventListener('hashchange', () => render())

async function boot() {
  try { const r = await api('GET', '/auth/me'); state.user = r.user; if (state.user) await loadWorkspaces() } catch { state.user = null }
  render()
}
async function loadWorkspaces() {
  const r = await api('GET', '/workspaces')
  state.workspaces = r.workspaces
  if (!ws()) state.wsId = state.workspaces[0]?.id || null
  if (state.wsId) localStorage.setItem('olt_ws', state.wsId); else localStorage.removeItem('olt_ws')
}

// ---------- Render root ----------
const app = $('#app')
function render() {
  if (state.user === undefined) return
  if (!state.user) return renderAuth()
  if (!state.workspaces.length) return renderShell(renderFirstWorkspace)
  const { page, id } = route()
  const pages = { overview: pageOverview, research: pageResearch, opportunities: pageOpportunities, content: pageContent, experiments: pageExperiments, learning: pageLearning, settings: pageSettings }
  renderShell(pages[page] || pageOverview, id)
}

function renderShell(pageFn, id) {
  const { page } = route()
  app.innerHTML = html`
  <div class="mobile-top"><strong>OLTAVYN</strong><button class="btn btn-ghost btn-sm" id="menu-btn" aria-expanded="false" aria-controls="sidebar" style="color:#fff;border-color:#3a4870">Menu</button></div>
  <div class="shell">
    <aside class="sidebar" id="sidebar" aria-label="Navigasi utama">
      <div class="brand"><div class="brand-mark" aria-hidden="true"><span></span></div><div><div class="brand-name">OLTAVYN</div><div class="brand-sub">Agentic Content OS</div></div></div>
      ${state.workspaces.length ? html`<div class="ws-switch"><label for="ws-select">Workspace</label>
        <select id="ws-select">${state.workspaces.map((w) => html`<option value="${w.id}" ${w.id === state.wsId ? raw('selected') : ''}>${w.name}</option>`)}<option value="__new">+ Workspace baru</option></select></div>` : ''}
      ${state.workspaces.length ? html`<nav class="nav">${NAV.map(([k, label, step]) => html`<a href="#/${k}" ${page === k ? raw('aria-current="page"') : ''}><span class="step" aria-hidden="true">${step}</span>${label}</a>`)}</nav>` : ''}
      <div class="sidebar-foot"><div>${state.user.display_name || state.user.email}</div><button class="btn btn-ghost btn-sm" id="logout-btn">Keluar</button></div>
    </aside>
    <main class="main" id="main" tabindex="-1"></main>
  </div>`.s
  $('#logout-btn').onclick = async () => { await api('POST', '/auth/logout', {}).catch(() => {}); state.user = null; state.workspaces = []; render() }
  $('#menu-btn').onclick = (e) => { const sb = $('#sidebar'); sb.classList.toggle('open'); e.target.setAttribute('aria-expanded', sb.classList.contains('open')) }
  const sel = $('#ws-select')
  if (sel) sel.onchange = () => {
    if (sel.value === '__new') { openWorkspaceDialog(); sel.value = state.wsId; return }
    state.wsId = sel.value; localStorage.setItem('olt_ws', state.wsId); go('#/overview'); render()
  }
  pageFn($('#main'), id)
}

// ---------- Auth ----------
function renderAuth(mode = 'login', err = null) {
  app.innerHTML = html`
  <div class="auth-wrap">
    <section class="auth-hero">
      <div class="brand" style="padding:0;margin-bottom:28px"><div class="brand-mark" aria-hidden="true"><span></span></div><div><div class="brand-name">OLTAVYN</div><div class="brand-sub">Agentic Content OS</div></div></div>
      <h1>Dari bukti ke pembelajaran, satu loop yang jujur.</h1>
      <p>Workbench untuk kreator dan operator kecil: temukan peluang yang didukung bukti, ubah jadi konten yang Anda setujui, catat apa yang benar-benar terjadi, lalu putuskan uji berikutnya.</p>
      <ol><li>Riset — bukti yang dapat diperiksa</li><li>Peluang — alasan yang transparan</li><li>Konten — draf, versi, persetujuan</li><li>Publikasi — log manual, tanpa posting otomatis</li><li>Pembelajaran — dari data nyata, bukan tebakan</li></ol>
    </section>
    <section class="auth-panel">
      <div class="card auth-card">
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected="${mode === 'login'}" data-mode="login">Masuk</button>
          <button role="tab" aria-selected="${mode === 'register'}" data-mode="register">Daftar</button>
        </div>
        ${errorBox(err)}
        <form id="auth-form" novalidate>
          ${mode === 'register' ? html`<div class="field"><label class="l" for="display_name">Nama tampilan</label><input id="display_name" name="display_name" type="text" maxlength="80" autocomplete="name"></div>` : ''}
          <div class="field"><label class="l" for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label class="l" for="password">Kata sandi</label><input id="password" name="password" type="password" required minlength="10" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
            ${mode === 'register' ? html`<div class="hint">Minimal 10 karakter. Jangan gunakan kata sandi akun platform lain.</div>` : ''}</div>
          <button class="btn btn-primary" style="width:100%" type="submit">${mode === 'login' ? 'Masuk' : 'Buat akun'}</button>
        </form>
        <p class="small muted" style="margin-top:14px">OLTAVYN tidak pernah meminta kata sandi, cookie, atau OTP akun media sosial/marketplace Anda.</p>
      </div>
    </section>
  </div>`.s
  $$('[data-mode]').forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)))
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault()
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true
    try {
      const r = await api('POST', `/auth/${mode}`, compact(formData(e.target)))
      state.user = r.user; await loadWorkspaces(); go('#/overview'); render()
    } catch (er) { renderAuth(mode, er) }
  }
}

// ---------- Workspace create ----------
function workspaceFields(w = {}) {
  return html`
    <div class="field"><label class="l" for="w-name">Nama workspace *</label><input id="w-name" name="name" type="text" required maxlength="120" value="${w.name || ''}"></div>
    <div class="field"><label class="l" for="w-niche">Topik / niche</label><input id="w-niche" name="niche" type="text" maxlength="300" value="${w.niche || ''}" placeholder="mis. perlengkapan dapur untuk kos"></div>
    <div class="field"><label class="l" for="w-aud">Audiens</label><textarea id="w-aud" name="audience" maxlength="500" placeholder="Siapa yang ingin Anda bantu?">${w.audience || ''}</textarea></div>
    <div class="field"><label class="l" for="w-goal">Tujuan</label><textarea id="w-goal" name="goal" maxlength="500" placeholder="mis. menguji 3 sudut konten dalam 2 minggu">${w.goal || ''}</textarea></div>
    <div class="field"><label class="l" for="w-src">Sumber yang diizinkan</label><textarea id="w-src" name="allowed_sources" maxlength="1000" placeholder="mis. ekspor analitik akun sendiri, wawancara pengguna, halaman publik">${w.allowed_sources || ''}</textarea>
      <div class="hint">Hanya sumber yang Anda berhak akses. OLTAVYN tidak melakukan scraping.</div></div>`
}
function renderFirstWorkspace(main, _id, err) {
  main.innerHTML = html`
  <div class="page-head"><div><h1>Buat workspace pertama</h1><p>Workspace menyimpan satu topik, audiens, dan tujuan beserta seluruh bukti, peluang, konten, dan eksperimen terkait.</p></div></div>
  <div class="card" style="max-width:640px">${errorBox(err)}<form id="ws-form">${workspaceFields()}<button class="btn btn-primary" type="submit">Buat workspace</button></form></div>`.s
  $('#ws-form').onsubmit = async (e) => {
    e.preventDefault()
    try { const r = await api('POST', '/workspaces', compact(formData(e.target))); await afterWsCreated(r.workspace) } catch (er) { renderFirstWorkspace(main, null, er) }
  }
}
async function afterWsCreated(w) { state.wsId = w.id; await loadWorkspaces(); toast('Workspace dibuat.'); go('#/overview'); render() }

// ---------- Dialog helper ----------
function dialog({ title, body, submitLabel = 'Simpan', danger = false, onSubmit, wide = false }) {
  const d = document.createElement('dialog')
  if (wide) d.style.width = 'min(920px, 96vw)'
  d.innerHTML = html`<form method="dialog" novalidate>
    <div class="dlg-head"><h2>${title}</h2><button type="button" class="btn btn-ghost btn-sm" data-close aria-label="Tutup">✕</button></div>
    <div class="dlg-body"><div data-err></div>${body}</div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-close>Batal</button>${onSubmit ? html`<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitLabel}</button>` : ''}</div>
  </form>`.s
  document.body.appendChild(d)
  const close = () => { d.close(); d.remove() }
  $$('[data-close]', d).forEach((b) => (b.onclick = close))
  d.addEventListener('cancel', () => d.remove())
  $('form', d).onsubmit = async (e) => {
    e.preventDefault()
    if (!onSubmit) return close()
    const btn = $('button[type=submit]', d); btn.disabled = true
    try { await onSubmit(e.target, d); close() } catch (er) { $('[data-err]', d).innerHTML = errorBox(er).s; btn.disabled = false; $('.dlg-body', d).scrollTop = 0 }
  }
  d.showModal()
  return d
}
function openWorkspaceDialog() {
  dialog({ title: 'Workspace baru', body: workspaceFields(), submitLabel: 'Buat', onSubmit: async (f) => { const r = await api('POST', '/workspaces', compact(formData(f))); await afterWsCreated(r.workspace) } })
}

// ---------- Generic async page loader ----------
async function loadInto(main, headHtml, loader, view) {
  main.innerHTML = html`${headHtml}<div data-body class="card">${skeleton(4)}</div>`.s
  const target = $('[data-body]', main)
  try {
    const data = await loader()
    target.outerHTML = `<div data-body>${view(data).s}</div>`
    return { data, root: $('[data-body]', main) }
  } catch (er) {
    if (er.status === 401) return {}
    target.innerHTML = html`${errorBox(er)}<button class="btn btn-ghost" data-retry>Coba lagi</button>`.s
    $('[data-retry]', target).onclick = () => render()
    return {}
  }
}
const head = (title, desc, actions = '') => html`<div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div><div class="row">${actions}</div></div>`

// ---------- Overview ----------
async function pageOverview(main) {
  const { data } = await loadInto(main, head('Ikhtisar', 'Status loop Riset → Peluang → Konten → Publikasi → Pembelajaran untuk workspace ini.'),
    () => api('GET', `/workspaces/${state.wsId}/overview`),
    (d) => {
      const c = d.counts
      const steps = [['Bukti', c.evidence > 0], ['Peluang', c.opportunities_accepted > 0 || c.opportunities > 0], ['Konten disetujui', c.assets_approved > 0], ['Publikasi dicatat', c.experiments_closed > 0], ['Observasi', c.observations > 0]]
      return html`
      <div class="card next-action"><div class="small muted">Langkah berikutnya</div><h2 style="margin-top:4px">${d.next_action}</h2>
        <div class="loop">${steps.map(([l, done]) => html`<span class="${done ? 'done' : ''}">${done ? '✓ ' : ''}${l}</span>`)}</div></div>
      <div class="grid grid-4" style="margin-top:14px">
        <div class="card stat"><div class="k">Bukti aktif</div><div class="v">${c.evidence}</div></div>
        <div class="card stat"><div class="k">Peluang</div><div class="v">${c.opportunities}</div><div class="s">${c.opportunities_accepted} diterima</div></div>
        <div class="card stat"><div class="k">Aset konten</div><div class="v">${c.assets}</div><div class="s">${c.assets_approved} disetujui</div></div>
        <div class="card stat"><div class="k">Eksperimen</div><div class="v">${c.experiments}</div><div class="s">${c.experiments_closed} ditutup</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:14px">
        <div class="card"><h3>WELL — 7 hari terakhir</h3>
          <p class="muted small">Weekly Evidence-to-Learning Loops: eksperimen dengan bukti pendukung, versi disetujui, status publikasi/berhenti, observasi atau status "belum tersedia", dan keputusan berikutnya.</p>
          <div class="row"><div class="stat"><div class="k">Loop lengkap</div><div class="v">${d.well.loops}</div></div>
          <div class="stat"><div class="k">Dengan hasil teramati</div><div class="v">${d.well.loops_with_observed_results}</div></div></div>
          <p class="small muted">Belum ada target numerik — target ditetapkan setelah baseline nyata terukur.</p></div>
        <div class="card"><h3>Workspace</h3><dl class="kv">
          <dt>Topik</dt><dd>${d.workspace.niche || html`<span class="muted">Belum diisi</span>`}</dd>
          <dt>Audiens</dt><dd>${d.workspace.audience || html`<span class="muted">Belum diisi</span>`}</dd>
          <dt>Tujuan</dt><dd>${d.workspace.goal || html`<span class="muted">Belum diisi</span>`}</dd>
          <dt>Observasi</dt><dd>${c.observations} tercatat · ${c.observations_real} bernilai teramati</dd></dl></div>
      </div>`
    })
  return data
}

// ---------- Research (Evidence) ----------
function evidenceFields(e = {}) {
  const opt = (group, cur) => Object.entries(LABELS[group]).map(([k, v]) => html`<option value="${k}" ${k === cur ? raw('selected') : ''}>${v}</option>`)
  const localDt = (iso) => iso ? new Date(iso).toISOString().slice(0, 16) : ''
  return html`
  <div class="field"><label class="l" for="e-title">Judul bukti *</label><input id="e-title" name="title" type="text" required maxlength="200" value="${e.title || ''}"></div>
  <div class="grid grid-2">
    <div class="field"><label class="l" for="e-type">Jenis sumber *</label><select id="e-type" name="source_type">${opt('source_type', e.source_type)}</select></div>
    <div class="field"><label class="l" for="e-method">Metode pengumpulan *</label><select id="e-method" name="collection_method">${opt('collection_method', e.collection_method)}</select></div>
  </div>
  <div class="field"><label class="l" for="e-url">URL sumber</label><input id="e-url" name="source_url" type="url" maxlength="2000" value="${e.source_url || ''}" placeholder="https://…"></div>
  <div class="field"><label class="l" for="e-ref">Referensi sumber (jika tanpa URL)</label><input id="e-ref" name="source_reference" type="text" maxlength="500" value="${e.source_reference || ''}" placeholder="mis. Wawancara #3, 12 Okt; ekspor analitik akun_x.csv"><div class="hint">Wajib isi URL atau referensi agar bukti dapat diperiksa.</div></div>
  <div class="field"><label class="l" for="e-obs">Waktu diamati</label><input id="e-obs" name="observed_at" type="datetime-local" value="${localDt(e.observed_at)}"></div>
  <div class="field"><label class="l" for="e-exc">Apa kata sumber (kutipan/ringkasan)</label><textarea id="e-exc" name="excerpt" maxlength="5000">${e.excerpt || ''}</textarea></div>
  <div class="field"><label class="l" for="e-int">Interpretasi kita</label><textarea id="e-int" name="interpretation" maxlength="3000" placeholder="Pisahkan dari pernyataan sumber.">${e.interpretation || ''}</textarea></div>
  <div class="grid grid-2">
    <div class="field"><label class="l" for="e-rel">Catatan keandalan</label><textarea id="e-rel" name="reliability_notes" maxlength="2000">${e.reliability_notes || ''}</textarea></div>
    <div class="field"><label class="l" for="e-lim">Keterbatasan</label><textarea id="e-lim" name="limitations" maxlength="2000" placeholder="mis. sampel kecil, satu wilayah">${e.limitations || ''}</textarea></div>
  </div>`
}
function evidenceItem(e) {
  return html`<article class="item item-click" tabindex="0" data-ev="${e.id}">
    <div class="spread"><h3>${e.title}</h3><span class="badge b-info">${LABELS.source_type[e.source_type]}</span></div>
    ${e.excerpt ? html`<div class="quote">${e.excerpt.length > 260 ? e.excerpt.slice(0, 260) + '…' : e.excerpt}</div>` : ''}
    <div class="meta"><span>Sumber: ${e.source_url ? new URL(e.source_url).host : e.source_reference}</span><span>Diamati: ${fmtDay(e.observed_at)}</span><span>Dicatat: ${fmtDay(e.captured_at)}</span><span>${LABELS.collection_method[e.collection_method]}</span></div>
  </article>`
}
async function pageResearch(main, id) {
  if (id) return evidenceDetail(main, id)
  const showArchived = new URLSearchParams(location.hash.split('?')[1] || '').get('archived') === '1'
  const loading = loadInto(main,
    head('Riset', 'Buku besar bukti. Setiap rekomendasi harus bisa ditelusuri ke sini.', html`<button class="btn btn-primary" id="add-ev">+ Tambah bukti</button>`),
    () => api('GET', `/workspaces/${state.wsId}/evidence${showArchived ? '?status=archived' : ''}`),
    (d) => d.evidence.length
      ? html`<div class="row" style="margin-bottom:10px"><a class="small" href="#/research${showArchived ? '' : '?archived=1'}">${showArchived ? 'Tampilkan bukti aktif' : 'Tampilkan arsip'}</a></div>${d.evidence.map(evidenceItem)}`
      : html`<div class="empty"><h3>${showArchived ? 'Tidak ada bukti diarsipkan' : 'Belum ada bukti'}</h3><p>Tambahkan bukti dari sumber yang Anda berhak akses: ekspor analitik akun sendiri, wawancara, atau halaman publik — lengkap dengan URL/referensi dan waktu diamati.</p>
        ${showArchived ? html`<a href="#/research">Kembali ke bukti aktif</a>` : html`<button class="btn btn-primary" data-add>+ Tambah bukti pertama</button>`}</div>`)
  const open = () => dialog({ title: 'Tambah bukti', body: evidenceFields(), wide: true, onSubmit: async (f) => { await api('POST', `/workspaces/${state.wsId}/evidence`, compact(formData(f))); toast('Bukti disimpan.'); render() } })
  $('#add-ev').onclick = open
  const { root } = await loading
  if (root) {
    $$('[data-add]', root).forEach((b) => (b.onclick = open))
    $$('[data-ev]', root).forEach((el) => { el.onclick = () => go(`#/research/${el.dataset.ev}`); el.onkeydown = (e) => e.key === 'Enter' && el.click() })
  }
}
async function evidenceDetail(main, id) {
  const { data, root } = await loadInto(main, html`<p><a href="#/research">← Riset</a></p>`, () => api('GET', `/evidence/${id}`), ({ evidence: e }) => html`
    <div class="card"><div class="spread"><div><h1>${e.title}</h1><div class="row">${badge('source_type', e.source_type)} <span class="badge ${e.status === 'active' ? 'b-ok' : 'b-neutral'}">${e.status === 'active' ? 'Aktif' : 'Diarsipkan'}</span></div></div>
      <div class="row"><button class="btn btn-ghost" id="edit-ev">Sunting</button><button class="btn btn-ghost" id="arch-ev">${e.status === 'active' ? 'Arsipkan' : 'Aktifkan lagi'}</button></div></div>
      <dl class="kv" style="margin-top:14px">
        <dt>URL sumber</dt><dd>${e.source_url ? html`<a href="${e.source_url}" target="_blank" rel="noopener noreferrer nofollow">${e.source_url}</a>` : '—'}</dd>
        <dt>Referensi</dt><dd>${e.source_reference || '—'}</dd>
        <dt>Diamati</dt><dd>${fmtDate(e.observed_at)}</dd><dt>Dicatat</dt><dd>${fmtDate(e.captured_at)}</dd>
        <dt>Metode</dt><dd>${LABELS.collection_method[e.collection_method]}</dd>
        <dt>Keandalan</dt><dd>${e.reliability_notes || html`<span class="muted">Tidak dicatat</span>`}</dd>
        <dt>Keterbatasan</dt><dd>${e.limitations || html`<span class="muted">Tidak dicatat</span>`}</dd>
      </dl></div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="card"><h3>Apa kata sumber</h3>${e.excerpt ? html`<div class="quote">${e.excerpt}</div>` : html`<p class="muted">Tidak ada kutipan.</p>`}</div>
      <div class="card"><h3>Interpretasi kita</h3>${e.interpretation ? html`<p style="white-space:pre-wrap">${e.interpretation}</p>` : html`<p class="muted">Belum ada interpretasi.</p>`}</div>
    </div>`)
  if (!root) return
  const e = data.evidence
  $('#edit-ev', root).onclick = () => dialog({ title: 'Sunting bukti', body: evidenceFields(e), wide: true, onSubmit: async (f) => { await api('PATCH', `/evidence/${id}`, formData(f)); toast('Bukti diperbarui.'); render() } })
  $('#arch-ev', root).onclick = async () => { await api('PATCH', `/evidence/${id}`, { status: e.status === 'active' ? 'archived' : 'active' }); render() }
}

// ---------- Opportunities ----------
const SCORE_FIELDS = [['score_relevance', 'Relevansi ke audiens'], ['score_evidence', 'Kekuatan bukti'], ['score_repeat_signal', 'Sinyal berulang'], ['score_feasibility', 'Kelayakan produksi'], ['score_risk', 'Risiko / ketidakpastian']]
async function opportunityFields(o = {}) {
  const { evidence } = await api('GET', `/workspaces/${state.wsId}/evidence`)
  const linked = new Map((o.evidence || []).map((e) => [e.id, e.relationship]))
  return html`
  <div class="field"><label class="l" for="o-title">Judul peluang *</label><input id="o-title" name="title" type="text" required maxlength="200" value="${o.title || ''}"></div>
  <div class="field"><label class="l" for="o-prob">Masalah / kebutuhan audiens *</label><textarea id="o-prob" name="audience_problem" required maxlength="2000">${o.audience_problem || ''}</textarea></div>
  <fieldset><legend>Tautan bukti</legend>
    ${evidence.length ? evidence.map((e) => html`<div class="check"><select data-link="${e.id}" aria-label="Hubungan bukti ${e.title}">
        <option value="">— tidak ditautkan</option>${['supports', 'challenges', 'context'].map((r) => html`<option value="${r}" ${linked.get(e.id) === r ? raw('selected') : ''}>${LABELS.relationship[r]}</option>`)}</select><span>${e.title}</span></div>`)
      : html`<p class="muted small">Belum ada bukti. Peluang tanpa bukti pendukung akan ditandai sebagai <strong>hipotesis</strong>.</p>`}
  </fieldset>
  <div class="field"><label class="l" for="o-rat">Alasan (mengapa ini)</label><textarea id="o-rat" name="rationale" maxlength="4000">${o.rationale || ''}</textarea></div>
  <div class="field"><label class="l" for="o-unk">Yang belum diketahui</label><textarea id="o-unk" name="unknowns" maxlength="3000">${o.unknowns || ''}</textarea></div>
  <fieldset><legend>Faktor penilaian (1–5, alat bantu keputusan — bukan bukti permintaan)</legend><div class="grid grid-2">
    ${SCORE_FIELDS.map(([k, l]) => html`<div class="field"><label class="l" for="o-${k}">${l}</label><select id="o-${k}" name="${k}"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${o[k] === n ? raw('selected') : ''}>${n}</option>`)}</select></div>`)}
  </div></fieldset>`
}
function collectLinks(form) { return $$('[data-link]', form).filter((s) => s.value).map((s) => ({ evidence_item_id: s.dataset.link, relationship: s.value })) }
function oppPayload(form) {
  const d = formData(form)
  for (const [k] of SCORE_FIELDS) d[k] = d[k] === '' ? null : Number(d[k])
  d.evidence_links = collectLinks(form)
  return d
}
async function pageOpportunities(main, id) {
  if (id) return opportunityDetail(main, id)
  const loading = loadInto(main,
    head('Peluang', 'Kandidat peluang dengan bukti pendukung, bukti yang menantang, dan hal yang belum diketahui.', html`<button class="btn btn-primary" id="add-opp">+ Peluang baru</button>`),
    () => api('GET', `/workspaces/${state.wsId}/opportunities`),
    (d) => d.opportunities.length ? d.opportunities.map((o) => html`
      <article class="item item-click" tabindex="0" data-opp="${o.id}">
        <div class="spread"><h3>${o.title}</h3><div class="row">${o.is_hypothesis ? html`<span class="badge b-warn">Hipotesis — tanpa bukti pendukung</span>` : ''}${badge('opp_status', o.status)}</div></div>
        <p class="muted" style="margin:4px 0 6px">${o.audience_problem.length > 200 ? o.audience_problem.slice(0, 200) + '…' : o.audience_problem}</p>
        <div class="meta"><span>${o.supports_count} bukti mendukung</span><span>${o.challenges_count} bukti menantang</span><span>Dibuat ${fmtDay(o.created_at)}</span></div>
      </article>`)
      : html`<div class="empty"><h3>Belum ada peluang</h3><p>Buat peluang dan tautkan ke bukti di Riset. Tanpa bukti pendukung, peluang otomatis ditandai sebagai hipotesis untuk diuji.</p><button class="btn btn-primary" data-add>+ Peluang pertama</button></div>`)
  const open = async () => dialog({ title: 'Peluang baru', body: await opportunityFields(), wide: true, onSubmit: async (f) => { const r = await api('POST', `/workspaces/${state.wsId}/opportunities`, oppPayload(f)); toast('Peluang dibuat.'); go(`#/opportunities/${r.opportunity.id}`) } })
  $('#add-opp').onclick = open
  const { root } = await loading
  if (root) {
    $$('[data-add]', root).forEach((b) => (b.onclick = open))
    $$('[data-opp]', root).forEach((el) => { el.onclick = () => go(`#/opportunities/${el.dataset.opp}`); el.onkeydown = (e) => e.key === 'Enter' && el.click() })
  }
}
async function opportunityDetail(main, id) {
  const { data, root } = await loadInto(main, html`<p><a href="#/opportunities">← Peluang</a></p>`, () => api('GET', `/opportunities/${id}`), ({ opportunity: o }) => {
    const group = (rel) => o.evidence.filter((e) => e.relationship === rel)
    const evList = (list, emptyText) => list.length ? list.map((e) => html`<div class="item"><div class="spread"><a href="#/research/${e.id}"><strong>${e.title}</strong></a>${e.status === 'archived' ? html`<span class="badge b-neutral">Diarsipkan</span>` : ''}</div>
      ${e.excerpt ? html`<div class="quote">${e.excerpt.slice(0, 240)}</div>` : ''}<div class="meta"><span>${e.source_url || e.source_reference}</span><span>Diamati ${fmtDay(e.observed_at)}</span>${e.limitations ? html`<span>Keterbatasan: ${e.limitations}</span>` : ''}</div></div>`) : html`<p class="muted small">${emptyText}</p>`
    return html`
    <div class="card"><div class="spread"><div><h1>${o.title}</h1><div class="row">${badge('opp_status', o.status)}${o.is_hypothesis ? html`<span class="badge b-warn">Hipotesis — perlu bukti</span>` : html`<span class="badge b-ok">Didukung bukti</span>`}</div></div>
      <div class="row">
        ${o.status !== 'accepted' ? html`<button class="btn btn-ghost" data-status="accepted">Terima</button>` : ''}
        ${o.status !== 'rejected' ? html`<button class="btn btn-ghost" data-status="rejected">Tolak</button>` : ''}
        <button class="btn btn-ghost" id="edit-opp">Sunting</button>
        ${o.status !== 'rejected' ? html`<button class="btn btn-primary" id="gen">Buat draf konten</button>` : ''}
      </div></div>
      <h3 style="margin-top:14px">Masalah audiens</h3><p style="white-space:pre-wrap">${o.audience_problem}</p>
      <div class="grid grid-2"><div><h3>Mengapa ini</h3><p style="white-space:pre-wrap">${o.rationale || '—'}</p></div><div><h3>Yang belum diketahui</h3><p style="white-space:pre-wrap">${o.unknowns || '—'}</p></div></div>
    </div>
    <div class="card"><h3>Faktor penilaian</h3><p class="small muted">Alat bantu keputusan yang dapat Anda sunting. Bukan bukti permintaan atau kepastian statistik. Tidak ada skor total tersembunyi.</p>
      <table><thead><tr><th>Faktor</th><th>Nilai (1–5)</th></tr></thead><tbody>${SCORE_FIELDS.map(([k, l]) => html`<tr><td>${l}</td><td>${o[k] ?? html`<span class="muted">Belum dinilai</span>`}</td></tr>`)}</tbody></table></div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="card"><h3>Bukti pendukung (${group('supports').length})</h3>${evList(group('supports'), 'Belum ada bukti pendukung.')}</div>
      <div class="card"><h3>Bukti yang menantang (${group('challenges').length})</h3>${evList(group('challenges'), 'Belum ada bukti yang menantang dicatat — pertimbangkan mencarinya.')}
        ${group('context').length ? html`<h3 style="margin-top:12px">Konteks</h3>${evList(group('context'), '')}` : ''}</div>
    </div>`
  })
  if (!root) return
  const o = data.opportunity
  $$('[data-status]', root).forEach((b) => (b.onclick = async () => { await api('PATCH', `/opportunities/${id}`, { status: b.dataset.status }); toast('Status diperbarui.'); render() }))
  $('#edit-opp', root).onclick = async () => dialog({ title: 'Sunting peluang', body: await opportunityFields(o), wide: true, onSubmit: async (f) => { await api('PATCH', `/opportunities/${id}`, oppPayload(f)); toast('Peluang diperbarui.'); render() } })
  const gen = $('#gen', root)
  if (gen) gen.onclick = () => dialog({
    title: 'Buat draf konten',
    body: html`<p>Draf dibuat dari template berbasis bukti peluang ini (template_v1, tanpa model AI eksternal). Hasilnya <strong>hanya draf</strong> — tidak ada yang diterbitkan.</p>
      <div class="field"><label class="l" for="g-format">Format</label><select id="g-format" name="format">${Object.entries(LABELS.format).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
      ${o.is_hypothesis ? html`<div class="alert alert-warn">Peluang ini belum didukung bukti. Draf akan menandai seluruh klaim sebagai belum terverifikasi.</div>` : ''}`,
    submitLabel: 'Buat draf',
    onSubmit: async (f) => { const r = await api('POST', `/opportunities/${id}/generate-brief`, formData(f)); toast('Draf dibuat.'); go(`#/content/${r.asset.id}`) },
  })
}

// ---------- Content Studio ----------
async function pageContent(main, id) {
  if (id) return assetDetail(main, id)
  const { root } = await loadInto(main,
    head('Content Studio', 'Brief dan aset konten. Setiap suntingan membuat versi baru; persetujuan terikat ke versi persis.'),
    () => api('GET', `/workspaces/${state.wsId}/assets`),
    (d) => d.assets.length ? d.assets.map((a) => html`
      <article class="item item-click" tabindex="0" data-asset="${a.id}"><div class="spread"><h3>${a.title}</h3>${badge('asset_status', a.status)}</div>
        <div class="meta"><span>${LABELS.format[a.format]}</span><span>Versi ${a.current_version_number}</span><span>Peluang: ${a.opportunity_title}</span><span>Diperbarui ${fmtDate(a.updated_at)}</span></div></article>`)
      : html`<div class="empty"><h3>Belum ada konten</h3><p>Buka sebuah peluang lalu pilih <strong>Buat draf konten</strong>.</p><a class="btn btn-primary" href="#/opportunities">Ke Peluang</a></div>`)
  if (root) $$('[data-asset]', root).forEach((el) => { el.onclick = () => go(`#/content/${el.dataset.asset}`); el.onkeydown = (e) => e.key === 'Enter' && el.click() })
}
async function assetDetail(main, id) {
  const { data, root } = await loadInto(main, html`<p><a href="#/content">← Content Studio</a></p>`, () => api('GET', `/assets/${id}`), ({ asset: a }) => {
    const cur = a.versions.find((v) => v.id === a.current_version_id)
    const approvalFor = (vid) => a.approvals.find((p) => p.asset_version_id === vid)
    const curApproval = approvalFor(cur.id)
    return html`
    <div class="card"><div class="spread"><div><h1>${a.title}</h1><div class="row">${badge('asset_status', a.status)}<span class="badge b-neutral">${LABELS.format[a.format]}</span><span class="badge b-neutral">Versi ${cur.version_number}</span></div></div>
      <div class="row">
        <button class="btn btn-ghost" id="edit-asset">Sunting (versi baru)</button>
        ${a.status === 'draft' || a.status === 'rejected' ? html`<button class="btn btn-ghost" id="submit-review">Ajukan tinjauan</button>` : ''}
        ${a.status === 'in_review' || a.status === 'draft' ? html`<button class="btn btn-primary" id="review">Tinjau & putuskan</button>` : ''}
        ${a.status === 'approved' ? html`<a class="btn btn-accent" href="#/experiments?version=${cur.id}">Catat eksperimen</a>` : ''}
        <button class="btn btn-ghost" id="dl">Unduh .md</button>
      </div></div>
      ${curApproval ? html`<div class="alert ${curApproval.decision === 'approved' ? 'alert-ok' : 'alert-warn'}" style="margin-top:12px">Versi ${cur.version_number} ${curApproval.decision === 'approved' ? 'disetujui' : 'ditolak'} ${fmtDate(curApproval.decided_at)}${curApproval.destination ? ` untuk tujuan: ${curApproval.destination}` : ''}. Hash isi: ${curApproval.body_sha256.slice(0, 12)}…</div>` : html`<p class="small muted" style="margin-top:10px">Versi ini belum disetujui. Konten tetap draf sampai Anda menyetujuinya.</p>`}
    </div>
    <div class="grid" style="grid-template-columns: minmax(0,2fr) minmax(0,1fr); margin-top:14px">
      <div class="card"><h3>Isi versi ${cur.version_number}</h3><pre class="body">${cur.body}</pre></div>
      <div class="card"><h3>Klaim & bukti</h3>${cur.claims.length ? cur.claims.map((cl) => html`<div class="item"><div>${badge('claim_status', cl.status)}</div><p style="margin:6px 0 4px">${cl.text}</p>
          ${cl.evidence_ids.length ? html`<div class="meta">${cl.evidence_ids.map((eid) => html`<a href="#/research/${eid}">bukti ${eid.slice(-6)}</a>`)}</div>` : html`<div class="meta">Tidak ada bukti terkait</div>`}</div>`) : html`<p class="muted small">Tidak ada klaim dipetakan.</p>`}
        <p class="small muted" style="margin-top:8px">Klaim tanpa bukti harus diverifikasi atau dihapus sebelum disetujui.</p></div>
    </div>
    <div class="card"><h3>Riwayat versi</h3><table><thead><tr><th>Versi</th><th>Dibuat</th><th>Sumber</th><th>Keputusan</th></tr></thead><tbody>
      ${a.versions.map((v) => { const ap = approvalFor(v.id); return html`<tr><td>v${v.version_number}${v.id === cur.id ? ' (terbaru)' : ''}</td><td>${fmtDate(v.created_at)}</td><td>${v.generator}</td><td>${ap ? badge('asset_status', ap.decision) : html`<span class="muted">—</span>`}</td></tr>` })}
    </tbody></table></div>`
  })
  if (!root) return
  const a = data.asset
  const cur = a.versions.find((v) => v.id === a.current_version_id)
  $('#dl', root).onclick = () => { const b = new Blob([cur.body], { type: 'text/markdown' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = `${a.title.replace(/[^\w-]+/g, '_').slice(0, 60)}_v${cur.version_number}.md`; l.click(); URL.revokeObjectURL(u) }
  $('#edit-asset', root).onclick = () => dialog({
    title: `Sunting — membuat versi ${a.versions[0].version_number + 1}`, wide: true,
    body: html`<div class="alert alert-info">Menyimpan suntingan membuat versi baru dan mengembalikan status ke draf. Persetujuan sebelumnya tidak berlaku untuk versi baru.</div>
      <div class="field"><label class="l" for="a-body">Isi</label><textarea class="tall" id="a-body" name="body" maxlength="20000">${cur.body}</textarea></div>
      <fieldset><legend>Klaim (status dapat disesuaikan)</legend>${cur.claims.map((cl, i) => html`<div class="check"><select data-claim="${i}" aria-label="Status klaim ${i + 1}">${Object.entries(LABELS.claim_status).map(([k, v]) => html`<option value="${k}" ${cl.status === k ? raw('selected') : ''}>${v}</option>`)}<option value="__remove">Hapus klaim</option></select><span class="small">${cl.text}</span></div>`)}
      ${cur.claims.length ? '' : html`<p class="muted small">Tidak ada klaim.</p>`}<p class="hint">"Didukung bukti" hanya berlaku bila klaim tertaut ke bukti; selain itu server menandainya "tanpa bukti".</p></fieldset>`,
    submitLabel: 'Simpan versi baru',
    onSubmit: async (f) => {
      const claims = cur.claims.map((cl, i) => ({ ...cl, status: $(`[data-claim="${i}"]`, f).value })).filter((cl) => cl.status !== '__remove')
      await api('POST', `/assets/${id}/versions`, { body: $('#a-body', f).value, claims }); toast('Versi baru disimpan.'); render()
    },
  })
  const sr = $('#submit-review', root)
  if (sr) sr.onclick = async () => { await api('POST', `/assets/${id}/submit-review`, {}); toast('Diajukan untuk ditinjau.'); render() }
  const rv = $('#review', root)
  if (rv) rv.onclick = () => {
    const unsupported = cur.claims.filter((c) => c.status !== 'supported').length
    dialog({
      title: `Tinjau versi ${cur.version_number}`, wide: true,
      body: html`<p>Anda menyetujui <strong>isi persis di bawah ini</strong> (hash <code>${cur.body_sha256.slice(0, 16)}…</code>). Persetujuan tidak menerbitkan apa pun — publikasi tetap manual dan dicatat di Eksperimen.</p>
        ${unsupported ? html`<div class="alert alert-warn">${unsupported} klaim belum didukung bukti atau perlu verifikasi.</div>` : ''}
        <pre class="body" style="max-height:280px">${cur.body}</pre>
        <div class="field" style="margin-top:12px"><label class="l">Keputusan *</label>
          <div class="check"><input type="radio" id="d-ok" name="decision" value="approved" checked><label for="d-ok">Setujui versi ini</label></div>
          <div class="check"><input type="radio" id="d-no" name="decision" value="rejected"><label for="d-no">Tolak</label></div></div>
        <div class="field"><label class="l" for="r-dest">Tujuan persis (kanal / akun) — wajib untuk persetujuan</label><input id="r-dest" name="destination" type="text" maxlength="300" placeholder="mis. TikTok @akun_saya — posting manual"></div>
        <div class="field"><label class="l" for="r-note">Catatan</label><textarea id="r-note" name="note" maxlength="2000"></textarea></div>`,
      submitLabel: 'Kirim keputusan',
      onSubmit: async (f) => {
        const decision = $('input[name=decision]:checked', f).value
        await api('POST', `/asset-versions/${cur.id}/approval`, compact({ decision, body_sha256: cur.body_sha256, destination: $('#r-dest', f).value, note: $('#r-note', f).value }))
        toast(decision === 'approved' ? 'Versi disetujui.' : 'Versi ditolak.'); render()
      },
    })
  }
}

// ---------- Experiments ----------
async function pageExperiments(main, id) {
  if (id) return experimentDetail(main, id)
  const preVersion = new URLSearchParams(location.hash.split('?')[1] || '').get('version')
  const loading = loadInto(main,
    head('Eksperimen', 'Log publikasi manual dan observasi hasil. OLTAVYN tidak memposting apa pun secara otomatis.', html`<button class="btn btn-primary" id="add-exp">+ Eksperimen baru</button>`),
    () => api('GET', `/workspaces/${state.wsId}/experiments`),
    (d) => d.experiments.length ? html`<table><thead><tr><th>Konten</th><th>Hipotesis</th><th>Kanal</th><th>Status</th><th>Observasi</th></tr></thead><tbody>
      ${d.experiments.map((e) => html`<tr class="item-click" tabindex="0" data-exp="${e.id}"><td><strong>${e.asset_title}</strong><div class="small muted">v${e.version_number}</div></td><td>${e.hypothesis.slice(0, 120)}</td><td>${e.channel}</td><td>${badge('exp_status', e.status)}</td><td>${e.observation_count || html`<span class="badge b-warn">Belum ada</span>`}</td></tr>`)}</tbody></table>`
      : html`<div class="empty"><h3>Belum ada eksperimen</h3><p>Eksperimen dibuat dari versi konten yang sudah disetujui. Catat hipotesis dan kanal, lalu status publikasi dan hasil nyata.</p></div>`)
  const open = async () => {
    const { assets } = await api('GET', `/workspaces/${state.wsId}/assets`)
    const approved = assets.filter((a) => a.status === 'approved')
    dialog({
      title: 'Eksperimen baru',
      body: approved.length ? html`
        <div class="field"><label class="l" for="x-ver">Versi konten disetujui *</label><select id="x-ver" name="asset_version_id">${approved.map((a) => html`<option value="${a.current_version_id}" ${a.current_version_id === preVersion ? raw('selected') : ''}>${a.title} — v${a.current_version_number}</option>`)}</select></div>
        <div class="field"><label class="l" for="x-hyp">Hipotesis *</label><textarea id="x-hyp" name="hypothesis" maxlength="2000" placeholder="mis. Hook berbasis masalah X menghasilkan lebih banyak simpan dibanding hook produk."></textarea></div>
        <div class="field"><label class="l" for="x-ch">Kanal *</label><input id="x-ch" name="channel" type="text" maxlength="200" placeholder="mis. TikTok, Instagram Reels, blog"></div>`
        : html`<div class="empty"><h3>Belum ada konten disetujui</h3><p>Setujui satu versi konten di Content Studio terlebih dahulu.</p></div>`,
      submitLabel: 'Buat eksperimen',
      onSubmit: approved.length ? async (f) => { const r = await api('POST', `/workspaces/${state.wsId}/experiments`, compact(formData(f))); toast('Eksperimen dibuat.'); go(`#/experiments/${r.experiment.id}`) } : null,
    })
  }
  $('#add-exp').onclick = open
  const { root } = await loading
  if (preVersion) open()
  if (root) $$('[data-exp]', root).forEach((el) => { el.onclick = () => go(`#/experiments/${el.dataset.exp}`); el.onkeydown = (e) => e.key === 'Enter' && el.click() })
}
async function experimentDetail(main, id) {
  const { data, root } = await loadInto(main, html`<p><a href="#/experiments">← Eksperimen</a></p>`, () => api('GET', `/experiments/${id}`), ({ experiment: e }) => html`
    <div class="card"><div class="spread"><div><h1>${e.version.title} <span class="muted">v${e.version.version_number}</span></h1><div class="row">${badge('exp_status', e.status)}<span class="badge b-neutral">${e.channel}</span></div></div>
      <div class="row"><button class="btn btn-primary" id="pub">Catat status publikasi</button><button class="btn btn-ghost" id="obs">+ Observasi</button><button class="btn btn-ghost" id="dec">Keputusan berikutnya</button></div></div>
      <dl class="kv" style="margin-top:14px">
        <dt>Hipotesis</dt><dd style="white-space:pre-wrap">${e.hypothesis}</dd>
        <dt>Disetujui untuk</dt><dd>${e.approval ? `${e.approval.destination} (${fmtDate(e.approval.decided_at)})` : '—'}</dd>
        <dt>URL publikasi</dt><dd>${e.published_url ? html`<a href="${e.published_url}" target="_blank" rel="noopener noreferrer nofollow">${e.published_url}</a>` : '—'}</dd>
        <dt>Waktu terbit</dt><dd>${fmtDate(e.published_at)}</dd>
        ${e.status === 'not_published' ? html`<dt>Alasan tidak terbit</dt><dd>${e.stop_reason}</dd>` : ''}
        <dt>Keputusan berikutnya</dt><dd>${e.next_decision || html`<span class="muted">Belum dicatat</span>`}</dd>
      </dl></div>
    <div class="card"><h3>Observasi</h3>
      ${e.observations.length ? html`<table><thead><tr><th>Metrik</th><th>Status</th><th>Nilai</th><th>Jendela</th><th>Asal</th><th>Sumber</th></tr></thead><tbody>
        ${e.observations.map((o) => html`<tr><td>${o.metric_name}</td><td>${badge('value_status', o.value_status)}</td><td>${o.value_status === 'observed' ? `${o.numeric_value} ${o.unit}` : html`<span class="muted">— (${o.unit})</span>`}</td><td>${o.window_start ? `${fmtDay(o.window_start)} – ${fmtDay(o.window_end)}` : '—'}</td><td>${LABELS.origin[o.origin]}</td><td>${o.source_reference || '—'}</td></tr>`)}</tbody></table>`
        : html`<div class="empty"><h3>Belum ada observasi</h3><p>Tambahkan nilai yang benar-benar teramati, atau tandai "belum tersedia" bila datanya belum ada. Data kosong tidak pernah dihitung sebagai nol.</p></div>`}
    </div>`)
  if (!root) return
  const e = data.experiment
  $('#pub', root).onclick = () => dialog({
    title: 'Catat status publikasi',
    body: html`<div class="alert alert-info">OLTAVYN tidak memposting. Catat apa yang Anda lakukan secara manual.</div>
      <div class="field"><label class="l" for="p-st">Status *</label><select id="p-st" name="status">${Object.entries(LABELS.exp_status).map(([k, v]) => html`<option value="${k}" ${e.status === k ? raw('selected') : ''}>${v}</option>`)}</select></div>
      <div class="field"><label class="l" for="p-url">URL publikasi (wajib jika terbit)</label><input id="p-url" name="published_url" type="url" maxlength="2000" value="${e.published_url || ''}"></div>
      <div class="field"><label class="l" for="p-at">Waktu terbit</label><input id="p-at" name="published_at" type="datetime-local" value="${e.published_at ? e.published_at.slice(0, 16) : ''}"></div>
      <div class="field"><label class="l" for="p-stop">Alasan tidak diterbitkan (wajib jika sengaja tidak terbit)</label><textarea id="p-stop" name="stop_reason" maxlength="2000">${e.stop_reason || ''}</textarea></div>`,
    onSubmit: async (f) => { await api('PATCH', `/experiments/${id}`, compact(formData(f))); toast('Status dicatat.'); render() },
  })
  $('#obs', root).onclick = () => dialog({
    title: 'Tambah observasi',
    body: html`<div class="grid grid-2">
      <div class="field"><label class="l" for="ob-m">Nama metrik *</label><input id="ob-m" name="metric_name" type="text" maxlength="100" placeholder="mis. views, saves, klik"></div>
      <div class="field"><label class="l" for="ob-u">Satuan *</label><input id="ob-u" name="unit" type="text" maxlength="50" placeholder="mis. tayangan, kali, %"></div></div>
      <div class="field"><label class="l" for="ob-s">Status nilai *</label><select id="ob-s" name="value_status">${Object.entries(LABELS.value_status).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select>
        <div class="hint">"Teramati" butuh nilai dan jendela waktu. 0 berarti nol nyata.</div></div>
      <div class="field"><label class="l" for="ob-v">Nilai</label><input id="ob-v" name="numeric_value" type="number" step="any"></div>
      <div class="grid grid-2"><div class="field"><label class="l" for="ob-ws">Awal jendela</label><input id="ob-ws" name="window_start" type="datetime-local"></div>
      <div class="field"><label class="l" for="ob-we">Akhir jendela</label><input id="ob-we" name="window_end" type="datetime-local"></div></div>
      <div class="grid grid-2"><div class="field"><label class="l" for="ob-o">Asal *</label><select id="ob-o" name="origin">${Object.entries(LABELS.origin).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
      <div class="field"><label class="l" for="ob-r">Referensi sumber</label><input id="ob-r" name="source_reference" type="text" maxlength="500" placeholder="mis. dashboard analitik TikTok, tangkapan 25 Okt"></div></div>
      <div class="field"><label class="l" for="ob-n">Catatan</label><textarea id="ob-n" name="notes" maxlength="2000"></textarea></div>`,
    onSubmit: async (f) => { await api('POST', `/experiments/${id}/observations`, compact(formData(f))); toast('Observasi dicatat.'); render() },
  })
  $('#dec', root).onclick = () => dialog({
    title: 'Keputusan berikutnya',
    body: html`<p class="small muted">Lihat Pembelajaran untuk ringkasan berbasis data yang tercatat.</p><div class="field"><label class="l" for="nd">Keputusan</label><textarea id="nd" name="next_decision" maxlength="2000" placeholder="mis. Ulangi dengan hook berbeda di kanal yang sama">${e.next_decision || ''}</textarea></div>`,
    onSubmit: async (f) => { await api('PATCH', `/experiments/${id}`, compact(formData(f))); toast('Keputusan dicatat.'); render() },
  })
}

// ---------- Learning ----------
async function pageLearning(main) {
  await loadInto(main, head('Pembelajaran', 'Ringkasan dari eksperimen dan observasi yang benar-benar tercatat. Metode deterministik, tanpa tebakan.'),
    () => api('GET', `/workspaces/${state.wsId}/learning-summary`),
    ({ summary: s }) => html`
    <div class="card next-action"><div class="small muted">Uji berikutnya yang disarankan</div><h2 style="margin-top:4px">${s.next_test.recommendation}</h2>
      <p class="muted" style="margin:6px 0 0">Alasan: ${s.next_test.reasoning}</p><p class="muted" style="margin:4px 0 0">Ketidakpastian: ${s.next_test.uncertainty}</p>
      ${s.next_test.based_on.length ? html`<p class="small muted" style="margin:4px 0 0">Berdasarkan ${s.next_test.based_on.length} catatan: ${s.next_test.based_on.map((x) => x.slice(-6)).join(', ')}</p>` : ''}</div>
    <div class="grid grid-4" style="margin-top:14px">
      <div class="card stat"><div class="k">Eksperimen</div><div class="v">${s.status.total}</div><div class="s">${s.status.planned} direncanakan</div></div>
      <div class="card stat"><div class="k">Terbit</div><div class="v">${s.status.published}</div><div class="s">${s.status.not_published} sengaja tidak</div></div>
      <div class="card stat"><div class="k">Dengan nilai teramati</div><div class="v">${s.status.with_observed_values}</div><div class="s">${s.status.without_any_observation} tanpa observasi</div></div>
      <div class="card stat"><div class="k">Keputusan dicatat</div><div class="v">${s.status.with_next_decision}</div></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Perbandingan per metrik</h3>
      ${s.comparisons.length ? s.comparisons.map((g) => html`<h4 style="margin-top:10px">${g.metric_name} <span class="muted">(${g.unit})</span></h4>
        <table><thead><tr><th>Konten</th><th>Kanal</th><th>Nilai</th><th>Jendela</th><th>Asal</th></tr></thead><tbody>
        ${g.rows.map((r) => html`<tr><td><a href="#/experiments/${r.experiment_id}">${r.asset_title}</a></td><td>${r.channel}</td><td><strong>${r.value}</strong> ${g.unit}</td><td>${fmtDay(r.window_start)} – ${fmtDay(r.window_end)}</td><td>${LABELS.origin[r.origin]}</td></tr>`)}</tbody></table>`)
        : html`<div class="empty"><h3>Belum ada nilai teramati</h3><p>Perbandingan muncul setelah Anda mencatat observasi bernilai. Tidak ada grafik ditampilkan tanpa data nyata.</p></div>`}
    </div>
    ${s.missing_data.length ? html`<div class="card"><h3>Data yang belum ada</h3><table><thead><tr><th>Eksperimen</th><th>Metrik</th><th>Status</th></tr></thead><tbody>
      ${s.missing_data.map((m) => html`<tr><td><a href="#/experiments/${m.experiment_id}">${m.experiment_id.slice(-6)}</a></td><td>${m.metric_name}</td><td>${badge('value_status', m.value_status)}</td></tr>`)}</tbody></table></div>` : ''}
    <div class="card"><h3>Catatan metodologi</h3><ul>${s.caveats.map((c) => html`<li>${c}</li>`)}</ul></div>`)
}

// ---------- Settings ----------
async function pageSettings(main) {
  const w = ws()
  main.innerHTML = html`${head('Pengaturan', 'Konfigurasi workspace, ekspor, dan penghapusan data.')}
  <div class="card" style="max-width:760px"><h2>Workspace</h2><div data-err></div><form id="set-form">${workspaceFields(w)}<button class="btn btn-primary" type="submit">Simpan</button></form></div>
  <div class="card" style="max-width:760px"><h2>Integrasi</h2><p class="muted">Belum ada integrasi terhubung. Publikasi bersifat manual pada MVP. Integrasi hanya akan ditambahkan setelah API resmi, izin, dan ketentuan platform diverifikasi.</p></div>
  <div class="card" style="max-width:760px"><h2>Ekspor data</h2><p class="muted">Unduh seluruh data workspace ini (bukti, peluang, konten & versi, persetujuan, eksperimen, observasi, log audit) sebagai JSON.</p><button class="btn btn-ghost" id="export">Ekspor JSON</button></div>
  <div class="card" style="max-width:760px;border-color:#efc5c5"><h2>Hapus workspace</h2><p class="muted">Menghapus permanen workspace beserta seluruh datanya dari basis data aktif. Hanya catatan audit minimal (jenis aksi dan waktu, tanpa isi konten) yang dipertahankan. Cadangan point-in-time D1 di Cloudflare dapat menyimpan salinan hingga 30 hari sesuai kebijakan penyedia. Tindakan ini tidak dapat dibatalkan.</p><button class="btn btn-danger" id="del">Hapus workspace…</button></div>
  <div class="card" style="max-width:760px"><h2>Privasi</h2><p class="muted small">OLTAVYN menyimpan email, hash kata sandi (PBKDF2-SHA256), dan data yang Anda masukkan. Tidak ada pelacak pihak ketiga. Kami tidak pernah meminta kata sandi/cookie/OTP akun platform lain.</p></div>`.s
  $('#set-form').onsubmit = async (e) => {
    e.preventDefault()
    try { await api('PATCH', `/workspaces/${w.id}`, formData(e.target)); await loadWorkspaces(); toast('Pengaturan disimpan.'); render() }
    catch (er) { $('[data-err]', main).innerHTML = errorBox(er).s }
  }
  $('#export').onclick = async () => {
    try {
      const data = await api('GET', `/workspaces/${w.id}/export`)
      const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b)
      const l = document.createElement('a'); l.href = u; l.download = `oltavyn-${w.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`; l.click(); URL.revokeObjectURL(u)
      toast('Ekspor diunduh.')
    } catch (er) { toast(er.message) }
  }
  $('#del').onclick = () => dialog({
    title: 'Hapus workspace', danger: true, submitLabel: 'Hapus permanen',
    body: html`<p>Ketik nama workspace <strong>${w.name}</strong> untuk mengonfirmasi.</p><div class="field"><label class="l" for="cf">Nama workspace</label><input id="cf" name="confirm" type="text" autocomplete="off"></div>`,
    onSubmit: async (f) => {
      await api('DELETE', `/workspaces/${w.id}?confirm=${encodeURIComponent($('#cf', f).value)}`)
      localStorage.removeItem('olt_ws'); state.wsId = null; await loadWorkspaces(); toast('Workspace dihapus.'); go('#/overview'); render()
    },
  })
}

boot()
