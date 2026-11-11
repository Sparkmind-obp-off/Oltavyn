const $ = (s) => document.querySelector(s)
const state = { workspaceId: null }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const show = (message, bad=false) => { const el=$('#message'); el.textContent=message; el.classList.remove('hide'); el.style.background=bad?'#fff0f0':'#edf5ff' }
async function api(path, options={}) {
  const res=await fetch(path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}})
  const data=await res.json().catch(()=>({}))
  if(!res.ok) throw new Error(data.error?.message || 'Permintaan gagal.')
  return data
}
const values = (form) => Object.fromEntries([...new FormData(form)].filter(([,v])=>v!=='').map(([k,v])=>[k,['price_amount','commission_rate_percent','product_rating','sold_count'].includes(k)?Number(v):v]))
async function refresh() {
  const id=state.workspaceId
  const [summary,products,channels,providers]=await Promise.all([
    api('/api/affiliate/workspaces/'+encodeURIComponent(id)+'/summary'),
    api('/api/affiliate/workspaces/'+encodeURIComponent(id)+'/products'),
    api('/api/affiliate/workspaces/'+encodeURIComponent(id)+'/channels'),
    api('/api/affiliate/providers')
  ])
  $('#stat-products').textContent=summary.summary.products
  $('#stat-shortlist').textContent=summary.summary.shortlisted
  $('#stat-channels').textContent=summary.summary.channels
  $('#stat-active').textContent=summary.summary.active_channels
  $('#products').innerHTML=products.products.length?'<table><thead><tr><th>Produk</th><th>Harga</th><th>Komisi</th><th>Status</th><th>Evidence</th></tr></thead><tbody>'+products.products.map(p=>'<tr><td><strong>'+esc(p.title)+'</strong><div><a target="_blank" rel="noopener noreferrer" href="'+esc(p.canonical_url)+'">Buka sumber</a></div><small>'+esc(p.category||'Tanpa kategori')+'</small></td><td>'+(p.price_amount==null?'Belum diketahui':'Rp '+Number(p.price_amount).toLocaleString('id-ID'))+'</td><td>'+(p.commission_rate_percent==null?'Belum diketahui':p.commission_rate_percent+'%')+'</td><td><span class="pill">'+esc(p.lifecycle_status)+'</span></td><td>'+esc(p.evidence_state)+'</td></tr>').join('')+'</tbody></table>':'Belum ada produk. Tambahkan kandidat dari sumber yang dapat diperiksa.'
  $('#channels').innerHTML=channels.channels.length?'<table><thead><tr><th>Kanal</th><th>Platform</th><th>Handle</th><th>Status</th></tr></thead><tbody>'+channels.channels.map(x=>'<tr><td>'+esc(x.channel_name)+'</td><td>'+esc(x.platform)+'</td><td>'+esc(x.handle||'—')+'</td><td>'+esc(x.status)+'</td></tr>').join('')+'</tbody></table>':'Belum ada kanal terdaftar.'
  $('#providers').innerHTML=providers.providers.map(p=>'<p><strong>'+esc(p.id)+'</strong> · '+esc(p.purpose)+' · <span class="pill">'+(p.configured?'configured':'belum dikonfigurasi')+'</span></p>').join('')
}
async function boot() {
  try {
    const me=await api('/api/auth/me')
    if(!me.user){$('#login').classList.remove('hide');$('#who').textContent='Belum masuk';return}
    $('#who').textContent=me.user.email
    const data=await api('/api/workspaces')
    if(!data.workspaces?.length){show('Buat workspace terlebih dahulu di halaman Core Engine.',true);return}
    $('#app').classList.remove('hide')
    $('#workspace').innerHTML=data.workspaces.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join('')
    state.workspaceId=data.workspaces[0].id
    $('#workspace').onchange=async()=>{state.workspaceId=$('#workspace').value;try{await refresh()}catch(e){show(e.message,true)}}
    await refresh()
  } catch(e){show(e.message,true)}
}
$('#product-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/affiliate/workspaces/'+encodeURIComponent(state.workspaceId)+'/products',{method:'POST',body:JSON.stringify(values(e.target))});e.target.reset();show('Produk tersimpan. Nilai yang tidak diketahui tetap kosong.');await refresh()}catch(err){show(err.message,true)}})
$('#channel-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/affiliate/workspaces/'+encodeURIComponent(state.workspaceId)+'/channels',{method:'POST',body:JSON.stringify(values(e.target))});e.target.reset();show('Kanal tersimpan.');await refresh()}catch(err){show(err.message,true)}})
$('#groq-form').addEventListener('submit',async e=>{e.preventDefault();$('#groq-result').textContent='Membuat draft…';try{const d=await api('/api/affiliate/providers/groq/generate',{method:'POST',body:JSON.stringify(values(e.target))});$('#groq-result').textContent=d.text||'Tidak ada teks dari model.'}catch(err){$('#groq-result').textContent=err.message}})
$('#tavily-form').addEventListener('submit',async e=>{e.preventDefault();$('#tavily-result').textContent='Mencari…';try{const d=await api('/api/affiliate/providers/tavily/search',{method:'POST',body:JSON.stringify(values(e.target))});$('#tavily-result').innerHTML=d.results.length?d.results.map(x=>'<article style="padding:10px 0;border-bottom:1px solid #edf0f3"><a target="_blank" rel="noopener noreferrer" href="'+esc(x.url)+'"><strong>'+esc(x.title)+'</strong></a><p>'+esc(x.content)+'</p><small>Relevance: '+esc(x.score)+'</small></article>').join(''):'Tidak ada hasil.'}catch(err){$('#tavily-result').textContent=err.message}})
boot()
