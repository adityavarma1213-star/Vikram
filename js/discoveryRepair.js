(() => {
  'use strict';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const money = v => { const n=num(v); return n===null?'N/A':`₹${n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };
  const pct = v => { const n=num(v); return n===null?'N/A':`${n.toFixed(2)}%`; };
  const mult = v => { const n=num(v); return n===null?'N/A':`${n.toFixed(2)}x`; };
  async function snapshot() {
    if (window.VIKRAM_DATA_ENGINE?.loadSnapshot) return window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const r = await fetch('data/scanner.json',{cache:'no-store'});
    if (!r.ok) throw new Error(`SNAPSHOT_HTTP_${r.status}`);
    const s = await r.json();
    if (s.status !== 'ok' || s.dataStatus !== 'EOD VERIFIED') throw new Error('SNAPSHOT_NOT_VERIFIED');
    return s;
  }
  function baseStyle() {
    if (document.getElementById('vikramDiscoveryRepairStyles')) return;
    const s=document.createElement('style'); s.id='vikramDiscoveryRepairStyles';
    s.textContent=`
      .vikram-discovery-table-wrap{overflow:auto;border:1px solid var(--border-subtle);border-radius:12px;max-height:620px}
      .vikram-discovery-table{width:100%;min-width:980px;border-collapse:collapse;font-size:12px}
      .vikram-discovery-table th{position:sticky;top:0;z-index:4;background:var(--bg-card-2);color:var(--text-muted);padding:10px;text-align:left;font-size:10px}
      .vikram-discovery-table td{padding:9px 10px;border-bottom:1px solid var(--border-subtle);color:var(--text-main)}
      .vikram-discovery-table tr:hover td{background:var(--bg-card-2)}
      .vd-positive{color:#22c55e!important;font-weight:900}.vd-negative{color:#ef4444!important;font-weight:900}.vd-neutral{color:#f59e0b!important;font-weight:900}
      .vd-confirmed{color:#22c55e!important;font-weight:900}.vd-starting{color:#60a5fa!important;font-weight:900}.vd-quiet{color:#a855f7!important;font-weight:900}.vd-mixed{color:#94a3b8!important;font-weight:900}.vd-distribution{color:#ef4444!important;font-weight:900}
      .vd-controls{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.vd-controls select{border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-main);border-radius:8px;padding:7px 9px;font-size:10px;font-weight:800}
    `; document.head.appendChild(s);
  }
  function renderTable(box, title, rows, columns) {
    if (!box) return;
    box.innerHTML=`<div class="dashboard-card"><h2 class="card-headline">${title}</h2><div class="vd-controls">
      <select data-filter="verdict"><option value="">All Verdicts</option><option>ACCUMULATION CONFIRMED</option><option>ACCUMULATION STARTING</option><option>QUIET ABSORPTION</option><option>DISTRIBUTION</option><option>MIXED / UNCONFIRMED</option></select>
      <select data-filter="score"><option value="">All Scores</option><option value="75">Score 75+</option><option value="55">Score 55+</option></select>
      <select data-filter="today"><option value="">All Change</option><option value="positive">Positive</option><option value="negative">Negative</option></select>
    </div><div class="vikram-discovery-table-wrap"><table class="vikram-discovery-table"><thead><tr>${columns.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody></tbody></table></div></div>`;
    const tbody=box.querySelector('tbody');
    const render=()=>{
      const v=box.querySelector('[data-filter="verdict"]')?.value||'';
      const minScore=num(box.querySelector('[data-filter="score"]')?.value);
      const change=box.querySelector('[data-filter="today"]')?.value||'';
      const visible=rows.filter(r=>(!v||r.verdict===v)&&(minScore===null||r.score!==null&&r.score>=minScore)&&(!change||(change==='positive'?r.change>=0:r.change<0))).slice(0,100);
      tbody.innerHTML=visible.length?visible.map(r=>`<tr>${columns.map(([key])=>`<td class="${key==='change'?(r.change>0?'vd-positive':r.change<0?'vd-negative':'vd-neutral'):key==='verdict'?(r.verdict.includes('CONFIRMED')?'vd-confirmed':r.verdict.includes('STARTING')?'vd-starting':r.verdict.includes('QUIET')?'vd-quiet':r.verdict.includes('DISTRIBUTION')?'vd-distribution':'vd-mixed'):''}">${key==='price'?money(r.price):key==='score'?(r.score===null?'N/A':r.score):key==='change'?pct(r.change):key==='volume'?mult(r.volume):key==='delivery'?pct(r.delivery):key==='oi'?(r.oi===null?'N/A':r.oi.toLocaleString('en-IN')):esc(r[key]??'N/A')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}" style="text-align:center;padding:25px">No verified candidates match these filters.</td></tr>`;
    };
    box.querySelectorAll('select').forEach(s=>s.addEventListener('change',render));
    render();
  }
  async function boot() {
    baseStyle();
    const s=await snapshot();
    const source=Array.isArray(s.results)?s.results:[];
    const rows=source.map(r=>{const m=r.metrics||{};return {symbol:String(r.symbol||r.ticker||''),price:num(m.close),score:num(r.score),change:num(m.priceChangePct),volume:num(m.volumeRatio),delivery:num(m.deliveryPct),oi:num(m.changeOi),verdict:String(r.verdict||'MIXED / UNCONFIRMED').toUpperCase()};});
    const ranked=rows.filter(r=>r.score!==null&&r.verdict!=='DISTRIBUTION').sort((a,b)=>(b.score??-1)-(a.score??-1)||String(a.symbol).localeCompare(String(b.symbol)));
    const gems=ranked.filter(r=>r.score>=55&&r.score<85).slice(0,50);
    const radar=ranked.filter(r=>r.verdict==='ACCUMULATION CONFIRMED'||r.verdict==='ACCUMULATION STARTING'||r.score>=75).slice(0,100);
    renderTable(document.getElementById('hiddenGemsPreview'),'💎 Hidden Gems — Verified Discovery',gems,[['symbol','SYMBOL'],['price','PRICE'],['score','SCORE'],['change','CHANGE'],['volume','VOLUME'],['delivery','DELIVERY'],['oi','OI CHANGE'],['verdict','VERDICT']]);
    renderTable(document.getElementById('opportunityRadar'),'🎯 Opportunity Radar — Verified Opportunities',radar,[['symbol','STOCK'],['price','PRICE'],['score','SCORE'],['change','TODAY'],['volume','VOLUME'],['delivery','DELIVERY'],['oi','OI CHANGE'],['verdict','VERDICT']]);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>boot().catch(console.error),{once:true}); else boot().catch(console.error);
})();
