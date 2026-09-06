document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('opportunityRadar');
  if (!box) return;
  const num = v => { const n=Number(v); return Number.isFinite(n)?n:null; };
  const money = v => { const n=num(v); return n===null?'N/A':`₹${n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };
  const fmt = (v,s='') => { const n=num(v); return n===null?'N/A':`${n.toFixed(1)}${s}`; };
  const oi = v => { const n=num(v); return n===null?'N/A':n.toLocaleString('en-IN'); };
  const status = s => s?.dataStatus || (s?.status==='ok'?'EOD VERIFIED':'DATA N/A');
  const verdict = r => r.verdict || 'UNCONFIRMED / MIXED';
  const rankScore = r => (num(r.score)??-1)+(verdict(r)==='ACCUMULATION CONFIRMED'?20:verdict(r)==='ACCUMULATION STARTING'?10:0);
  try {
    const snapshot=await window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const rows=Array.isArray(snapshot.results)?snapshot.results:[];
    const ranked=rows.filter(r=>num(r.score)!==null&&verdict(r)!=='DISTRIBUTION').sort((a,b)=>rankScore(b)-rankScore(a)||num(b.score)-num(a.score)).slice(0,100);
    box.innerHTML=`<div class="dashboard-card opportunity-card">
      <style>
        .opportunity-card{overflow:visible}.opportunity-meta{margin:.35rem 0 .5rem}
        .opportunity-table-container{width:100%;height:calc(100vh - 210px);min-height:560px;max-height:none;overflow-y:auto;overflow-x:hidden;position:relative;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);isolation:isolate}
        .opportunity-table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0}
        .opportunity-table thead th{position:sticky!important;top:0!important;z-index:50!important;background:#182038!important;box-shadow:0 2px 0 var(--border-color),0 4px 10px rgba(0,0,0,.35);padding:0!important}
        .opportunity-table tbody td{padding:7px 8px;line-height:1.1;background:var(--bg-secondary);vertical-align:middle}
        .opportunity-table tbody tr{height:43px}.opportunity-table th:nth-child(1){width:7%}.opportunity-table th:nth-child(2){width:13%}.opportunity-table th:nth-child(3){width:12%}.opportunity-table th:nth-child(4){width:8%}.opportunity-table th:nth-child(5){width:9%}.opportunity-table th:nth-child(6){width:9%}.opportunity-table th:nth-child(7){width:9%}.opportunity-table th:nth-child(8){width:11%}.opportunity-table th:nth-child(9){width:13%}.opportunity-table th:nth-child(10){width:19%}
        .op-filter{width:100%;min-height:42px;padding:8px 6px;border:0;background:transparent;color:var(--text-primary);font:inherit;font-size:.72rem;font-weight:800;text-align:left;cursor:pointer;white-space:nowrap}.op-filter:hover,.op-filter.active{background:var(--bg-input);color:var(--accent-color)}
        .op-menu{position:fixed;z-index:10000;min-width:185px;padding:5px;background:#182038;border:1px solid var(--border-color);border-radius:7px;box-shadow:0 10px 24px rgba(0,0,0,.45)}.op-menu button{display:block;width:100%;padding:9px 11px;border:0;border-radius:5px;background:transparent;color:var(--text-primary);text-align:left;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}.op-menu button:hover{background:var(--bg-input);color:var(--accent-color)}
        @media(max-width:800px){.opportunity-table-container{height:calc(100vh - 230px);min-height:480px}.opportunity-table{font-size:.68rem}.opportunity-table tbody td{padding:6px 4px}.op-filter{font-size:.6rem;min-height:38px}}
      </style>
      <h2 class="card-headline">🛰 Opportunity Radar</h2>
      <p class="text-muted opportunity-meta">${status(snapshot)} · As of ${snapshot.asOf||'N/A'} · ${ranked.length} opportunities from ${rows.length.toLocaleString('en-IN')} verified rows</p>
      <div class="opportunity-table-container"><table class="metric-table opportunity-table"><thead><tr>
        ${['Rank','Symbol','Price','Score','Price %','Volume','Delivery','OI Change','Verdict','Why'].map((h,i)=>`<th><button type="button" class="op-filter" data-key="${i}">${h} ▾</button></th>`).join('')}
      </tr></thead><tbody>
      ${ranked.map((row,i)=>{const m=row.metrics||{};const why=Array.isArray(row.why)?row.why.slice(0,3).join(' '):'';return `<tr data-symbol="${String(row.symbol||row.ticker||'').replace(/&/g,'&amp;').replace(/\"/g,'&quot;')}" data-price="${num(m.close??m.last_price)??''}" data-score="${num(row.score)??''}" data-pricepct="${num(m.priceChangePct)??''}" data-volume="${num(m.volumeRatio)??''}" data-delivery="${num(m.deliveryPct)??''}" data-oi="${num(m.changeOi)??''}" data-verdict="${String(verdict(row)).replace(/\"/g,'&quot;')}"><td>${i+1}</td><td><strong>${row.symbol||row.ticker||'N/A'}</strong></td><td>${money(m.close??m.last_price)}</td><td>${num(row.score)??'N/A'}</td><td>${fmt(m.priceChangePct,'%')}</td><td>${fmt(m.volumeRatio,'x')}</td><td>${fmt(m.deliveryPct,'%')}</td><td>${oi(m.changeOi)}</td><td>${verdict(row)}</td><td>${why||'No additional explanation available.'}</td></tr>`;}).join('')}
      </tbody></table></div>
    </div>`;
    const table=box.querySelector('.opportunity-table'),tbody=table?.tBodies[0];if(!table||!tbody)return;
    const buttons=[...table.querySelectorAll('.op-filter')];let menu=null;let active={};
    const close=()=>{menu?.remove();menu=null;buttons.forEach(b=>b.classList.remove('active'));};
    const val=(r,key)=>{if(key===1)return r.dataset.symbol||'';return num(r.dataset[['','price','price','score','pricepct','volume','delivery','oi','',''][key]||'')};
    const options={0:[['All','all'],['Top to Bottom','rank']],1:[['All','all'],['A–Z','az'],['Z–A','za']],2:[['All','all'],['Low to High','asc'],['High to Low','desc']],3:[['All','all'],['Highest First','desc'],['Lowest First','asc'],['70+ Scores','high'],['Below 70','low']],4:[['All','all'],['Positive Only','pos'],['Negative Only','neg']],5:[['All','all'],['Highest First','desc'],['Lowest First','asc'],['1.2x or More','strong']],6:[['All','all'],['Highest First','desc'],['Lowest First','asc'],['50% or More','strong']],7:[['All','all'],['Highest First','desc'],['Lowest First','asc'],['OI Increasing','up'],['OI Decreasing','down'],['OI Not Available','na']],8:[['All','all'],['Accumulation Confirmed','ACCUMULATION CONFIRMED'],['Accumulation Starting','ACCUMULATION STARTING'],['Unconfirmed / Mixed','UNCONFIRMED / MIXED']],9:[['All','all'],['Has Explanation','has'] ]};
    const field={2:'price',3:'score',4:'pricepct',5:'volume',6:'delivery',7:'oi'};
    const apply=()=>{[...tbody.rows].forEach(r=>{let show=true;for(const [k,v] of Object.entries(active)){const key=Number(k);if(key===1&&!r.dataset.symbol.toUpperCase().includes(v))show=false;if(key===8&&r.dataset.verdict!==v)show=false;if(key===4&&v==='pos'&&!(num(r.dataset.pricepct)>=0))show=false;if(key===4&&v==='neg'&&!(num(r.dataset.pricepct)<0))show=false;if(key===3&&v==='high'&&!(num(r.dataset.score)>=70))show=false;if(key===3&&v==='low'&&!(num(r.dataset.score)<70))show=false;if(key===5&&v==='strong'&&!(num(r.dataset.volume)>=1.2))show=false;if(key===6&&v==='strong'&&!(num(r.dataset.delivery)>=50))show=false;if(key===7&&v==='up'&&!(num(r.dataset.oi)>0))show=false;if(key===7&&v==='down'&&!(num(r.dataset.oi)<0))show=false;if(key===7&&v==='na'&&num(r.dataset.oi)!==null)show=false;if(key===9&&v==='has'&&![...r.cells[9].textContent].length)show=false;}r.style.display=show?'':'none';});};
    const sort=(key,direction)=>{const rows=[...tbody.rows];const f=field[key];rows.sort((a,b)=>{if(key===1)return direction==='asc'?a.dataset.symbol.localeCompare(b.dataset.symbol):b.dataset.symbol.localeCompare(a.dataset.symbol);const av=num(a.dataset[f]),bv=num(b.dataset[f]);if(av===null&&bv===null)return 0;if(av===null)return 1;if(bv===null)return -1;return direction==='asc'?av-bv:bv-av;});rows.forEach(r=>tbody.appendChild(r));};
    buttons.forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();menu=document.createElement('div');menu.className='op-menu';const key=Number(btn.dataset.key);(options[key]||[['All','all']]).forEach(([label,v])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(v==='all')delete active[key];else if(v==='az'||v==='za')sort(1,v==='az'?'asc':'desc');else if(v==='asc'||v==='desc')sort(key,v);else if(v==='rank'){sort(3,'desc');}else active[key]=v;close();apply();};menu.appendChild(b);});document.body.appendChild(menu);const r=btn.getBoundingClientRect(),w=Math.min(menu.offsetWidth||210,innerWidth-16),h=menu.offsetHeight||180;menu.style.left=`${Math.max(8,Math.min(r.left,innerWidth-w-8))}px`;menu.style.top=`${Math.max(8,Math.min(r.bottom+4,innerHeight-h-8))}px`;},true));
    document.addEventListener('click',e=>{if(menu&&!e.target.closest('.op-menu')&&!e.target.closest('.op-filter'))close();});
    table.closest('.opportunity-table-container')?.addEventListener('scroll',close,{passive:true});window.addEventListener('resize',close);
  } catch(error) { box.innerHTML='<div class="dashboard-card"><h2 class="card-headline">🛰 Opportunity Radar</h2><p class="text-muted">Data N/A — a verified scanner snapshot is required.</p></div>'; }
});
