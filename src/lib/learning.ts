// Deterministic learning summary built only from recorded experiments and observations.
// No inference of metrics that were not recorded; missing data stays distinct from zero.

export function buildLearningSummary(experiments: any[], observations: any[]) {
  const byExp = new Map<string, any[]>()
  for (const o of observations) {
    if (!byExp.has(o.experiment_id)) byExp.set(o.experiment_id, [])
    byExp.get(o.experiment_id)!.push(o)
  }

  const status = {
    total: experiments.length,
    planned: experiments.filter((e) => e.status === 'planned').length,
    published: experiments.filter((e) => e.status === 'published').length,
    not_published: experiments.filter((e) => e.status === 'not_published').length,
    with_observed_values: experiments.filter((e) => (byExp.get(e.id) || []).some((o) => o.value_status === 'observed')).length,
    without_any_observation: experiments.filter((e) => !(byExp.get(e.id) || []).length).length,
    with_next_decision: experiments.filter((e) => e.next_decision).length,
  }

  // Compare by metric_name + unit only (never mix units).
  const groups = new Map<string, { metric_name: string; unit: string; rows: any[] }>()
  for (const o of observations) {
    if (o.value_status !== 'observed') continue
    const k = `${o.metric_name}||${o.unit}`
    if (!groups.has(k)) groups.set(k, { metric_name: o.metric_name, unit: o.unit, rows: [] })
    const e = experiments.find((x) => x.id === o.experiment_id)
    groups.get(k)!.rows.push({
      experiment_id: o.experiment_id, hypothesis: e?.hypothesis, channel: e?.channel, asset_title: e?.asset_title,
      value: o.numeric_value, window_start: o.window_start, window_end: o.window_end, origin: o.origin, observation_id: o.id,
    })
  }
  const comparisons = [...groups.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => b.value - a.value) }))

  const missing = observations
    .filter((o) => o.value_status !== 'observed')
    .map((o) => ({ experiment_id: o.experiment_id, metric_name: o.metric_name, value_status: o.value_status, observation_id: o.id }))

  const caveats: string[] = [
    'Ringkasan ini hanya memakai data yang Anda catat; tidak ada metrik yang ditebak.',
    'Perbandingan hanya dilakukan antar metrik dengan nama dan satuan yang sama.',
  ]
  if (comparisons.some((g) => g.rows.length < 2)) caveats.push('Beberapa metrik hanya memiliki satu observasi — belum dapat dibandingkan.')
  if (comparisons.length) caveats.push('Jumlah eksperimen kecil; perbedaan bisa karena kebetulan, waktu, atau faktor lain. Tidak ada signifikansi statistik yang diklaim.')

  // Next-test recommendation with explicit reasoning and cited records.
  let next_test: { recommendation: string; reasoning: string; based_on: string[]; uncertainty: string }
  if (!experiments.length) {
    next_test = { recommendation: 'Mulai eksperimen pertama dari konten yang sudah disetujui.', reasoning: 'Belum ada eksperimen tercatat.', based_on: [], uncertainty: 'Tidak ada data untuk dipelajari.' }
  } else if (status.planned > 0 && status.published + status.not_published === 0) {
    const ids = experiments.filter((e) => e.status === 'planned').map((e) => e.id)
    next_test = { recommendation: 'Catat apakah konten diterbitkan atau sengaja tidak diterbitkan.', reasoning: 'Semua eksperimen masih berstatus direncanakan.', based_on: ids, uncertainty: 'Tanpa status publikasi, hasil tidak dapat dinilai.' }
  } else if (!comparisons.length) {
    const ids = experiments.filter((e) => e.status === 'published').map((e) => e.id)
    next_test = {
      recommendation: 'Kumpulkan setidaknya satu metrik teramati (dengan satuan dan jendela waktu) untuk eksperimen yang sudah terbit.',
      reasoning: 'Belum ada nilai teramati; status "belum tersedia" atau "tidak dikumpulkan" tidak dihitung sebagai nol.',
      based_on: ids, uncertainty: 'Tinggi — belum ada hasil nyata.',
    }
  } else {
    const best = comparisons.map((g) => ({ g, top: g.rows[0] })).sort((a, b) => b.g.rows.length - a.g.rows.length)[0]
    const g = best.g
    if (g.rows.length >= 2) {
      next_test = {
        recommendation: `Uji ulang pendekatan dari eksperimen dengan ${g.metric_name} tertinggi ("${best.top.asset_title}") dengan satu variabel diubah (mis. hook atau kanal), lalu bandingkan pada jendela waktu yang sama.`,
        reasoning: `Pada metrik "${g.metric_name}" (${g.unit}), nilai tertinggi tercatat ${best.top.value} vs terendah ${g.rows[g.rows.length - 1].value} dari ${g.rows.length} eksperimen.`,
        based_on: g.rows.map((r) => r.observation_id),
        uncertainty: 'Sampel kecil; replikasi diperlukan sebelum menyimpulkan pola.',
      }
    } else {
      next_test = {
        recommendation: `Jalankan eksperimen kedua dengan metrik "${g.metric_name}" (${g.unit}) yang sama agar ada pembanding.`,
        reasoning: `Hanya ada satu observasi untuk "${g.metric_name}" (nilai ${best.top.value}).`,
        based_on: g.rows.map((r) => r.observation_id),
        uncertainty: 'Tinggi — satu titik data tidak menunjukkan pola.',
      }
    }
  }

  return { generated_at: new Date().toISOString(), method: 'deterministic_v1', status, comparisons, missing_data: missing, caveats, next_test }
}
