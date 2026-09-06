(() => {
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money = v => { const n=num(v); return n===null?'N/A':`₹${n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})`; };
  const pct = v => { const n=num(v); return n===null?'N/A':`${n.toFixed(2)}%`; };
  const mult = v => { const n=num(v); return n===null?'N/A':`${n.toFixed(2)}x`; };
  const verdictClass = v => { const x=String(v||'').toUpperCase(); return x.includes('CONFIRMED')?'vd-confirmed':x.includes('STARTING')?'vd-starting':x.includes('QUIET')?'vd-quiet':x.includes('DISTRIBUTION')?'vd-distribution':'vd-mixed'; };
  const changeClass = v => v>0?'vd-positive':v<0?'vd-negative':'vd-neutral';
  const scoreClass = v => v>=75?'vd-confirmed':v>=55?'vd-neutral':'vd-negative';
  async function snapshot() {
    if (window.VIKRAM_DATA_ENGINE?.loadSnapshot) return window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const r=await fetch('data/scanner.json',{cache:'no-store'}); if(!r.ok) throw new Error(`SNAPSHOT_HTTP_${r.status}`);
    const s=await r.json(); if(s.status!=='ok'||s.dataStatus!=='EOD VERIFIED') throw new Error('SNAPSHOT_NOT_VERIFIED'); return s;
  }
  function baseStyle() {
    if(document.getElementById('vikramDiscoveryRepairStyles')) return;
    const s=document.createElement('style'); s.id='vikramDiscoveryRepairStyles'; s.textContent=`
      .vikram-discovery-source{margin:-4px 0 10px;color:var(--text-muted);font-size:10px;font-weight:700}.vikram-discovery-legend{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 10px;color:var(--text-muted);font-size:9px;font-weight:800}.vikram-discovery-legend span{display:inline-flex;align-items:center;gap:4px}.vikram-discovery-legend i{width:7px;height:7px;border-radius:50%;display:inline-block}.vdg{background:#22c55e}.vdr{background:#ef4444}.vdy{background:#f59e0b}.vdb{background:#60a5fa}.vdp{background:#a855f7}.vdx{background:#94a3b8}
      .vikram-discovery-table-wrap{overflow:auto;border:1px solid var(--border-subtle);border-radius:12px;max-height:620px}.vikram-discovery-table{width:100%;min-width:980px;border-collapse:collapse;font-size:12px}.vikram-discovery-table th{position:sticky;top:0;z-index:4;background:var(--bg-card-2);color:var(--text-muted);padding:10px;text-align:left;font-size:10px}.vikram-discovery-table td{padding:9px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-main)}.vikram-discovery-table tr:hover td{background:var(--bg-card-2)}
      .vd-positive{color:#22c55e!important;font-weight:900}.vd-negative{color:#ef4444!important;font-weight:900}.vd-neutral{color:#f59e0b!important;font-weight:900}.vd-confirmed{color:#22c55e!important;font-weight:900}.vd-starting{color:#60a5fa!important;font-weight:900}.vd-quiet{color:#a855f7!important;font-weight:900}.vd-mixed{color:#94a3b8!important;font-weight:900}.vd-distribution{color:#ef4444!important;font-weight:900}.vd-score-strong{color:#22c55e!important;font-weight:900}.vd-score-medium{color:#f59e0b!important;font-weight:900}.vd-score-weak{color:#ef4444!important;font-weight:900}.vd-volume-strong{color:#22c55e!important;font-weight:900}.vd-volume-normal{color:#f59e0b!important;font-weight:900}.vd-volume-weak{color:#ef4444!important;font-weight:900}.vd-delivery-strong{color:#22c55e!important;font-weight:900}.vd-delivery-medium{color:#f59e0b!important;font-weight:900}.vd-delivery-weak{color:#ef4444!important;font-weight:900}.vd-oi-positive{color:#22c55e!important;font-weight:900}.vd-oi-negative{color:#ef4444!important;font-weight:900}.vd-oi-na{color:#f59e0b!important;font-weight:900}
      .vd-controls{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.vd-controls select{border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-main);border-radius:8px;padding:7px 9px;font-size:10px;font-weight:800}.vikram-research-source{display:block;margin-top:4px;color:var(--text-muted);font-size:9px;font-weight:700}.vikram-research-score{color:#22c55e!important;font-weight:900}.vikram-research-starting{color:#60a5fa!important;font-weight:900}.vikram-research-quiet{color:#a855f7!important;font-weight:900}.vikram-research-mixed{color:#94a3b8!important;font-weight:900}.vikram-research-distribution{color:#ef4444!important;font-weight:900}`; document.head.appendChild(s);
  }
  function repairResearchOverview(source) {
    const params=new URLSearchParams(location.search), hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
    const symbol=String(params.get('symbol')||hash.get('symbol')||'').trim().toUpperCase(); if(!symbol) return;
    const row=source.find(r=>String(r.symbol||r.ticker||'').toUpperCase()===symbol); if(!row) return;
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value==null||value===''?'N/A':value;};
    const score=num(row.score), verdict=String(row.verdict||'MIXED / UNCONFIRMED').toUpperCase();
    const label=document.getElementById('overviewVikramScore')?.previousElementSibling; if(label) label.textContent='Accumulation Score';
    set('overviewVikramScore',score===null?'N/A':score.toFixed(1)); set('overviewRating',verdict);
    const cls=verdictClass(verdict).replace('vd-','vikram-research-');
    ['overviewVikramScore','overviewRating'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.remove('vikram-research-score','vikram-research-starting','vikram-research-quiet','vikram-research-mixed','vikram-research-distribution');el.classList.add(cls);}});
    const card=document.getElementById('companyOverview'); if(card){let note=card.querySelector('.vikram-research-source');if(!note){note=document.createElement('small');note.className='vikram-research-source';card.appendChild(note);}note.textContent=`Source: Accumulation Scanner • ${row.tradeDate||'EOD VERIFIED'} • EOD VERIFIED. Research fundamentals remain N/A until a verified fundamentals dataset exists.`;}
  }
  function cellClass(key,r){
    if(key==='change')return changeClass(r.change); if(key==='score')return scoreClass(r.score);
    if(key==='volume')return r.volume===null?'vd-neutral':r.volume>=1.3?'vd-volume-strong':r.volume>=0.8?'vd-volume-normal':'vd-volume-weak';
    if(key==='delivery')return r.delivery===null?'vd-neutral':r.delivery>=55?'vd-delivery-strong':r.delivery>=45?'vd-delivery-medium':'vd-delivery-weak';
    if(key==='oi')return r.oi===null?'vd-oi-na':r.oi>0?'vd-oi-positive':r.oi<0?'vd-oi-negative':'vd-neutral'; if(key==='verdict')return verdictClass(r.verdict); return '';
  }
  function renderTable(box,title,sourceLabel,rows,columns){
    if(!box)return;
    box.innerHTML=`<div class="dashboard-card"><h2 class="card-headline">${title}</h2><div class="vikram-discovery-source">${sourceLabel}</div><div class="vikram-discovery-legend"><span><i class="vdg"></i>Positive / strong</span><span><i class="vdr"></i>Negative / weak</span><span><i class="vdy"></i>Neutral / warning</span><span><i class="vdb"></i>Starting</span><span><i class="vdp"></i>Quiet absorption</span><span><i class="vdx"></i>Mixed</span></div><div class="vd-controls"><select data-filter="verdict"><option value="">All Verdicts</option><option>ACCUMULATION CONFIRMED</option><option>ACCUMULATION STARTING</option><option>QUIET ABSORPTION</option><option>DISTRIBUTION</option><option>MIXED / UNCONFIRMED</option></select><select data-filter="score"><option value="">All Scores</option><option value="75">Score 75+</option><option value="55">Score 55+</option></select><select data-filter="today"><option value="">All Change</option><option value="positive">Positive</option><option value="negative">Negative</option></select></div><div class="vikram-discovery-table-wrap"><table class="vikram-discovery-table"><thead><tr>${columns.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody></tbody></table></div></div>`;
    const tbody=box.querySelector('tbody'); const render=()=>{const v=box.querySelector('[data-filter="verdict"]')?.value||'',minScore=num(box.querySelector('[data-filter="score"]')?.value),change=box.querySelector('[data-filter="today"]')?.value||'';const visible=rows.filter(r=>(!v||r.verdict===v)&&(minScore===null||r.score!==null&&r.score>=minScore)&&(!change||(change==='positive'?r.change>=0:r.change<0))).slice(0,100);tbody.innerHTML=visible.length?visible.map(r=>`<tr>${columns.map(([key])=>`<td class="${cellClass(key,r)}">${key==='price'?money(r.price):key==='score'?(r.score===null?'N/A':r.score.toFixed(1)):key==='change'?pct(r.change):key==='volume'?mult(r.volume):key==='delivery'?pct(r.delivery):key==='oi'?(r.oi===null?'N/A':r.oi.toLocaleString('en-IN')):esc(r[key]??'N/A')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}" style="text-align:center;padding:25px">No verified candidates match these filters.</td></tr>`;};box.querySelectorAll('select').forEach(s=>s.addEventListener('change',render));render();
  }
  async function boot(){
    baseStyle(); const s=await snapshot(); const source=Array.isArray(s.results)?s.results:[]; repairResearchOverview(source);
    const rows=source.map(r=>{const m=r.metrics||{};return{symbol:String(r.symbol||r.ticker||''),price:num(m.close),score:num(r.score),change:num(m.priceChangePct),volume:num(m.volumeRatio),delivery:num(m.deliveryPct),oi:num(m.changeOi),verdict:String(r.verdict||'MIXED / UNCONFIRMED').toUpperCase(),tradeDate:r.tradeDate};});
    const ranked=rows.filter(r=>r.score!==null&&r.verdict!=='DISTRIBUTION').sort((a,b)=>(b.score??-1)-(a.score??-1)||String(a.symbol).localeCompare(String(b.symbol)));
    const gems=ranked.filter(r=>r.score>=55&&r.score<75&&r.verdict!=='ACCUMULATION CONFIRMED').slice(0,50);
    const radar=ranked.filter(r=>r.verdict==='ACCUMULATION CONFIRMED'||r.verdict==='ACCUMULATION STARTING'||r.score>=75).slice(0,100);
    renderTable(document.getElementById('hiddenGemsPreview'),'💎 Hidden Gems — Verified Discovery','Source: Accumulation Scanner • score 55–74 • not already confirmed',gems,[['symbol','SYMBOL'],['price','PRICE'],['score','SCORE'],['change','CHANGE'],['volume','VOLUME'],['delivery','DELIVERY'],['oi','OI CHANGE'],['verdict','VERDICT']]);
    renderTable(document.getElementById('opportunityRadar'),'🎯 Opportunity Radar — Verified Opportunities','Source: Accumulation Scanner • confirmed / starting / score 75+',radar,[['symbol','STOCK'],['price','PRICE'],['score','SCORE'],['change','TODAY'],['volume','VOLUME'],['delivery','DELIVERY'],['oi','OI CHANGE'],['verdict','VERDICT']]);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(console.error),{once:true});else boot().catch(console.error);
})();