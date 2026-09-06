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

  // Investor-friendly filters: one click, simple choices, no conditions and no Apply button.
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
    const num=(value)=>{const n=parseFloat(String(value).replace(/,/g,'').replace(/%/g,''));return Number.isFinite(n)?n:null;};
    const symbol=(row)=>text(row,0).toUpperCase();

    function sortRows(index, direction, parser=num){
      const rows=[...tbody.rows];
      rows.sort((a,b)=>{
        const av=parser(a,index), bv=parser(b,index);
        if(av===null && bv===null) return 0;
        if(av===null) return 1;
        if(bv===null) return -1;
        return direction==='asc'?av-bv:bv-av;
      });
      rows.forEach(r=>tbody.appendChild(r));
    }

    function sortSymbols(direction){
      const rows=[...tbody.rows];
      rows.sort((a,b)=>direction==='asc'?symbol(a).localeCompare(symbol(b)):symbol(b).localeCompare(symbol(a)));
      rows.forEach(r=>tbody.appendChild(r));
    }

    function apply(){
      [...tbody.rows].forEach(row=>{
        let visible=true;
        const verdict=(text(row,5)).toUpperCase();
        const pricePct=num(text(row,3));
        const score=num(text(row,4));
        const volume=num(text(row,6));
        const delivery=num(text(row,7));
        const obv=num(text(row,8));
        const oi=text(row,9).toUpperCase();

        if(state.verdict && !verdict.includes(state.verdict)) visible=false;
        if(state.pricePct==='positive' && !(pricePct!==null && pricePct>0)) visible=false;
        if(state.pricePct==='negative' && !(pricePct!==null && pricePct<0)) visible=false;
        if(state.volume==='strong' && !(volume!==null && volume>=1)) visible=false;
        if(state.volume==='weak' && !(volume!==null && volume<1)) visible=false;
        if(state.delivery==='high' && !(delivery!==null && delivery>=50)) visible=false;
        if(state.delivery==='low' && !(delivery!==null && delivery<50)) visible=false;
        if(state.obv==='positive' && !(obv!==null && obv>0)) visible=false;
        if(state.obv==='negative' && !(obv!==null && obv<0)) visible=false;
        if(state.oi==='up' && !(oi.startsWith('+'))) visible=false;
        if(state.oi==='down' && !(oi.startsWith('-'))) visible=false;
        if(state.oi==='na' && oi!=='N/A') visible=false;
        row.style.display=visible?'':'none';
      });
      const summary=document.querySelector('.filter-summary');
      if(summary){
        const active=Object.values(state).filter(Boolean).length;
        summary.textContent=`Showing ${[...tbody.rows].filter(r=>r.style.display!=='none').length.toLocaleString()} stocks • Filters: ${active?'active':'none'}`;
      }
    }

    function reset(){
      Object.keys(state).forEach(k=>delete state[k]);
      originalRows.forEach(r=>tbody.appendChild(r));
      [...tbody.rows].forEach(r=>r.style.display='');
      close();
      const summary=document.querySelector('.filter-summary');
      if(summary) summary.textContent=`Showing ${tbody.rows.length.toLocaleString()} stocks • Filters: none`;
    }

    function optionsFor(key){
      const all=[['All','all']];
      if(key==='stock') return [...all,['A–Z','sort-az'],['Z–A','sort-za']];
      if(key==='price') return [...all,['Price: Low to High','sort-asc'],['Price: High to Low','sort-desc']];
      if(key==='prevClose') return [...all,['Low to High','sort-asc'],['High to Low','sort-desc']];
      if(key==='priceChange') return [...all,['Highest Gain','sort-desc'],['Lowest / Biggest Fall','sort-asc'],['Positive Only','positive'],['Negative Only','negative']];
      if(key==='score') return [...all,['Highest Score','sort-desc'],['Lowest Score','sort-asc']];
      if(key==='verdict') return [...all,['Accumulation Confirmed','ACCUMULATION CONFIRMED'],['Accumulation Starting','ACCUMULATION STARTING'],['Unconfirmed / Mixed','UNCONFIRMED / MIXED'],['Distribution','DISTRIBUTION']];
      if(key==='volumeRatio') return [...all,['Highest Volume Ratio','sort-desc'],['Lowest Volume Ratio','sort-asc'],['Volume Ratio ≥ 1x','strong'],['Volume Ratio < 1x','weak']];
      if(key==='delivery') return [...all,['Highest Delivery %','sort-desc'],['Lowest Delivery %','sort-asc'],['Delivery ≥ 50%','high'],['Delivery < 50%','low']];
      if(key==='obv') return [...all,['Highest OBV','sort-desc'],['Lowest OBV','sort-asc'],['Positive OBV','positive'],['Negative OBV','negative']];
      if(key==='changeOi') return [...all,['Highest OI Increase','sort-desc'],['Lowest OI Change','sort-asc'],['OI Increasing','up'],['OI Decreasing','down'],['OI Not Available','na']];
      return all;
    }

    function open(button,key){
      close();
      menu=document.createElement('div');
      menu.className='simple-filter-menu';
      optionsFor(key).forEach(([label,value])=>{
        const item=document.createElement('button');
        item.type='button';
        item.textContent=label;
        item.addEventListener('click',()=>{
          close();
          if(value==='all'){
            delete state[key];
            apply();
            return;
          }
          if(value==='sort-az'){delete state[key];apply();sortSymbols('asc');return;}
          if(value==='sort-za'){delete state[key];apply();sortSymbols('desc');return;}
          if(value==='sort-asc' || value==='sort-desc'){
            delete state[key];apply();
            const index={price:1,prevClose:2,priceChange:3,score:4,volumeRatio:6,delivery:7,obv:8,changeOi:9}[key];
            sortRows(index,value==='sort-asc'?'asc':'desc',index===9?(row,i)=>{const s=text(row,i);if(s==='N/A')return null;return num(s);}:num);
            return;
          }
          state[key]=value;
          apply();
        });
        menu.appendChild(item);
      });
      const rect=button.getBoundingClientRect();
      document.body.appendChild(menu);
      const width=menu.offsetWidth||210;
      const height=menu.offsetHeight||180;
      menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
      menu.style.top=`${Math.max(8,Math.min(rect.bottom+4,window.innerHeight-height-8))}px`;
    }

    buttons.forEach(button=>button.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      open(button,button.dataset.key);
    },true));
    document.addEventListener('click',close,true);
    document.getElementById('clearFilters')?.addEventListener('click',reset);
  },0));
})(window);
