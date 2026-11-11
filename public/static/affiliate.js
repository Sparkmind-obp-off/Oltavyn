// Affiliate OS operator workbench (vanilla JS, CSP-safe: no inline handlers, all output escaped).
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const state = { ws: null, tab: 'overview', productId: null, rubric: null }
const SCORE_LABELS = { demand: 'Bukti permintaan (25%)', quality: 'Sinyal kualitas produk (20%)', commission: 'Potensi komisi (20%)', visual_potential: 'Potensi visual faceless (15%)', price_accessibility: 'Harga/keterjangkauan (10%)', seller_risk: 'Risiko penjual (10%, dibalik: 1 = risiko rendah)' }
const STATUS_ID = { candidate: 'Kandidat', shortlisted: 'Shortlist', selected: 'Terpilih', rejected: 'Ditolak', archived: 'Diarsipkan', planned: 'Rencana', active: 'Aktif', paused: 'Jeda', unverified: 'Belum terverifikasi', verified: 'Terverifikasi', conflicting: 'Bertentangan' }
const PLATFORM_ID = { shopee_video: 'Shopee Video', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook' }
const label = (v) => STATUS_ID[v] || v
const unknown = '<span class="muted">Belum diketahui</span>'
const rp = (n) => (n == null ? unknown : 'Rp ' + Number(n).toLocaleString('id-ID'))
const num = (n, suffix = '') => (n == null ? unknown : esc(Number(n).toLocaleString('id-ID')) + suffix)

function show(message, bad = false) {
  const el = $('#message'); el.textContent = message; el.classList.remove('hide'); el.classList.toggle('bad', bad)
  clearTimeout(show.t); show.t = setTimeout(() => el.classList.add('hide'), 6000)
}
async function api(method, path, body) {
  const res = await fetch('/api' + path, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const det = data.error?.details ? ' (' + Object.entries(data.error.details).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join('; ') + ')' : ''
    throw new Error((data.error?.message || 'Permintaan gagal.') + det)
  }
  return data
}
const formValues = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
const dropEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''))
async function withBusy(btn, fn) { if (btn) btn.disabled = true; try { await fn() } catch (e) { show(e.message, true) } finally { if (btn) btn.disabled = false } }
const W = () => '/affiliate/workspaces/' + encodeURIComponent(state.ws)

// ---------- Tabs ----------
function setTab(tab) {
  state.tab = tab
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)))
  $$('[data-panel]').forEach((p) => p.classList.toggle('hide', p.dataset.panel !== tab))
  ;({ overview: loadOverview, products: loadProducts, channels: loadChannels, providers: loadProviders, detail: loadDetail })[tab]?.()
}

// ---------- Overview ----------
async function loadOverview() {
  const el = $('#overview-body'); el.innerHTML = '<p class="loading">Memuat…</p>'
  try {
    const { summary: s } = await api('GET', W() + '/summary')
    el.innerHTML = `<div class="card next"><strong>Langkah berikutnya:</strong> ${esc(s.next_action)}</div>
      <div class="grid">${[['Produk aktif', s.products], ['Shortlist/terpilih', s.shortlisted], ['Belum diskor lengkap', s.unscored], ['Kanal', s.channels], ['Kanal aktif', s.active_channels], ['Paket konten', s.content_packages], ['Eksperimen tertaut', s.experiments]].map(([k, v]) => `<div class="card"><div class="muted small">${k}</div><div class="stat">${esc(v)}</div></div>`).join('')}</div>
      <p class="muted small">Angka di atas dihitung dari data workspace ini saja. Tidak ada metrik contoh/fiktif. Performa konten dicatat di <a href="/#/experiments">Eksperimen</a> dan dirangkum di <a href="/#/learning">Pembelajaran</a>.</p>`
  } catch (e) { el.innerHTML = `<p class="msg bad">${esc(e.message)}</p>` }
}

// ---------- Products ----------
async function loadProducts() {
  const el = $('#products'); el.innerHTML = '<p class="loading">Memuat produk…</p>'
  const status = $('#filter-status').value, q = $('#filter-q').value.trim()
  const qs = new URLSearchParams(dropEmpty({ status, q })).toString()
  try {
    const { products } = await api('GET', W() + '/products' + (qs ? '?' + qs : ''))
    el.innerHTML = products.length ? `<table><caption class="hide">Daftar produk</caption><thead><tr><th scope="col">Produk</th><th scope="col">Harga</th><th scope="col">Komisi</th><th scope="col">Skor</th><th scope="col">Bukti</th><th scope="col">Status</th></tr></thead><tbody>${products.map((p) => `<tr class="clickable" tabindex="0" data-product="${esc(p.id)}"><td><strong>${esc(p.title)}</strong><div class="small muted">${esc(p.category || 'Tanpa kategori')} · ${esc(p.marketplace)}</div></td><td>${rp(p.price_amount)}</td><td>${p.commission_rate_percent == null ? unknown : esc(p.commission_rate_percent) + '%'}</td><td>${p.latest_score == null ? '<span class="pill warn">Belum lengkap</span>' : '<strong>' + esc(p.latest_score) + '</strong>/100'}</td><td>${esc(p.evidence_count)} · <span class="pill ${p.evidence_state === 'verified' ? 'good' : p.evidence_state === 'conflicting' ? 'bad' : 'warn'}">${label(p.evidence_state)}</span></td><td><span class="pill">${label(p.lifecycle_status)}</span></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">Belum ada produk untuk filter ini. Tambahkan kandidat dari sumber yang dapat diperiksa.</p>'
    $$('[data-product]', el).forEach((tr) => { const open = () => { state.productId = tr.dataset.product; setTab('detail') }; tr.onclick = open; tr.onkeydown = (e) => e.key === 'Enter' && open() })
  } catch (e) { el.innerHTML = `<p class="msg bad">${esc(e.message)}</p>` }
}
const NUMERIC = ['price_amount', 'commission_rate_percent', 'commission_amount', 'product_rating', 'review_count', 'sold_count', 'seller_rating']
const productPayload = (f, keepEmpty) => {
  const v = formValues(f), out = {}
  for (const [k, x] of Object.entries(v)) { if (x === '' && !keepEmpty) continue; out[k] = x === '' ? null : NUMERIC.includes(k) ? Number(x) : x }
  return out
}

// ---------- Product detail ----------
async function loadDetail() {
  const el = $('#detail-body')
  if (!state.productId) { el.innerHTML = '<p class="muted">Pilih produk dari daftar.</p>'; return }
  el.innerHTML = '<p class="loading">Memuat detail…</p>'
  try {
    const [{ product: p }, { evidence: wsEvidence }, { opportunities }, { channels }, { experiments }] = await Promise.all([
      api('GET', '/affiliate/products/' + encodeURIComponent(state.productId)),
      api('GET', '/workspaces/' + encodeURIComponent(state.ws) + '/evidence'),
      api('GET', '/workspaces/' + encodeURIComponent(state.ws) + '/opportunities'),
      api('GET', W() + '/channels'),
      api('GET', '/workspaces/' + encodeURIComponent(state.ws) + '/experiments'),
    ])
    const latest = p.scorecards[0]
    const linkedIds = new Set(p.evidence.map((e) => e.id))
    const opt = (v, cur, text) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(text)}</option>`
    el.innerHTML = `
    <div class="spread"><button class="btn btn-ghost btn-sm" id="back-products">← Daftar produk</button><span class="pill">${label(p.lifecycle_status)}</span></div>
    <h2 style="margin:10px 0 4px">${esc(p.title)}</h2>
    <p class="small"><a href="${esc(p.canonical_url)}" target="_blank" rel="noopener noreferrer">Buka sumber listing ↗</a> · dicatat ${esc(p.created_at.slice(0, 10))}</p>
    <section class="card"><h3>Data produk</h3><p class="muted small">Kosongkan nilai yang tidak diketahui — jangan isi 0 kecuali memang nol. Angka adalah nilai yang terlihat saat dicatat dan dapat berubah.</p>
      <form id="edit-product"><div class="grid">
        <div class="field"><label for="ep-title">Nama produk *</label><input id="ep-title" name="title" required maxlength="200" value="${esc(p.title)}"></div>
        <div class="field"><label for="ep-url">URL produk *</label><input id="ep-url" name="canonical_url" type="url" required value="${esc(p.canonical_url)}"></div>
        <div class="field"><label for="ep-cat">Kategori</label><input id="ep-cat" name="category" value="${esc(p.category || '')}"></div>
        <div class="field"><label for="ep-status">Status</label><select id="ep-status" name="lifecycle_status">${['candidate', 'shortlisted', 'selected', 'rejected', 'archived'].map((s) => opt(s, p.lifecycle_status, label(s))).join('')}</select></div>
        ${[['price_amount', 'Harga (IDR)', '1'], ['commission_rate_percent', 'Komisi (%)', '.01'], ['commission_amount', 'Komisi (IDR)', '1'], ['product_rating', 'Rating produk (0–5)', '.1'], ['review_count', 'Jumlah ulasan', '1'], ['sold_count', 'Terjual (terlihat)', '1'], ['seller_rating', 'Rating toko (0–5)', '.1']].map(([k, l, step]) => `<div class="field"><label for="ep-${k}">${l}</label><input id="ep-${k}" name="${k}" type="number" min="0" step="${step}" value="${p[k] ?? ''}" placeholder="Belum diketahui"></div>`).join('')}
        <div class="field"><label for="ep-seller">Nama toko</label><input id="ep-seller" name="seller_name" value="${esc(p.seller_name || '')}"></div>
        <div class="field"><label for="ep-evs">Status bukti</label><select id="ep-evs" name="evidence_state">${['unverified', 'verified', 'conflicting'].map((s) => opt(s, p.evidence_state, label(s))).join('')}</select></div>
      </div><div class="field"><label for="ep-notes">Catatan / angle</label><textarea id="ep-notes" name="notes">${esc(p.notes || '')}</textarea></div>
      <button class="btn">Simpan perubahan</button></form></section>

    <section class="card"><h3>Bukti (evidence)</h3>
      ${p.evidence.length ? p.evidence.map((e) => `<div class="item"><div class="spread"><div><span class="pill ${e.relationship === 'supports' ? 'good' : e.relationship === 'challenges' ? 'bad' : ''}">${esc({ supports: 'Mendukung', challenges: 'Menantang', context: 'Konteks' }[e.relationship])}</span> <strong>${esc(e.title)}</strong></div><button class="btn btn-danger btn-sm" data-unlink="${esc(e.id)}">Lepas tautan</button></div>
        <div class="small muted">${e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">${esc(e.source_url)}</a>` : esc(e.source_reference || '')} · metode ${esc(e.collection_method)} · diamati ${esc((e.observed_at || '—').slice(0, 10))}</div>
        ${e.excerpt ? `<div class="small">Kutipan: "${esc(e.excerpt)}"</div>` : ''}${e.interpretation ? `<div class="small">Interpretasi: ${esc(e.interpretation)}</div>` : ''}${e.limitations ? `<div class="small muted">Keterbatasan: ${esc(e.limitations)}</div>` : ''}</div>`).join('') : '<p class="muted">Belum ada bukti tertaut.</p>'}
      <form id="link-evidence" class="row" style="margin-top:10px"><div class="field" style="flex:2"><label for="le-ev">Bukti dari workspace</label><select id="le-ev" name="evidence_item_id" required><option value="">— pilih —</option>${wsEvidence.filter((e) => !linkedIds.has(e.id)).map((e) => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label for="le-rel">Relasi</label><select id="le-rel" name="relationship"><option value="supports">Mendukung</option><option value="challenges">Menantang</option><option value="context">Konteks</option></select></div>
        <button class="btn" style="align-self:flex-end;margin-bottom:8px">Tautkan</button></form>
      <p class="small muted">Belum ada bukti? Tambahkan di <a href="/#/research">Riset</a> (sumber, waktu, metode, kutipan, keterbatasan), lalu tautkan di sini.</p></section>

    <section class="card"><h3>Scorecard (rubrik ${esc(state.rubric?.version || 'v1')})</h3>
      ${latest ? `<p>Terbaru: ${latest.weighted_total == null ? `<span class="pill warn">Total tidak dihitung — dimensi belum lengkap: ${esc(latest.missing_dimensions.map((k) => SCORE_LABELS[k].split(' (')[0]).join(', '))}</span>` : `<strong style="font-size:22px">${esc(latest.weighted_total)}</strong>/100`} <span class="small muted">· ${esc(latest.created_at.slice(0, 16).replace('T', ' '))}</span></p>` : '<p class="muted">Belum diskor.</p>'}
      <p class="small muted">${esc(state.rubric?.note || '')} Setiap skor 1–5 wajib disertai alasan. Total hanya dihitung jika keenam dimensi terisi.</p>
      <form id="score-form"><div class="score-grid">${Object.entries(SCORE_LABELS).map(([k, l]) => `<fieldset><legend>${esc(l)}</legend><div class="field"><label for="sc-${k}">Skor 1–5</label><select id="sc-${k}" name="${k}"><option value="">— kosong —</option>${[1, 2, 3, 4, 5].map((n) => `<option ${latest?.scores[k] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label for="sr-${k}">Alasan</label><textarea id="sr-${k}" name="r_${k}" maxlength="500" rows="2">${esc(latest?.rationale?.[k] || '')}</textarea></div></fieldset>`).join('')}</div>
      <button class="btn" style="margin-top:10px">Simpan sebagai versi scorecard baru</button></form>
      ${p.scorecards.length > 1 ? `<details style="margin-top:10px"><summary>Riwayat (${p.scorecards.length})</summary><table><thead><tr><th>Waktu</th><th>Total</th>${Object.keys(SCORE_LABELS).map((k) => `<th>${esc(SCORE_LABELS[k].split(' (')[0])}</th>`).join('')}</tr></thead><tbody>${p.scorecards.map((s) => `<tr><td>${esc(s.created_at.slice(0, 16).replace('T', ' '))}</td><td>${s.weighted_total ?? '—'}</td>${Object.keys(SCORE_LABELS).map((k) => `<td title="${esc(s.rationale?.[k] || '')}">${s.scores[k] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></details>` : ''}
    </section>

    <section class="card"><h3>Pipeline konten faceless</h3>
      <p class="small muted">Membuat draf brief → hook → naskah → storyboard → rencana aset → caption/CTA/pengungkapan → peta klaim → checklist hak, sebagai versi konten immutable di Content Studio. Template deterministik (tanpa AI, tanpa biaya). Wajib ditinjau & disetujui per versi persis.</p>
      <form id="package-form"><div class="grid">
        <div class="field"><label for="pk-opp">Peluang (masalah audiens) *</label><select id="pk-opp" name="opportunity_id" required><option value="">— pilih —</option>${opportunities.filter((o) => o.status !== 'rejected').map((o) => `<option value="${esc(o.id)}">${esc(o.title)}${o.is_hypothesis ? ' (hipotesis)' : ''}</option>`).join('')}</select></div>
        <div class="field"><label for="pk-dur">Durasi</label><select id="pk-dur" name="duration_seconds"><option value="15">15 detik</option><option value="30" selected>30 detik</option><option value="60">60 detik</option></select></div>
        <div class="field"><label for="pk-ch">Kanal tujuan</label><select id="pk-ch" name="channel_id"><option value="">— opsional —</option>${channels.map((c) => `<option value="${esc(c.id)}">${esc(PLATFORM_ID[c.platform] || c.platform)} · ${esc(c.channel_name)}</option>`).join('')}</select></div>
      </div><div class="field"><label for="pk-angle">Hook/angle khusus (opsional)</label><input id="pk-angle" name="angle" maxlength="200"></div>
      <button class="btn">Buat draf paket konten</button> ${opportunities.length ? '' : '<span class="small muted">Buat peluang dulu di <a href="/#/opportunities">Peluang</a>.</span>'}</form>
      ${p.content_packages.length ? `<table style="margin-top:12px"><thead><tr><th>Paket</th><th>Durasi</th><th>Status konten</th><th></th></tr></thead><tbody>${p.content_packages.map((k) => `<tr><td>${esc(k.asset_title)}</td><td>${esc(k.duration_seconds)} dtk</td><td><span class="pill">${esc(k.asset_status)}</span></td><td><a href="/#/content/${esc(k.asset_id)}">Tinjau & setujui di Content Studio →</a></td></tr>`).join('')}</tbody></table>` : ''}
    </section>

    <section class="card"><h3>Publikasi manual & eksperimen</h3>
      <p class="small muted">Buat link afiliasi secara manual di antarmuka resmi program afiliasi. Publikasi dilakukan manual; aplikasi tidak login, mengklik, atau memposting atas nama Anda. Link tracking disimpan privat dan tidak ditampilkan/diekspor.</p>
      ${p.experiments.length ? `<table><thead><tr><th>Hipotesis</th><th>Kanal</th><th>Status</th><th>Publikasi</th><th>Link afiliasi</th><th></th></tr></thead><tbody>${p.experiments.map((x) => `<tr><td>${esc(x.hypothesis)}</td><td>${esc(x.channel_name)}</td><td><span class="pill">${esc(x.status)}</span></td><td>${x.published_url ? `<a href="${esc(x.published_url)}" target="_blank" rel="noopener noreferrer">Lihat</a> · ${esc((x.published_at || '').slice(0, 10))}` : '—'}</td><td>${x.has_affiliate_url ? 'Tersimpan' : '—'}</td><td><a href="/#/experiments/${esc(x.experiment_id)}">Catat observasi →</a> <button class="btn btn-danger btn-sm" data-unlink-exp="${esc(x.experiment_id)}" data-ch="${esc(x.channel_id)}">Lepas</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada eksperimen tertaut.</p>'}
      <form id="exp-form" style="margin-top:10px"><div class="grid">
        <div class="field"><label for="ex-exp">Eksperimen (dari versi yang disetujui) *</label><select id="ex-exp" name="experiment_id" required><option value="">— pilih —</option>${experiments.map((x) => `<option value="${esc(x.id)}">${esc(x.asset_title)} v${esc(x.version_number)} · ${esc(x.channel)}</option>`).join('')}</select></div>
        <div class="field"><label for="ex-ch">Kanal *</label><select id="ex-ch" name="channel_id" required><option value="">— pilih —</option>${channels.map((c) => `<option value="${esc(c.id)}">${esc(c.channel_name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ex-url">Link afiliasi (opsional, privat)</label><input id="ex-url" name="affiliate_url" type="url" autocomplete="off"></div>
      </div><button class="btn">Tautkan eksperimen</button> <span class="small muted">Buat eksperimen di <a href="/#/experiments">Eksperimen</a> setelah versi konten disetujui.</span></form>
    </section>`

    $('#back-products').onclick = () => setTab('products')
    const pid = encodeURIComponent(p.id)
    $('#edit-product').onsubmit = (e) => { e.preventDefault(); withBusy(e.submitter, async () => { await api('PATCH', '/affiliate/products/' + pid, productPayload(e.target, true)); show('Produk diperbarui.'); await loadDetail() }) }
    $('#link-evidence').onsubmit = (e) => { e.preventDefault(); withBusy(e.submitter, async () => { await api('POST', '/affiliate/products/' + pid + '/evidence', formValues(e.target)); show('Bukti ditautkan. Tinjau lalu ubah status bukti bila sesuai.'); await loadDetail() }) }
    $$('[data-unlink]', el).forEach((b) => { b.onclick = () => { if (!confirm('Lepas tautan bukti ini dari produk? Bukti tetap ada di Riset.')) return; withBusy(b, async () => { await api('DELETE', '/affiliate/products/' + pid + '/evidence/' + encodeURIComponent(b.dataset.unlink)); show('Tautan bukti dilepas.'); await loadDetail() }) } })
    $('#score-form').onsubmit = (e) => {
      e.preventDefault(); const v = formValues(e.target), body = { rationale: {} }
      for (const k of Object.keys(SCORE_LABELS)) { if (v[k]) body[k] = Number(v[k]); body.rationale[k] = v['r_' + k] }
      withBusy(e.submitter, async () => { const r = await api('POST', '/affiliate/products/' + pid + '/scorecards', body); show(r.scorecard.weighted_total == null ? 'Scorecard disimpan. Total belum dihitung karena dimensi belum lengkap.' : 'Scorecard disimpan: ' + r.scorecard.weighted_total + '/100.'); await loadDetail() })
    }
    $('#package-form').onsubmit = (e) => { e.preventDefault(); const v = dropEmpty(formValues(e.target)); v.duration_seconds = Number(v.duration_seconds); withBusy(e.submitter, async () => { await api('POST', '/affiliate/products/' + pid + '/content-packages', v); show('Draf paket konten dibuat di Content Studio. Tinjau sebelum disetujui.'); await loadDetail() }) }
    $('#exp-form').onsubmit = (e) => { e.preventDefault(); withBusy(e.submitter, async () => { await api('POST', '/affiliate/products/' + pid + '/experiments', dropEmpty(formValues(e.target))); show('Eksperimen ditautkan.'); await loadDetail() }) }
    $$('[data-unlink-exp]', el).forEach((b) => { b.onclick = () => { if (!confirm('Lepas tautan eksperimen dari produk ini?')) return; withBusy(b, async () => { await api('DELETE', '/affiliate/products/' + pid + '/experiments/' + encodeURIComponent(b.dataset.unlinkExp) + '/' + encodeURIComponent(b.dataset.ch)); show('Tautan eksperimen dilepas.'); await loadDetail() }) } })
  } catch (e) { el.innerHTML = `<p class="msg bad">${esc(e.message)}</p><button class="btn btn-ghost" id="back-products">← Daftar produk</button>`; $('#back-products').onclick = () => setTab('products') }
}

// ---------- Channels ----------
async function loadChannels() {
  const el = $('#channels'); el.innerHTML = '<p class="loading">Memuat kanal…</p>'
  try {
    const { channels } = await api('GET', W() + '/channels' + ($('#channel-archived').checked ? '?status=archived' : ''))
    el.innerHTML = channels.length ? `<table><thead><tr><th>Kanal</th><th>Platform</th><th>Handle</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${channels.map((x) => `<tr><td>${esc(x.channel_name)}${x.external_url ? `<div class="small"><a href="${esc(x.external_url)}" target="_blank" rel="noopener noreferrer">Profil ↗</a></div>` : ''}</td><td>${esc(PLATFORM_ID[x.platform] || x.platform)}</td><td>${x.handle ? '@' + esc(x.handle) : '—'}</td><td><label class="hide" for="cs-${esc(x.id)}">Status</label><select id="cs-${esc(x.id)}" data-channel-status="${esc(x.id)}">${['planned', 'active', 'paused', 'archived'].map((s) => `<option value="${s}" ${s === x.status ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></td><td><button class="btn btn-ghost btn-sm" data-rename="${esc(x.id)}" data-name="${esc(x.channel_name)}">Ubah nama</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada kanal.</p>'
    $$('[data-channel-status]', el).forEach((s) => { s.onchange = () => withBusy(s, async () => { await api('PATCH', '/affiliate/channels/' + encodeURIComponent(s.dataset.channelStatus), { status: s.value }); show('Status kanal diperbarui.'); await loadChannels() }) })
    $$('[data-rename]', el).forEach((b) => { b.onclick = () => { const n = prompt('Nama kanal baru', b.dataset.name); if (!n) return; withBusy(b, async () => { await api('PATCH', '/affiliate/channels/' + encodeURIComponent(b.dataset.rename), { channel_name: n }); show('Kanal diperbarui.'); await loadChannels() }) } })
  } catch (e) { el.innerHTML = `<p class="msg bad">${esc(e.message)}</p>` }
}

// ---------- Multi-Provider Hub ----------
const STATE_ID = {
  unconfigured: ['Belum dikonfigurasi', 'warn'],
  configured_unverified: ['Secret terpasang · belum divalidasi', ''],
  endpoint_unverified: ['Endpoint belum diverifikasi', 'warn'],
  disabled: ['Dinonaktifkan', 'bad'],
}
const PROVIDER_NAMES = { groq: 'Groq', tavily: 'Tavily', apify: 'Apify', scrapely: 'Scrape.ly' }
async function loadProviderUsage() {
  const el = $('#provider-usage')
  try {
    const d = await api('GET', '/affiliate/providers/usage')
    el.innerHTML = '<strong>Aktivitas 30 hari (berdasarkan audit log)</strong><div class="grid">' +
      Object.entries(d.usage).map(([id, v]) => '<div class="item"><strong>' + esc(PROVIDER_NAMES[id] || id) + '</strong><div>' + esc(v.calls_30d) + ' panggilan</div><div class="muted small">' + (v.last_called_at ? 'Terakhir: ' + esc(v.last_called_at) : 'Belum ada panggilan') + '</div></div>').join('') +
      '</div><p class="small muted">' + esc(d.note) + '</p>'
  } catch (e) { el.textContent = 'Ringkasan penggunaan belum tersedia: ' + e.message }
}
async function loadProviders() {
  const el = $('#providers'); el.innerHTML = '<p class="loading">Memuat status…</p>'
  try {
    const d = await api('GET', '/affiliate/providers')
    el.innerHTML = '<p class="small muted">' + esc(d.note) + '</p><div class="grid">' + d.providers.map((p) => {
      const meta = STATE_ID[p.state] || ['Status tidak dikenal', 'warn']
      return '<div class="item"><div class="spread"><strong>' + esc(PROVIDER_NAMES[p.id] || p.id) + '</strong><span class="pill ' + meta[1] + '">' + esc(meta[0]) + '</span></div>' +
        '<div class="small">' + esc(p.purpose) + '</div><div class="small muted">Catatan biaya: ' + esc(p.billing_note) + '</div>' +
        (p.allowed_actors ? '<div class="small muted">Allowlist: ' + (p.allowed_actors.length ? esc(p.allowed_actors.join(', ')) : 'kosong — Actor tidak dapat dijalankan') + '</div>' : '') +
        (p.id === 'scrapely' ? '<div class="small muted">Endpoint: ' + (p.endpoint_ready ? 'dikonfigurasi, belum tervalidasi' : 'belum dikonfigurasi') + '</div>' : '') +
        '</div>'
    }).join('') + '</div>'
    const byId = Object.fromEntries(d.providers.map((p) => [p.id, p]))
    const can = (id) => !!byId[id] && byId[id].enabled && byId[id].state === 'configured_unverified'
    $('#groq-form button').disabled = !can('groq')
    $('#tavily-form button').disabled = !can('tavily')
    $('#apify-form button').disabled = !can('apify') || !(byId.apify.allowed_actors || []).length
    $('#scrapely-form button').disabled = !can('scrapely') || !(byId.scrapely.allowed_actors || []).length
    if (byId.scrapely.state === 'endpoint_unverified') $('#scrapely-result').textContent = 'Scrape.ly menggunakan API resmi v2. Siapkan SCRAPELY_TOKEN dan Actor allowlist.'
    else if (!can('scrapely')) $('#scrapely-result').textContent = 'Scrape.ly belum siap. Periksa secret, kill switch, endpoint, dan allowlist.'
  } catch (e) { el.innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>' }
  await loadProviderUsage()
}
function parseActorInput(form) {
  const raw = form.elements.input_json.value.trim()
  if (!raw) return {}
  const value = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Input Actor harus berupa JSON object.')
  return value
}
$('#refresh-providers').onclick = () => withBusy($('#refresh-providers'), loadProviders)
$('#groq-form').onsubmit = (e) => {
  e.preventDefault()
  const out = $('#groq-result'); out.textContent = 'Mengirim prompt ke Groq…'
  withBusy(e.submitter, async () => {
    try {
      const d = await api('POST', '/affiliate/providers/groq/generate', formValues(e.target))
      out.textContent = '[' + d.label + ']\nModel: ' + d.model + '\nToken: ' + (d.usage?.total_tokens ?? 'tidak tersedia') + '\n\n' + (d.text || 'Tidak ada teks.')
      await loadProviderUsage()
    } catch (err) { out.textContent = err.message }
  })
}
$('#tavily-form').onsubmit = (e) => {
  e.preventDefault()
  const out = $('#tavily-result'); out.textContent = 'Mencari sumber publik…'
  withBusy(e.submitter, async () => {
    try {
      const d = await api('POST', '/affiliate/providers/tavily/search', formValues(e.target))
      out.innerHTML = '<p class="small muted">' + esc(d.note) + '</p>' + (d.results.length ? d.results.map((x) =>
        '<div class="item"><a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer"><strong>' + esc(x.title) + '</strong></a><p class="small">' + esc(x.excerpt) + '</p><div class="small muted">Diambil ' + esc(x.captured_at.slice(0, 10)) + (x.published_date ? ' · terbit ' + esc(x.published_date) : '') + ' · petunjuk belum ditinjau</div></div>'
      ).join('') : '<p>Tidak ada hasil.</p>')
      await loadProviderUsage()
    } catch (err) { out.textContent = err.message }
  })
}
for (const id of ['apify', 'scrapely']) {
  const form = $('#' + id + '-form'), out = $('#' + id + '-result')
  form.onsubmit = (e) => {
    e.preventDefault()
    const checkbox = $('#' + (id === 'apify' ? 'a-confirm' : 's-confirm'))
    if (!checkbox.checked) { show('Persetujuan eksekusi wajib dicentang.', true); return }
    let actorInput
    try { actorInput = parseActorInput(form) } catch (err) { show(err.message, true); return }
    const providerName = PROVIDER_NAMES[id]
    if (!confirm('Konfirmasi satu eksekusi ' + providerName + '? Eksekusi dapat memakai saldo/kredit provider dan tidak ada batas belanja otomatis.')) return
    out.textContent = 'Mengirim satu eksekusi…'
    withBusy(e.submitter, async () => {
      try {
        const d = await api('POST', '/affiliate/providers/' + id + '/run', {
          actor_id: form.elements.actor_id.value.trim(),
          input: actorInput,
          max_total_charge_usd: Number(form.elements.max_total_charge_usd.value),
          max_items: Number(form.elements.max_items.value),
          timeout_seconds: Number(form.elements.timeout_seconds.value),
          confirm_run: true,
        })
        out.textContent = JSON.stringify(d, null, 2) + '\n\nStatus: baru dikirim. Hasil dataset belum diimpor ke workspace.'
        checkbox.checked = false
        await loadProviders()
      } catch (err) { out.textContent = err.message }
    })
  }
}
// ---------- Boot ----------
async function boot() {
  try {
    const me = await api('GET', '/auth/me')
    if (!me.user) { $('#login').classList.remove('hide'); $('#who').textContent = 'Belum masuk'; return }
    $('#who').textContent = me.user.email
    const [{ workspaces }, rub] = await Promise.all([api('GET', '/workspaces'), api('GET', '/affiliate/rubric')])
    state.rubric = rub.rubric
    if (!workspaces.length) { show('Buat workspace terlebih dahulu di halaman Core Engine.', true); return }
    $('#app').classList.remove('hide')
    const saved = localStorage.getItem('olt_ws')
    state.ws = workspaces.some((w) => w.id === saved) ? saved : workspaces[0].id
    $('#workspace').innerHTML = workspaces.map((w) => `<option value="${esc(w.id)}" ${w.id === state.ws ? 'selected' : ''}>${esc(w.name)}</option>`).join('')
    $('#workspace').onchange = () => { state.ws = $('#workspace').value; localStorage.setItem('olt_ws', state.ws); state.productId = null; setTab(state.tab === 'detail' ? 'products' : state.tab) }
    setTab('overview')
  } catch (e) { show(e.message, true) }
}
$$('.tabs button').forEach((b) => { b.onclick = () => setTab(b.dataset.tab) })
$('#filter-form').onsubmit = (e) => { e.preventDefault(); loadProducts() }
$('#filter-status').onchange = () => loadProducts()
$('#channel-archived').onchange = () => loadChannels()
$('#product-form').onsubmit = (e) => { e.preventDefault(); withBusy(e.submitter, async () => { const r = await api('POST', W() + '/products', productPayload(e.target, false)); e.target.reset(); show('Produk tersimpan. Nilai yang tidak diisi tetap "belum diketahui".'); state.productId = r.product.id; setTab('detail') }) }
$('#channel-form').onsubmit = (e) => { e.preventDefault(); withBusy(e.submitter, async () => { await api('POST', W() + '/channels', dropEmpty(formValues(e.target))); e.target.reset(); show('Kanal tersimpan.'); await loadChannels() }) }
$('#groq-form').onsubmit = (e) => { e.preventDefault(); const out = $('#groq-result'); out.textContent = 'Membuat draf…'; withBusy(e.submitter, async () => { try { const d = await api('POST', '/affiliate/providers/groq/generate', formValues(e.target)); out.textContent = '[' + d.label + ']\n\n' + (d.text || 'Tidak ada teks.') } catch (err) { out.textContent = err.message } }) }
$('#tavily-form').onsubmit = (e) => { e.preventDefault(); const out = $('#tavily-result'); out.textContent = 'Mencari…'; withBusy(e.submitter, async () => { try { const d = await api('POST', '/affiliate/providers/tavily/search', formValues(e.target)); out.innerHTML = `<p class="small muted">${esc(d.note)}</p>` + (d.results.length ? d.results.map((x) => `<div class="item"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(x.title)}</strong></a><p class="small">${esc(x.excerpt)}</p><div class="small muted">Diambil ${esc(x.captured_at.slice(0, 10))}${x.published_date ? ' · terbit ' + esc(x.published_date) : ''} · status: petunjuk belum ditinjau</div></div>`).join('') : '<p>Tidak ada hasil.</p>') } catch (err) { out.textContent = err.message } }) }
boot()
