document.addEventListener('DOMContentLoaded', async () => {
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value === null || value === undefined || value === '' ? 'N/A' : value;
  };
  const show = id => document.getElementById(id)?.classList.remove('hidden');
  const hide = id => document.getElementById(id)?.classList.add('hidden');

  const render = async ticker => {
    show('companyOverview');
    hide('errorContainer');
    try {
      await window.VIKRAM_DATA_ENGINE.loadSnapshot();
      const data = window.VIKRAM_DATA_ENGINE.analyzeAsset(ticker);
      if (!data) throw new Error(`Ticker ${String(ticker).toUpperCase()} was not found in the verified NSE universe.`);

      const m = data.meta || {};
      const t = data.technical || {};
      set('overviewCompanyName', `${m.name || ticker} · NSE`);
      set('overviewSector', m.sector);
      set('overviewIndustry', m.industry);
      set('overviewExchange', m.exchange || 'NSE');
      set('overviewMarketCap', m.marketCap);

      const row = window.VIKRAM_DATA_ENGINE.find(ticker);
      const metrics = row?.metrics || {};
      set('overviewCurrentPrice', metrics.close == null ? null : `₹${Number(metrics.close).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      set('overview52WeekHigh', t.high52Week == null ? null : `₹${Number(t.high52Week).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      set('overview52WeekLow', t.low52Week == null ? null : `₹${Number(t.low52Week).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      set('overviewVikramScore', m.vikramScore);
      set('overviewRating', m.rating);

      set('techRSI', t.rsi); set('techRSISignal', t.rsiSignal);
      set('techMACD', t.macd); set('techMACDSignal', t.macdSignal);
      set('techADX', t.adx); set('techADXSignal', t.adxSignal);
      set('techEMA20', t.ema20); set('techEMA50', t.ema50); set('techEMA200', t.ema200);
      set('techTrend', t.trend); set('techSupport', t.support); set('techResistance', t.resistance);
      set('techVolume', t.volume); set('techVolumeSignal', t.volumeSignal);
      set('techOBV', t.obv); set('techOBVSignal', t.obvSignal);
      set('techDeliveryPct', t.deliveryPct); set('techDeliverySignal', t.deliverySignal);
      set('tech52WeekHigh', t.high52Week); set('tech52WeekLow', t.low52Week);

      const financialIds = [
        'finRevenueGrowth','finRevenueStability','finEbitdaMargin','finNetProfitMargin','finROE','finROCE',
        'finDebtEquity','finInterestCoverage','finOCF','finFCF','finEPSGrowth','finPromoterHolding',
        'finPromoterPledge','finInstitutionalTrend'
      ];
      const signalIds = financialIds.map(id => `${id}Signal`);
      [...financialIds, ...signalIds].forEach(id => set(id, 'N/A'));
      const financialCard = document.getElementById('financialDashboard');
      if (financialCard) financialCard.setAttribute('data-data-status', 'Financial statement dataset unavailable — no values substituted');
    } catch (error) {
      const err = document.getElementById('errorContainer');
      if (err) {
        err.textContent = error.message;
        err.classList.remove('hidden');
      }
    }
  };

  window.addEventListener('vikram:analyze', event => render(event.detail?.ticker));

  const normalizeSymbol = value => String(value || '').trim().toUpperCase().replace(/\.(NS|NSE)$/i, '');

  const readStoredSymbols = key => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map(item => normalizeSymbol(typeof item === 'string' ? item : item?.symbol || item?.ticker)).filter(Boolean));
    } catch (_) {
      return new Set();
    }
  };

  const getScannerSnapshot = async () => {
    try {
      const response = await fetch('data/scanner.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const snapshot = await response.json();
      return snapshot?.dataStatus === 'EOD VERIFIED' && Array.isArray(snapshot.results) ? snapshot : null;
    } catch (_) {
      return null;
    }
  };

  const getIndexMembership = item => {
    const raw = item?.indices ?? item?.indexMembership ?? item?.indexMemberships ?? {};
    if (Array.isArray(raw)) return new Set(raw.map(value => String(value).toUpperCase().replace(/^NIFTY\s*/,'NIFTY ')));
    if (raw && typeof raw === 'object') {
      return new Set(Object.entries(raw).filter(([, value]) => Boolean(value)).map(([key]) => String(key).toUpperCase().replace(/_/g, ' ')));
    }
    return new Set();
  };

  const ensureSegmentStyles = () => {
    if (document.getElementById('vikramSegmentFilterStyles')) return;
    const style = document.createElement('style');
    style.id = 'vikramSegmentFilterStyles';
    style.textContent = '.vikram-segment-filters{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:0 0 13px}.vikram-segment-pill{border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-muted);border-radius:9px;padding:8px 12px;font-size:10px;font-weight:900;cursor:pointer;height:34px;white-space:nowrap}.vikram-segment-pill:hover,.vikram-segment-pill.active{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--bg-card)}.vikram-market-news{padding:22px;border:1px dashed var(--border-subtle);border-radius:12px;color:var(--text-muted);line-height:1.6;font-size:11px}.vikram-tab-hidden{display:none!important}.vikram-column-hidden{display:none!important}.vikram-column-filter{margin-left:6px;border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px;font-weight:900;padding:2px 4px;border-radius:5px}.vikram-column-filter:hover,.vikram-column-filter.active{background:var(--bg-card);color:var(--accent-cyan)}.vikram-column-menu{position:fixed;z-index:10000;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:11px;box-shadow:var(--shadow-lg);padding:10px;min-width:220px;color:var(--text-main)}.vikram-column-menu .menu-title{font-size:10px;font-weight:900;color:var(--text-main);margin-bottom:8px}.vikram-column-menu input,.vikram-column-menu select{width:100%;box-sizing:border-box;border:1px solid var(--border-subtle);background:var(--bg-card-2);color:var(--text-main);border-radius:7px;padding:7px 8px;font-size:11px;margin-bottom:7px}.vikram-column-menu .range{display:grid;grid-template-columns:1fr 1fr;gap:7px}.vikram-column-menu button{width:100%;border:1px solid transparent;background:transparent;color:var(--text-main);text-align:left;border-radius:7px;padding:7px 8px;font-size:11px;cursor:pointer}.vikram-column-menu button:hover,.vikram-column-menu button.active{background:var(--bg-card-2);color:var(--accent-cyan)}.vikram-column-menu .menu-actions{display:flex;gap:6px;margin-top:3px}.vikram-column-menu .menu-actions button{border-color:var(--border-subtle);text-align:center}.vikram-column-menu .menu-actions .primary{background:var(--accent-cyan);color:var(--bg-page);border-color:var(--accent-cyan);font-weight:900}.vikram-filter-reset{margin-left:auto;border:1px solid var(--border-subtle);background:transparent;color:var(--text-muted);border-radius:9px;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer}.vikram-filter-reset:hover{color:var(--accent-cyan);border-color:var(--accent-cyan)}';
    document.head.appendChild(style);
  };

  const setupScannerSurface = async () => {
    const surface = document.querySelector('.scanner-container-surface');
    if (!surface) return;
    ensureSegmentStyles();

    const filterControls = surface.querySelector('.filter-controls');
    if (!filterControls) return;

    const universeSelect = filterControls.querySelector('#universeFilter');
    if (universeSelect) {
      universeSelect.hidden = true;
      universeSelect.setAttribute('aria-hidden', 'true');
      universeSelect.tabIndex = -1;
    }

    let segmentBar = surface.querySelector('.vikram-segment-filters');
    if (!segmentBar) {
      segmentBar = document.createElement('div');
      segmentBar.className = 'vikram-segment-filters';
      segmentBar.setAttribute('role', 'tablist');
      segmentBar.setAttribute('aria-label', 'Index universe');
      [['ALL','All Stocks'],['NIFTY 50','NIFTY 50'],['NIFTY 200','NIFTY 200'],['NIFTY 500','NIFTY 500']].forEach(([value,label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `vikram-segment-pill${value === 'ALL' ? ' active' : ''}`;
        button.dataset.segment = value;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', value === 'ALL' ? 'true' : 'false');
        button.textContent = label;
        segmentBar.appendChild(button);
      });
      filterControls.insertBefore(segmentBar, filterControls.firstChild);
    }

    let snapshot = await getScannerSnapshot();

    const newsId = 'vikramMarketNewsSurface';
    let newsSurface = document.getElementById(newsId);
    if (!newsSurface) {
      newsSurface = document.createElement('div');
      newsSurface.id = newsId;
      newsSurface.className = 'vikram-market-news vikram-tab-hidden';
      newsSurface.textContent = 'Market News is contextual only. No live news provider is configured in this static EOD build, so no news values are fabricated.';
      const tableWrap = surface.querySelector('.scanner-table-wrap');
      tableWrap?.parentNode.insertBefore(newsSurface, tableWrap);
    }

    let activeSegment = 'ALL';
    let activeTab = 'Top Opportunities';

    const applyFilters = () => {
      const watchlist = readStoredSymbols('vikram_watchlist');
      const portfolio = readStoredSymbols('vikram_portfolio');
      const resultMap = new Map((snapshot?.results || []).map(item => [normalizeSymbol(item.symbol || item.ticker || item.stock), item]));
      const segmentMap = new Map();
      (snapshot?.results || []).forEach(item => segmentMap.set(normalizeSymbol(item.symbol || item.ticker || item.stock), getIndexMembership(item)));

      surface.querySelectorAll('.scanner-table tbody tr').forEach(row => {
        const symbol = normalizeSymbol(row.querySelector('td div')?.textContent || row.dataset.symbol || row.querySelector('td')?.textContent);
        const item = resultMap.get(symbol);
        const memberships = segmentMap.get(symbol) || new Set();
        let visible = true;
        if (activeSegment !== 'ALL') visible = memberships.has(activeSegment);
        if (visible && activeTab === 'Watchlist') visible = watchlist.has(symbol);
        if (visible && activeTab === 'My Portfolio') visible = portfolio.has(symbol);
        if (visible && activeTab === 'Top Opportunities') {
          const verdict = String(item?.verdict || '').toUpperCase();
          const score = Number(item?.score);
          visible = verdict.includes('CONFIRMED') || (Number.isFinite(score) && score >= 75);
        }
        row.classList.toggle('vikram-tab-hidden', !visible);
      });

      const tableWrap = surface.querySelector('.scanner-table-wrap');
      const showNews = activeTab === 'Market News';
      tableWrap?.classList.toggle('vikram-tab-hidden', showNews);
      newsSurface.classList.toggle('vikram-tab-hidden', !showNews);
    };

    segmentBar.addEventListener('click', event => {
      const button = event.target.closest('.vikram-segment-pill');
      if (!button) return;
      activeSegment = button.dataset.segment || 'ALL';
      segmentBar.querySelectorAll('.vikram-segment-pill').forEach(pill => {
        const active = pill === button;
        pill.classList.toggle('active', active);
        pill.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (universeSelect) {
        universeSelect.value = activeSegment;
        universeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      applyFilters();
    });

    surface.querySelectorAll('.surface-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.textContent.trim();
        surface.querySelectorAll('.surface-tab').forEach(other => other.classList.toggle('active', other === tab));
        applyFilters();
      });
    });

    surface.querySelectorAll('.filter-controls select').forEach(select => select.addEventListener('change', () => setTimeout(applyFilters, 0)));
    window.addEventListener('storage', event => {
      if (event.key === 'vikram_watchlist' || event.key === 'vikram_portfolio') applyFilters();
    });
    new MutationObserver(() => applyFilters()).observe(surface.querySelector('.scanner-table-wrap') || surface, { childList: true, subtree: true });
    setInterval(async () => {
      const next = await getScannerSnapshot();
      if (next) { snapshot = next; applyFilters(); }
    }, 60000);
    applyFilters();
  };

  const setupColumnFilters = async () => {
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

  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot(); } catch (_) {}
  await setupScannerSurface();
  await setupColumnFilters();

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = params.get('symbol');
  if (initialSymbol) {
    await render(initialSymbol);
    document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
