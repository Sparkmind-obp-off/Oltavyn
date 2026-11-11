// Deterministic faceless short-form package generator (affiliate_template_v1).
// No external model call, no side effects, no invented facts. Output shape matches the
// Content Studio contract { title, body, claims[] } so it flows into the existing
// immutable-version → exact-hash approval → experiment loop.

type Claim = { text: string; evidence_ids: string[]; status: 'supported' | 'unsupported' | 'needs_verification' }
type Scene = { t: string; framing: string; visual: string; onscreen: string; vo: string; sound: string; transition: string }

const AI_LABEL = '[ILUSTRASI AI — bukan footage produk asli]'
const OFFICIAL_LABEL = '[Aset resmi produk — wajib konfirmasi hak pakai]'
const cell = (s: string) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ')
const idr = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID')

export const DURATIONS = [15, 30, 60] as const

function scenesFor(duration: number, product: any, problem: string, hook: string): Scene[] {
  const name = String(product.title).slice(0, 60)
  const hookScene: Scene = { t: '', framing: 'Close-up', visual: `${AI_LABEL} Situasi masalah sehari-hari`, onscreen: hook.slice(0, 60), vo: hook, sound: 'Musik berlisensi, intro cepat', transition: 'Cut' }
  const problemScene: Scene = { t: '', framing: 'Medium', visual: `${AI_LABEL} Ilustrasi masalah audiens`, onscreen: problem.slice(0, 60), vo: `Masalahnya: ${problem}`, sound: 'Musik lanjut', transition: 'Whip pan' }
  const productScene: Scene = { t: '', framing: 'Product shot', visual: `${OFFICIAL_LABEL} Foto/video resmi ${name}`, onscreen: name, vo: `Salah satu opsi yang bisa dicek: ${name}.`, sound: 'Musik lanjut', transition: 'Zoom in' }
  const featureScene: Scene = { t: '', framing: 'Detail / macro', visual: `${OFFICIAL_LABEL} Detail fitur sesuai listing`, onscreen: 'Fitur sesuai deskripsi listing', vo: 'Cek detail fitur di listing — sebutkan hanya yang tertulis di sumber.', sound: 'Musik lanjut', transition: 'Cut' }
  const howScene: Scene = { t: '', framing: 'Top-down', visual: `${AI_LABEL} Ilustrasi cara pakai (bukan uji langsung)`, onscreen: 'Ilustrasi', vo: 'Gambaran penggunaan ini ilustrasi, bukan hasil uji kami.', sound: 'SFX ringan', transition: 'Slide' }
  const caveatScene: Scene = { t: '', framing: 'Typography', visual: 'Kartu teks', onscreen: 'Cek ulasan & spesifikasi sebelum beli', vo: 'Selalu cek ulasan dan spesifikasi terbaru sebelum membeli.', sound: 'Musik turun', transition: 'Fade' }
  const ctaScene: Scene = { t: '', framing: 'Typography + produk', visual: `${OFFICIAL_LABEL} Thumbnail produk`, onscreen: 'Link di keranjang/bio · #affiliate', vo: 'Link ada di keranjang atau bio. Saya bisa dapat komisi dari pembelian lewat link ini.', sound: 'Musik outro', transition: 'End card' }
  const plan: Record<number, Scene[]> = {
    15: [hookScene, problemScene, productScene, ctaScene],
    30: [hookScene, problemScene, productScene, featureScene, caveatScene, ctaScene],
    60: [hookScene, problemScene, productScene, featureScene, howScene, featureScene, caveatScene, ctaScene],
  }
  const scenes = plan[duration].map((s) => ({ ...s }))
  const slice = duration / scenes.length
  scenes.forEach((s, i) => { s.t = `${Math.round(i * slice)}–${Math.round((i + 1) * slice)}s` })
  return scenes
}

export function generateAffiliatePackage(input: { ws: any; opp: any; product: any; productEvidence: any[]; channel: any | null; duration: number; angle?: string }) {
  const { ws, opp, product, productEvidence, channel, duration } = input
  const supports = productEvidence.filter((e) => e.relationship === 'supports')
  const oppSupports = (opp.evidence || []).filter((e: any) => e.relationship === 'supports')
  const supportIds = supports.map((e) => e.id)
  const claims: Claim[] = []
  const L: string[] = []
  const hook = (input.angle || `Punya masalah "${String(opp.audience_problem).slice(0, 70)}"?`).slice(0, 200)

  L.push(`# Paket konten faceless ${duration} detik: ${product.title}`)
  L.push('')
  L.push('> DRAF — dibuat oleh affiliate_template_v1 (bukan model AI). Wajib ditinjau, disunting, dan disetujui per versi persis sebelum dipublikasikan secara manual.')
  L.push('')
  L.push('## 1. Produk & audiens')
  L.push(`- Produk: **${product.title}** (${product.marketplace}) — ${product.canonical_url}`)
  L.push(`- Audiens: ${ws.audience || '_(belum diisi di workspace)_'}`)
  L.push(`- Kanal tujuan: ${channel ? `${channel.platform} · ${channel.channel_name}${channel.handle ? ' (@' + channel.handle + ')' : ''}` : '_(belum dipilih)_'}`)
  L.push('')
  L.push('## 2. Masalah audiens & peluang')
  L.push(`${opp.audience_problem}${opp.is_hypothesis ? ' _(HIPOTESIS — belum ada bukti pendukung)_' : ''}`)
  oppSupports.forEach((e: any) => L.push(`- Bukti: ${e.title} — ${e.source_url || e.source_reference || ''}`))
  L.push('')
  L.push('## 3. Creative brief')
  L.push(`- Tujuan: bantu audiens menilai apakah produk ini relevan untuk masalah di atas — bukan klaim "terbaik".`)
  L.push(`- Format: video pendek vertikal 9:16, ${duration} detik, faceless (tanpa wajah kreator).`)
  L.push('- Nada: jujur, informatif, tanpa klaim pengalaman langsung, testimoni, unboxing, atau uji perbandingan yang tidak pernah dilakukan.')
  L.push('')
  L.push('## 4. Sudut & hook (pilih satu, sunting)')
  L.push(`- A (masalah): ${hook}`)
  L.push(`- B (pertanyaan): "Lagi cari solusi ${String(product.category || 'praktis').slice(0, 40)}? Cek ini dulu."`)
  L.push('- C (checklist): "3 hal yang perlu dicek sebelum beli."')
  L.push('')
  L.push('## 5–6. Naskah & storyboard')
  L.push('| # | Waktu | Framing | Visual | Teks layar | Voiceover | Suara | Transisi |')
  L.push('|---|---|---|---|---|---|---|---|')
  scenesFor(duration, product, String(opp.audience_problem), hook).forEach((s, i) =>
    L.push(`| ${i + 1} | ${s.t} | ${cell(s.framing)} | ${cell(s.visual)} | ${cell(s.onscreen)} | ${cell(s.vo)} | ${cell(s.sound)} | ${s.transition} |`))
  L.push('')
  L.push('## 7. Rencana aset faceless')
  L.push(`- Visual AI orisinal: wajib diberi label ${AI_LABEL}; jangan menyiratkan itu footage produk asli.`)
  L.push(`- Aset produk: hanya foto/video resmi yang diizinkan untuk afiliasi ${OFFICIAL_LABEL}.`)
  L.push('- Tipografi: font dengan lisensi komersial.')
  L.push('- B-roll: stok berlisensi komersial atau milik sendiri.')
  L.push('- Voiceover: TTS/rekaman dengan hak pakai komersial.')
  L.push('- Musik: library berlisensi untuk platform tujuan.')
  L.push('')
  L.push('## 8. Caption, CTA & pengungkapan')
  L.push(`- Caption: ${String(opp.audience_problem).slice(0, 100)} — cek detail ${product.title.slice(0, 60)} sebelum beli. #affiliate`)
  L.push('- CTA: "Link ada di keranjang/bio." (tanpa urgensi palsu atau jaminan hasil)')
  L.push('- Pengungkapan afiliasi (WAJIB, terlihat & terdengar): "Saya bisa mendapat komisi dari pembelian melalui link ini."')
  L.push('')
  L.push('## 9. Peta klaim → bukti')
  const facts: [string, unknown, (v: any) => string][] = [
    ['Harga', product.price_amount, (v) => idr(v)],
    ['Rating produk', product.product_rating, (v) => `${v}/5`],
    ['Jumlah terjual', product.sold_count, (v) => `${Number(v).toLocaleString('id-ID')} terjual`],
    ['Jumlah ulasan', product.review_count, (v) => `${Number(v).toLocaleString('id-ID')} ulasan`],
  ]
  for (const [label, v, fmt] of facts) {
    if (v === null || v === undefined) { L.push(`- ${label}: _tidak diketahui — jangan disebut di konten_`); continue }
    const status: Claim['status'] = supportIds.length ? 'needs_verification' : 'unsupported'
    L.push(`- ${label}: ${fmt(v)} — ${supportIds.length ? 'perlu verifikasi ulang terhadap bukti tertaut' : 'TIDAK DIDUKUNG bukti; hapus atau tautkan bukti'}`)
    claims.push({ text: `${label} ${product.title}: ${fmt(v)} (nilai saat dicatat; dapat berubah)`, evidence_ids: supportIds, status })
  }
  supports.forEach((e) => claims.push({ text: `Sesuai sumber "${e.title}": ${String(e.excerpt || e.title).slice(0, 200)}`, evidence_ids: [e.id], status: 'needs_verification' }))
  claims.push({ text: `${product.title} relevan untuk masalah "${String(opp.audience_problem).slice(0, 80)}".`, evidence_ids: oppSupports.map((e: any) => e.id), status: oppSupports.length ? 'needs_verification' : 'unsupported' })
  L.push('')
  L.push('## 10. Checklist hak & kepatuhan')
  L.push('- [ ] Hak pakai komersial dikonfirmasi untuk visual, audio, font, dan footage')
  L.push('- [ ] Adegan AI diberi label ilustrasi')
  L.push('- [ ] Tidak ada testimoni, pengalaman langsung, unboxing, atau hasil uji palsu')
  L.push('- [ ] Pengungkapan afiliasi tampil di video dan caption')
  L.push('- [ ] Setiap angka (harga/rating/terjual) dicek ulang di listing pada hari publikasi')
  L.push('- [ ] Sesuai kebijakan platform & marketplace tujuan')
  L.push('')
  L.push('## 11–12. Persetujuan & paket publikasi')
  L.push('- Setujui versi PERSIS ini (hash + destinasi) di Content Studio.')
  L.push('- Buat link afiliasi secara manual melalui antarmuka resmi program afiliasi; jangan otomatisasi login/klik.')
  L.push('- Publikasikan manual, lalu catat URL publikasi & waktu di Eksperimen.')

  return { title: `Video ${duration}s — ${product.title}`.slice(0, 200), body: L.join('\n'), claims }
}
