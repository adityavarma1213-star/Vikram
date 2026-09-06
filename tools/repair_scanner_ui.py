from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index = ROOT / 'index.html'
text = index.read_text(encoding='utf-8')
text = text.replace('href="accumulation.html"', 'href="index.html#scannerSurface"')
index.write_text(text, encoding='utf-8')

# The standalone legacy page must not exist; index.html#scannerSurface is the single scanner UI.
(ROOT / 'accumulation.html').unlink(missing_ok=True)

app = ROOT / 'js' / 'app.js'
text = app.read_text(encoding='utf-8')
start = text.index('  const setupColumnFilters = async () => {')
end = text.index('  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot();', start)

replacement = r'''  const setupColumnFilters = async () => {
    const surface = document.querySelector('.scanner-container-surface');
    if (!surface) return;
    const filterControls = surface.querySelector('.filter-controls');
    const segmentBar = surface.querySelector('.vikram-segment-filters');
    if (!filterControls || !segmentBar) return;
    if (segmentBar.parentElement === filterControls) filterControls.parentNode.insertBefore(segmentBar, filterControls);
    filterControls.style.display = 'none';

    if (!document.getElementById('vikramSimpleScannerStyles')) {
      const style = document.createElement('style');
      style.id = 'vikramSimpleScannerStyles';
      style.textContent = `
        .vikram-simple-filter{margin-left:6px;border:1px solid var(--border-subtle);background:var(--bg-card);color:var(--text-main);border-radius:6px;padding:3px 18px 3px 5px;font-size:9px;font-weight:800;max-width:125px;cursor:pointer}
        .vikram-simple-filter:focus{outline:1px solid var(--accent-cyan);border-color:var(--accent-cyan)}
        .vikram-positive{color:#22c55e!important;font-weight:900}.vikram-negative{color:#ef4444!important;font-weight:900}.vikram-neutral{color:#f59e0b!important;font-weight:900}
        .vikram-score-strong{color:#22c55e!important;font-weight:900}.vikram-score-medium{color:#f59e0b!important;font-weight:900}.vikram-score-weak{color:#ef4444!important;font-weight:900}
        .vikram-delivery-strong{color:#22c55e!important;font-weight:900}.vikram-delivery-medium{color:#f59e0b!important;font-weight:900}.vikram-delivery-weak{color:#ef4444!important;font-weight:900}
        .vikram-volume-strong{color:#22c55e!important;font-weight:900}.vikram-volume-normal{color:#f59e0b!important;font-weight:900}.vikram-volume-weak{color:#ef4444!important;font-weight:900}
        .vikram-obv-rising{color:#22c55e!important;font-weight:900}.vikram-obv-flat{color:#f59e0b!important;font-weight:900}.vikram-obv-falling{color:#ef4444!important;font-weight:900}
        .vikram-oi-positive{color:#22c55e!important;font-weight:900}.vikram-oi-negative{color:#ef4444!important;font-weight:900}.vikram-oi-na{color:var(--text-muted)!important}
        .vikram-verdict-confirmed{color:#22c55e!important;font-weight:900}.vikram-verdict-starting{color:#38bdf8!important;font-weight:900}.vikram-verdict-quiet{color:#a855f7!important;font-weight:900}.vikram-verdict-distribution{color:#ef4444!important;font-weight:900}.vikram-verdict-mixed{color:#94a3b8!important;font-weight:900}
      `;
      document.head.appendChild(style);
    }

    let snapshot = await getScannerSnapshot();
    const state = {};
    const config = [
      ['Stock','stock'],['Price','price'],['Change','priceChangePct'],['Score','score'],['Volume','volumeRatio'],['Delivery','deliveryPct'],['OBV Trend','obvTrend'],['Futures OI','changeOi'],['Verdict','verdict']
    ];
    const headers = [...surface.querySelectorAll('.scanner-table thead th')].slice(0, config.length);

    const getSymbol = row => normalizeSymbol(row.querySelector('td div')?.textContent || row.dataset.symbol || row.querySelector('td')?.textContent);
    const valueFor = (item, key) => {
      if (!item) return null;
      if (key === 'price') return Number(item.metrics?.close);
      if (key === 'priceChangePct') return Number(item.metrics?.priceChangePct);
      if (key === 'score') return Number(item.score);
      if (key === 'volumeRatio') return Number(item.metrics?.volumeRatio);
      if (key === 'deliveryPct') return Number(item.metrics?.deliveryPct);
      if (key === 'obvTrend') return Number(item.metrics?.obvTrend);
      if (key === 'changeOi') return Number(item.metrics?.changeOi);
      if (key === 'verdict') return String(item.verdict || '');
      return null;
    };
    const trend = value => { const n=Number(value); return !Number.isFinite(n)?'N/A':n>0?'Rising':n<0?'Falling':'Flat'; };

    const optionsFor = key => {
      const all = [['','All']];
      if (key === 'stock') return all.concat((snapshot?.results||[]).map(r=>{const s=normalizeSymbol(r.symbol||r.ticker||r.stock);return [s,s]}).filter((x,i,a)=>x[0]&&a.findIndex(y=>y[0]===x[0])===i).sort((a,b)=>a[0].localeCompare(b[0])));
      if (key === 'price') return all.concat([['lt100','< ₹100'],['100to500','₹100–₹500'],['500to1000','₹500–₹1,000'],['gt1000','> ₹1,000']]);
      if (key === 'priceChangePct') return all.concat([['positive','Positive'],['negative','Negative'],['flat','Flat']]);
      if (key === 'score') return all.concat([['strong','Strong (75+)'],['medium','Medium (50–74)'],['weak','Weak (<50)']]);
      if (key === 'volumeRatio') return all.concat([['strong','Strong (≥1.20x)'],['normal','Normal (0.80–1.19x)'],['weak','Weak (<0.80x)']]);
      if (key === 'deliveryPct') return all.concat([['strong','Strong (≥55%)'],['medium','Moderate (45–54%)'],['weak','Weak (<45%)']]);
      if (key === 'obvTrend') return all.concat([['Rising','Rising'],['Flat','Flat'],['Falling','Falling'],['N/A','N/A']]);
      if (key === 'changeOi') return all.concat([['positive','Positive'],['negative','Negative'],['na','N/A']]);
      if (key === 'verdict') return all.concat([['ACCUMULATION CONFIRMED','Confirmed'],['ACCUMULATION STARTING','Starting'],['QUIET ABSORPTION','Quiet Absorption'],['DISTRIBUTION','Distribution'],['UNCONFIRMED / MIXED','Mixed']]);
      return all;
    };
    const matches = (value, choice, key) => {
      if (!choice) return true;
      const n = Number(value);
      if (key === 'stock') return normalizeSymbol(value) === choice;
      if (key === 'price') return choice==='lt100'?n<100:choice==='100to500'?n>=100&&n<500:choice==='500to1000'?n>=500&&n<=1000:n>1000;
      if (key === 'priceChangePct') return choice==='positive'?n>0:choice==='negative'?n<0:n===0;
      if (key === 'score') return choice==='strong'?n>=75:choice==='medium'?n>=50&&n<75:n<50;
      if (key === 'volumeRatio') return choice==='strong'?n>=1.2:choice==='normal'?n>=0.8&&n<1.2:n<0.8;
      if (key === 'deliveryPct') return choice==='strong'?n>=55:choice==='medium'?n>=45&&n<55:n<45;
      if (key === 'obvTrend') return trend(value)===choice;
      if (key === 'changeOi') return choice==='positive'?n>0:choice==='negative'?n<0:!Number.isFinite(n);
      if (key === 'verdict') return String(value||'').toUpperCase()===choice;
      return true;
    };

    const applyColumnFilters = () => {
      const resultMap = new Map((snapshot?.results||[]).map(item=>[normalizeSymbol(item.symbol||item.ticker||item.stock),item]));
      surface.querySelectorAll('.scanner-table tbody tr').forEach(row => {
        const symbol=getSymbol(row), item=resultMap.get(symbol);
        const visible=Object.entries(state).every(([key,choice])=>matches(key==='stock'?symbol:valueFor(item,key),choice,key));
        row.classList.toggle('vikram-column-hidden',!visible);
        const cells=row.querySelectorAll('td');
        const change=Number(item?.metrics?.priceChangePct);
        cells[1]?.classList.toggle('vikram-positive',Number.isFinite(change)&&change>0); cells[1]?.classList.toggle('vikram-negative',Number.isFinite(change)&&change<0); cells[1]?.classList.toggle('vikram-neutral',Number.isFinite(change)&&change===0);
        cells[2]?.classList.toggle('vikram-positive',Number.isFinite(change)&&change>0); cells[2]?.classList.toggle('vikram-negative',Number.isFinite(change)&&change<0);
        const score=Number(item?.score); cells[3]?.classList.add(score>=75?'vikram-score-strong':score>=50?'vikram-score-medium':'vikram-score-weak');
        const vol=Number(item?.metrics?.volumeRatio); cells[4]?.classList.add(vol>=1.2?'vikram-volume-strong':vol>=0.8?'vikram-volume-normal':'vikram-volume-weak');
        const del=Number(item?.metrics?.deliveryPct); cells[5]?.classList.add(del>=55?'vikram-delivery-strong':del>=45?'vikram-delivery-medium':'vikram-delivery-weak');
        const ot=trend(item?.metrics?.obvTrend); cells[6]?.classList.add(ot==='Rising'?'vikram-obv-rising':ot==='Falling'?'vikram-obv-falling':'vikram-obv-flat');
        const oi=Number(item?.metrics?.changeOi); cells[7]?.classList.add(Number.isFinite(oi)?oi>0?'vikram-oi-positive':'vikram-oi-negative':'vikram-oi-na');
        const v=String(item?.verdict||'').toUpperCase(); cells[8]?.classList.add(v.includes('CONFIRMED')?'vikram-verdict-confirmed':v.includes('STARTING')?'vikram-verdict-starting':v.includes('QUIET')?'vikram-verdict-quiet':v.includes('DISTRIBUTION')?'vikram-verdict-distribution':'vikram-verdict-mixed');
      });
      surface.querySelectorAll('.vikram-simple-filter').forEach(select=>{if(select.value!==String(state[select.dataset.filterKey]||''))select.value=String(state[select.dataset.filterKey]||'');});
    };

    headers.forEach((th,index)=>{
      const [label,key]=config[index];
      th.dataset.filterKey=key;
      th.querySelectorAll('.vikram-column-filter,.vikram-column-menu').forEach(el=>el.remove());
      let select=th.querySelector('.vikram-simple-filter');
      if(!select){select=document.createElement('select');select.className='vikram-simple-filter';select.dataset.filterKey=key;select.title=`Filter ${label}`;select.setAttribute('aria-label',`Filter ${label}`);th.appendChild(select);}
      select.innerHTML=optionsFor(key).map(([value,labelText])=>`<option value="${String(value).replace(/"/g,'&quot;')}">${labelText}</option>`).join('');
      select.addEventListener('change',()=>{state[key]=select.value;if(!select.value)delete state[key];applyColumnFilters();});
    });

    new MutationObserver(()=>setTimeout(applyColumnFilters,0)).observe(surface.querySelector('.scanner-table-wrap')||surface,{childList:true,subtree:true});
    setInterval(async()=>{const next=await getScannerSnapshot();if(next){snapshot=next;headers.forEach(th=>{const select=th.querySelector('.vikram-simple-filter');select.innerHTML=optionsFor(th.dataset.filterKey).map(([value,labelText])=>`<option value="${String(value).replace(/"/g,'&quot;')}">${labelText}</option>`).join('');});applyColumnFilters();}},60000);
    applyColumnFilters();
  };

'''
text = text[:start] + replacement + text[end:]
app.write_text(text, encoding='utf-8')

assert not (ROOT / 'accumulation.html').exists()
assert 'vikram-simple-filter' in text
assert 'data-apply' not in text
assert 'data-clear' not in text
