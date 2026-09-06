(function (root) {
  const API_BASE = (root.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const isStaticPages = !API_BASE && /github\.io$/i.test(root.location.hostname);
  let snapshotPromise;

  // Keep the Accumulation Scanner inside the same VIKRAM shell as the main Analysis page.
  // The scanner page is intentionally a dedicated workspace, but its global navigation must not disappear.
  function installGlobalNavigation() {
    const nav = document.querySelector('.app-navigation .nav-list');
    if (!nav) return;
    nav.innerHTML = `
      <li><a class="nav-link" href="index.html#home">Home</a></li>
      <li><a class="nav-link" href="index.html#companyOverview">Analysis</a></li>
      <li><a class="nav-link active" href="accumulation.html" aria-current="page">Accumulation Scanner</a></li>
      <li><a class="nav-link" href="index.html#hiddenGemsPreview">Hidden Gems</a></li>
      <li><a class="nav-link" href="index.html#opportunityRadar">Opportunity Radar</a></li>
      <li><a class="nav-link" href="index.html#portfolio">Portfolio</a></li>
      <li><a class="nav-link" href="scanner.html">Option B</a></li>
      <li><a class="nav-link" href="alerts.html">Alerts</a></li>
      <li><a class="nav-link" href="about.html">About</a></li>`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installGlobalNavigation, {once:true});
  else installGlobalNavigation();

  async function request(path, options) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' }, ...options });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `API request failed (${res.status})`);
    return body;
  }
  async function snapshot() {
    if (!snapshotPromise) snapshotPromise = fetch('data/scanner.json', {headers:{Accept:'application/json'},cache:'no-store'}).then(res=>{if(!res.ok)throw new Error(`Static scanner data unavailable (${res.status})`);return res.json();});
    return snapshotPromise;
  }
  function periodResults(data, period) { return period && data.periods?.[period] ? data.periods[period] : (data.results || []); }
  function staticScan(symbols, period='1D') { return snapshot().then(data=>({...data,selectedPeriod:period,results:periodResults(data,period).filter(r=>symbols.includes(String(r.symbol).toUpperCase()))})); }
  function staticAll(period='1D') { return snapshot().then(data=>({...data,selectedPeriod:period,results:periodResults(data,period)})); }
  function staticStock(symbol,period='1D') { return snapshot().then(data=>{const result=periodResults(data,period).find(r=>String(r.symbol).toUpperCase()===String(symbol).toUpperCase());if(!result)throw new Error(`No scanner data for ${symbol} in ${period}`);return {result,asOf:data.asOf,generatedAt:data.generatedAt,selectedPeriod:period};}); }
  root.ACCUMULATION_API={
    health:()=>isStaticPages?snapshot().then(data=>({status:data.status==='ok'?'ok':'pending',lastCmDate:data.asOf,historyDays:data.historyDays})):request('/api/health'),
    scan:(symbols,period='1D')=>isStaticPages?staticScan(symbols.map(s=>s.toUpperCase()),period):request(`/api/scanner/scan?symbols=${encodeURIComponent(symbols.join(','))}&period=${encodeURIComponent(period)}`),
    all:(period='1D')=>isStaticPages?staticAll(period):request(`/api/scanner/all?period=${encodeURIComponent(period)}`),
    stock:(symbol,period='1D')=>isStaticPages?staticStock(symbol,period):request(`/api/stock/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}`),
    watchlist:(period='1D')=>isStaticPages?staticScan(['ONGC','VBL','BSE','NMDC'],period):request(`/api/scanner/watchlist?period=${encodeURIComponent(period)}`)
  };

  // Beginner-friendly dropdowns: every useful data column has a small, immediate choice.
  window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
    const table=document.querySelector('.metric-table');
    if(!table || !table.tBodies[0]) return;
    const tbody=table.tBodies[0];
    const buttons=[...document.querySelectorAll('.filter-trigger')];
    const originalRows=[...tbody.rows];
    let menu=null;
    const state={};
    const close=()=>{if(menu){menu.remove();menu=null;}};
    const text=(row,index)=>String(row.cells[index]?.textContent||'').trim();
    const num=(value)=>{const s=String(value).replace(/,/g,'').replace(/%/g,'').replace(/x$/i,'').replace(/\s+/g,'');const n=parseFloat(s);return Number.isFinite(n)?n:null;};
    const symbol=(row)=>text(row,0).toUpperCase();
    function sortRows(index,direction){const rows=[...tbody.rows];rows.sort((a,b)=>{const av=num(text(a,index)),bv=num(text(b,index));if(av===null&&bv===null)return 0;if(av===null)return 1;if(bv===null)return -1;return direction==='asc'?av-bv:bv-av;});rows.forEach(r=>tbody.appendChild(r));}
    function sortSymbols(direction){const rows=[...tbody.rows];rows.sort((a,b)=>direction==='asc'?symbol(a).localeCompare(symbol(b)):symbol(b).localeCompare(symbol(a)));rows.forEach(r=>tbody.appendChild(r));}
    function apply(){[...tbody.rows].forEach(row=>{let visible=true;const price=num(text(row,1));const pricePct=num(text(row,3));const score=num(text(row,4));const verdict=text(row,5).toUpperCase();const volume=num(text(row,6));const delivery=num(text(row,7));const obv=num(text(row,8));const oi=text(row,9).toUpperCase();if(state.price==='positive'&&!(price!==null&&price>0))visible=false;if(state.pricePct==='positive'&&!(pricePct!==null&&pricePct>0))visible=false;if(state.pricePct==='negative'&&!(pricePct!==null&&pricePct<0))visible=false;if(state.score==='high'&&!(score!==null&&score>=70))visible=false;if(state.score==='low'&&!(score!==null&&score<50))visible=false;if(state.verdict&&!verdict.includes(state.verdict))visible=false;if(state.volume==='strong'&&!(volume!==null&&volume>=1))visible=false;if(state.volume==='weak'&&!(volume!==null&&volume<1))visible=false;if(state.delivery==='strong'&&!(delivery!==null&&delivery>=50))visible=false;if(state.delivery==='low'&&!(delivery!==null&&delivery<50))visible=false;if(state.obv==='positive'&&!(obv!==null&&obv>0))visible=false;if(state.obv==='negative'&&!(obv!==null&&obv<0))visible=false;if(state.oi==='up'&&!oi.startsWith('+'))visible=false;if(state.oi==='down'&&!oi.startsWith('-'))visible=false;if(state.oi==='na'&&oi!=='N/A')visible=false;row.style.display=visible?'':'none';});const summary=document.querySelector('.filter-summary');if(summary)summary.textContent=`Showing ${[...tbody.rows].filter(r=>r.style.display!=='none').length.toLocaleString()} stocks • Filters: ${Object.keys(state).length?'active':'none'}`;}
    function reset(){Object.keys(state).forEach(k=>delete state[k]);originalRows.forEach(r=>tbody.appendChild(r));[...tbody.rows].forEach(r=>r.style.display='');close();const summary=document.querySelector('.filter-summary');if(summary)summary.textContent=`Showing ${tbody.rows.length.toLocaleString()} stocks • Filters: none`;}
    function optionsFor(key){if(key==='stock')return [['All','all'],['A–Z','sort-stock-asc'],['Z–A','sort-stock-desc']];if(key==='price'||key==='prevClose')return [['All','all'],['Low to High','sort-asc'],['High to Low','sort-desc']];if(key==='priceChange')return [['All','all'],['Positive Only','positive'],['Negative Only','negative']];if(key==='score')return [['All','all'],['Highest First','sort-desc'],['Lowest First','sort-asc'],['70+ Scores','high'],['Below 50','low']];if(key==='verdict')return [['All','all'],['Accumulation Confirmed','ACCUMULATION CONFIRMED'],['Accumulation Starting','ACCUMULATION STARTING'],['Unconfirmed / Mixed','UNCONFIRMED / MIXED'],['Distribution','DISTRIBUTION']];if(key==='volumeRatio')return [['All','all'],['Highest First','sort-desc'],['Lowest First','sort-asc'],['1x or More','strong'],['Below 1x','weak']];if(key==='delivery')return [['All','all'],['Highest First','sort-desc'],['Lowest First','sort-asc'],['50% or More','strong'],['Below 50%','low']];if(key==='obv')return [['All','all'],['Highest First','sort-desc'],['Lowest First','sort-asc'],['Positive OBV','positive'],['Negative OBV','negative']];if(key==='changeOi')return [['All','all'],['Highest First','sort-desc'],['Lowest First','sort-asc'],['OI Increasing','up'],['OI Decreasing','down'],['OI Not Available','na']];return [['All','all']];}
    function open(button,key){close();menu=document.createElement('div');menu.className='simple-filter-menu';optionsFor(key).forEach(([label,value])=>{const item=document.createElement('button');item.type='button';item.textContent=label;item.addEventListener('click',()=>{if(value==='all')delete state[key];else if(value==='sort-asc'||value==='sort-desc'||value==='sort-stock-asc'||value==='sort-stock-desc')delete state[key];else state[key]=value;close();if(value==='sort-stock-asc'||value==='sort-stock-desc')sortSymbols(value==='sort-stock-asc'?'asc':'desc');else if(value==='sort-asc'||value==='sort-desc'){const index={price:1,prevClose:2,score:4,volumeRatio:6,delivery:7,obv:8,changeOi:9}[key];if(index!==undefined)sortRows(index,value==='sort-asc'?'asc':'desc');}apply();});menu.appendChild(item);});document.body.appendChild(menu);const rect=button.getBoundingClientRect();const width=Math.min(menu.offsetWidth||210,window.innerWidth-16);const height=menu.offsetHeight||180;menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;menu.style.top=`${Math.max(8,Math.min(rect.bottom+4,window.innerHeight-height-8))}px`;}
    buttons.forEach(button=>button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open(button,button.dataset.key);},true));
    document.addEventListener('click',e=>{if(menu&&!e.target.closest('.simple-filter-menu')&&!e.target.closest('.filter-trigger'))close();});window.addEventListener('scroll',close,{passive:true});window.addEventListener('resize',close);document.getElementById('clearFilters')?.addEventListener('click',reset);
  },0));
})(window);
