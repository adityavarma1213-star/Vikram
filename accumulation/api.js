(function (root) {
  const API_BASE = (root.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const isStaticPages = !API_BASE && /github\.io$/i.test(root.location.hostname);
  let snapshotPromise;

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

  // Keep the filter interaction deliberately simple: one click, one choice, no Apply button.
  window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
    const table=document.querySelector('.metric-table'); if(!table) return;
    const tbody=table.tBodies[0]; const buttons=[...document.querySelectorAll('.filter-trigger')]; let menu=null; let priceOrder=null; let verdict='';
    const close=()=>{if(menu){menu.remove();menu=null;}};
    const sortPrice=dir=>{priceOrder=dir;const rows=[...tbody.rows];rows.sort((a,b)=>{const av=parseFloat((a.cells[1]?.textContent||'').replace(/,/g,'')),bv=parseFloat((b.cells[1]?.textContent||'').replace(/,/g,''));if(!Number.isFinite(av))return 1;if(!Number.isFinite(bv))return-1;return dir==='asc'?av-bv:bv-av;});rows.forEach(r=>tbody.appendChild(r));};
    const applyVerdict=value=>{verdict=value;[...tbody.rows].forEach(r=>{const text=(r.cells[5]?.textContent||'').trim();r.style.display=!value||text===value?'':'none';});};
    const open=(button,key)=>{
      close(); menu=document.createElement('div');menu.className='simple-filter-menu';
      let options=[];
      if(key==='price') options=[['All','all'],['Price: Low to High','asc'],['Price: High to Low','desc']];
      else if(key==='verdict') options=[['All','all'],['Accumulation Confirmed','ACCUMULATION CONFIRMED'],['Accumulation Starting','ACCUMULATION STARTING'],['Unconfirmed / Mixed','UNCONFIRMED / MIXED'],['Distribution','DISTRIBUTION']];
      else options=[['All','all']];
      options.forEach(([label,value])=>{const item=document.createElement('button');item.type='button';item.textContent=label;item.addEventListener('click',()=>{close();if(key==='price'){if(value==='all'){priceOrder=null;}else sortPrice(value);}else if(key==='verdict'){applyVerdict(value==='all'?'':value);}});menu.appendChild(item);});
      const rect=button.getBoundingClientRect();menu.style.top=`${Math.min(rect.bottom+4,window.innerHeight-190)}px`;menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-220))}px`;document.body.appendChild(menu);
    };
    buttons.forEach(button=>button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open(button,button.dataset.key);},true));
    document.addEventListener('click',close,true);
    document.getElementById('clearFilters')?.addEventListener('click',()=>{verdict='';priceOrder=null;[...tbody.rows].forEach(r=>r.style.display='');close();});
  },0));
})(window);
