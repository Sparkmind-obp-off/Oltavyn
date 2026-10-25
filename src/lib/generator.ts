// Deterministic brief generator (template_v1). No external model call, no side effects.
// Model provider adapter is deferred (ADR-007). Output follows the model output contract shape
// so a model adapter can replace it later: { title, body, claims[] }.

type Claim = { text: string; evidence_ids: string[]; status: 'supported' | 'unsupported' | 'needs_verification' }

const FORMAT_LABEL: Record<string, string> = {
  brief: 'Brief konten',
  short_video_script: 'Naskah video pendek',
  caption: 'Caption',
  article: 'Artikel',
  thread: 'Thread',
  other: 'Konten',
}

export function generateBriefTemplate(ws: any, opp: any, format: string) {
  const supports = (opp.evidence || []).filter((e: any) => e.relationship === 'supports')
  const challenges = (opp.evidence || []).filter((e: any) => e.relationship === 'challenges')
  const claims: Claim[] = []
  const lines: string[] = []

  lines.push(`# ${FORMAT_LABEL[format] ?? 'Konten'}: ${opp.title}`)
  lines.push('')
  lines.push('> DRAF — dibuat oleh template_v1 (bukan model AI). Wajib ditinjau dan disunting sebelum disetujui.')
  lines.push('')
  lines.push('## Audiens')
  lines.push(ws.audience || '_(belum diisi di pengaturan workspace)_')
  lines.push('')
  lines.push('## Masalah / kebutuhan audiens')
  lines.push(opp.audience_problem)
  lines.push('')
  if (ws.goal) { lines.push('## Tujuan'); lines.push(ws.goal); lines.push('') }

  lines.push('## Bukti pendukung')
  if (!supports.length) {
    lines.push('_Tidak ada bukti pendukung — peluang ini berstatus HIPOTESIS. Jangan menyatakan klaim faktual tanpa verifikasi._')
  }
  supports.forEach((e: any, i: number) => {
    const src = e.source_url || e.source_reference || 'sumber tidak dicantumkan'
    lines.push(`${i + 1}. **${e.title}** — ${src}${e.observed_at ? ` (diamati ${e.observed_at.slice(0, 10)})` : ''}`)
    if (e.excerpt) lines.push(`   Kutipan/ringkasan: "${String(e.excerpt).slice(0, 300)}"`)
    if (e.limitations) lines.push(`   Keterbatasan: ${e.limitations}`)
    claims.push({ text: `Sesuai sumber "${e.title}": ${String(e.excerpt || e.title).slice(0, 200)}`, evidence_ids: [e.id], status: 'needs_verification' })
  })
  lines.push('')

  if (challenges.length) {
    lines.push('## Bukti yang menantang (pertimbangkan)')
    challenges.forEach((e: any) => lines.push(`- **${e.title}** — ${e.source_url || e.source_reference || ''}`))
    lines.push('')
  }
  if (opp.unknowns) { lines.push('## Hal yang belum diketahui'); lines.push(opp.unknowns); lines.push('') }

  lines.push('## Sudut konten (usulan untuk disunting)')
  lines.push(`- Hook: angkat langsung masalah "${opp.audience_problem.slice(0, 120)}".`)
  lines.push('- Isi: jelaskan apa yang ditunjukkan bukti, apa adanya; bedakan fakta dari opini.')
  lines.push('- Penutup/CTA: ajakan yang jujur, tanpa klaim penghasilan atau jaminan hasil.')
  lines.push('')
  lines.push('## Daftar periksa tinjauan')
  lines.push('- [ ] Setiap klaim faktual dipetakan ke bukti atau dihapus')
  lines.push('- [ ] Tidak ada klaim sensitif (kesehatan, keuangan, jaminan) tanpa verifikasi')
  lines.push('- [ ] Pengungkapan afiliasi/sponsor dicantumkan bila relevan')
  lines.push('- [ ] Sesuai aturan platform tujuan')

  claims.push({ text: 'Konten ini akan relevan bagi audiens target.', evidence_ids: [], status: 'unsupported' })

  return { title: `${FORMAT_LABEL[format] ?? 'Konten'} — ${opp.title}`.slice(0, 200), body: lines.join('\n'), claims }
}
