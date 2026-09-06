document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('hiddenGemsPreview');
  if (!box) return;

  const statusText = (snapshot) => snapshot?.dataStatus || (snapshot?.status === 'ok' ? 'EOD VERIFIED' : 'DATA N/A');
  const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
  const fmt = (value, suffix = '') => { const n = num(value); return n === null ? 'N/A' : `${n.toFixed(1)}${suffix}`; };
  const fmtPrice = (value) => { const n = num(value); return n === null ? 'N/A' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
  const esc = (value) => String(value ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c] || c));

  try {
    const snapshot = await window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const rows = Array.isArray(snapshot.results) ? snapshot.results : [];

    const candidates = rows.map((row) => {
      const m = row.metrics || {};
      const score = num(row.score);
      const signals = [
        num(m.volumeRatio) !== null && num(m.volumeRatio) >= 1.2,
        num(m.deliveryPct) !== null && num(m.deliveryPct) >= 45,
        num(m.obvTrend) !== null && num(m.obvTrend) > 0,
        num(m.changeOi) !== null && num(m.changeOi) > 0,
        num(m.priceChangePct) !== null && num(m.priceChangePct) >= 0
      ].filter(Boolean).length;
      return { row, m, score, signals };
    }).filter(({ row, score, signals }) =>
      score !== null && score >= 55 && score < 85 && row.verdict !== 'DISTRIBUTION' && signals >= 2
    ).sort((a, b) => b.signals - a.signals || b.score - a.score).slice(0, 25);

    box.innerHTML = `
      <div class="dashboard-card hidden-gems-card">
        <h2 id="hiddenGemsTitle" class="card-headline">💎 Hidden Gems Alpha Discovery</h2>
        <p class="text-muted hidden-gems-meta">${statusText(snapshot)} · As of ${snapshot.asOf || 'N/A'} · ${candidates.length} emerging candidates</p>
        ${candidates.length ? `
          <div class="hidden-gems-table-container">
            <table class="metric-table hidden-gems-table">
              <thead><tr>
                <th><button class="hg-filter" data-key="rank">RANK ▾</button></th>
                <th><button class="hg-filter" data-key="symbol">SYMBOL ▾</button></th>
                <th><button class="hg-filter" data-key="price">PRICE ▾</button></th>
                <th><button class="hg-filter" data-key="score">SCORE ▾</button></th>
                <th><button class="hg-filter" data-key="pricePct">PRICE % ▾</button></th>
                <th><button class="hg-filter" data-key="volume">VOLUME ▾</button></th>
                <th><button class="hg-filter" data-key="delivery">DELIVERY ▾</button></th>
                <th><button class="hg-filter" data-key="oi">OI CHANGE ▾</button></th>
                <th><button class="hg-filter" data-key="signals">SIGNALS ▾</button></th>
                <th><button class="hg-filter" data-key="verdict">VERDICT ▾</button></th>
              </tr></thead>
              <tbody>
                ${candidates.map(({ row, m, score, signals }, index) => `
                  <tr data-symbol="${esc(row.symbol)}" data-price="${num(m.close ?? m.last_price) ?? ''}" data-score="${score}" data-pricepct="${num(m.priceChangePct) ?? ''}" data-volume="${num(m.volumeRatio) ?? ''}" data-delivery="${num(m.deliveryPct) ?? ''}" data-oi="${num(m.changeOi) ?? ''}" data-signals="${signals}" data-verdict="${esc(row.verdict)}">
                    <td>${index + 1}</td>
                    <td><strong>${esc(row.symbol || 'N/A')}</strong></td>
                    <td>${fmtPrice(m.close ?? m.last_price)}</td>
                    <td><b>${score}</b></td>
                    <td>${fmt(m.priceChangePct, '%')}</td>
                    <td>${fmt(m.volumeRatio, 'x')}</td>
                    <td>${fmt(m.deliveryPct, '%')}</td>
                    <td>${m.changeOi == null ? 'N/A' : Number(m.changeOi).toLocaleString('en-IN')}</td>
                    <td>${signals}/5</td>
                    <td>${esc(row.verdict || 'N/A')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-placeholder-view"><p class="placeholder-text">No verified emerging candidates meet the current Hidden Gems rules.</p></div>'}
      </div>`;

    if (!candidates.length) return;

    const style = document.createElement('style');
    style.textContent = `
      .hidden-gems-card{overflow:visible}
      .hidden-gems-meta{margin:.35rem 0 .5rem}
      .hidden-gems-table-container{width:100%;height:calc(100vh - 270px);min-height:520px;max-height:none;overflow-y:auto;overflow-x:hidden;position:relative;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);isolation:isolate}
      .hidden-gems-table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0}
      .hidden-gems-table thead th{position:sticky!important;top:0!important;z-index:50!important;background:#182038!important;box-shadow:0 2px 0 var(--border-color),0 4px 10px rgba(0,0,0,.35);padding:0!important}
      .hidden-gems-table tbody td{padding:7px 9px;line-height:1.1;background:var(--bg-secondary);vertical-align:middle}
      .hidden-gems-table tbody tr{height:43px}
      .hidden-gems-table th:nth-child(1){width:8%}.hidden-gems-table th:nth-child(2){width:14%}.hidden-gems-table th:nth-child(3){width:13%}.hidden-gems-table th:nth-child(4){width:8%}.hidden-gems-table th:nth-child(5){width:10%}.hidden-gems-table th:nth-child(6){width:10%}.hidden-gems-table th:nth-child(7){width:10%}.hidden-gems-table th:nth-child(8){width:12%}.hidden-gems-table th:nth-child(9){width:9%}.hidden-gems-table th:nth-child(10){width:16%}
      .hg-filter{width:100%;min-height:42px;padding:8px 6px;border:0;background:transparent;color:var(--text-primary);font:inherit;font-size:.72rem;font-weight:800;text-align:left;cursor:pointer;white-space:nowrap}
      .hg-filter:hover,.hg-filter.active{background:var(--bg-input);color:var(--accent-color)}
      .hg-menu{position:fixed;z-index:10000;min-width:185px;padding:5px;background:#182038;border:1px solid var(--border-color);border-radius:7px;box-shadow:0 10px 24px rgba(0,0,0,.45)}
      .hg-menu button{display:block;width:100%;padding:9px 11px;border:0;border-radius:5px;background:transparent;color:var(--text-primary);text-align:left;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
      .hg-menu button:hover{background:var(--bg-input);color:var(--accent-color)}
      @media(max-width:800px){.hidden-gems-table-container{height:calc(100vh - 230px);min-height:480px}.hidden-gems-table{font-size:.68rem}.hidden-gems-table tbody td{padding:6px 4px}.hg-filter{font-size:.6rem;min-height:38px}}
    `;
    document.head.appendChild(style);

    const table = box.querySelector('.hidden-gems-table');
    const tbody = table.querySelector('tbody');
    const buttons = [...table.querySelectorAll('.hg-filter')];
    let menu = null;
    let active = {};

    const close = () => { if (menu) { menu.remove(); menu = null; } buttons.forEach(b => b.classList.remove('active')); };
    const getNum = (row, key) => num(row.dataset[key]);
    const apply = () => {
      [...tbody.rows].forEach(row => {
        let show = true;
        for (const [key, value] of Object.entries(active)) {
          if (key === 'symbol' && !row.dataset.symbol.toUpperCase().includes(value)) show = false;
          if (key === 'verdict' && row.dataset.verdict !== value) show = false;
          if (key === 'price' && value === 'positive' && !(getNum(row,'price') > 0)) show = false;
          if (key === 'pricePct' && value === 'positive' && !(getNum(row,'pricepct') >= 0)) show = false;
          if (key === 'pricePct' && value === 'negative' && !(getNum(row,'pricepct') < 0)) show = false;
          if (key === 'score' && value === 'high' && !(getNum(row,'score') >= 70)) show = false;
          if (key === 'score' && value === 'low' && !(getNum(row,'score') < 70)) show = false;
          if (key === 'volume' && value === 'strong' && !(getNum(row,'volume') >= 1.2)) show = false;
          if (key === 'delivery' && value === 'strong' && !(getNum(row,'delivery') >= 50)) show = false;
          if (key === 'oi' && value === 'up' && !(getNum(row,'oi') > 0)) show = false;
          if (key === 'oi' && value === 'down' && !(getNum(row,'oi') < 0)) show = false;
          if (key === 'oi' && value === 'na' && getNum(row,'oi') !== null) show = false;
          if (key === 'signals' && value === 'high' && !(getNum(row,'signals') >= 4)) show = false;
        }
        row.style.display = show ? '' : 'none';
      });
    };
    const sortBy = (field, direction) => {
      const rows = [...tbody.rows];
      rows.sort((a,b) => {
        const av = field === 'symbol' ? a.dataset.symbol : getNum(a, field);
        const bv = field === 'symbol' ? b.dataset.symbol : getNum(b, field);
        if (typeof av === 'string') return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return direction === 'asc' ? av-bv : bv-av;
      });
      rows.forEach(r => tbody.appendChild(r));
    };
    const options = {
      rank:[['All','all'],['Top to Bottom','rank-desc']],
      symbol:[['All','all'],['A–Z','sort-symbol-asc'],['Z–A','sort-symbol-desc']],
      price:[['All','all'],['Low to High','sort-price-asc'],['High to Low','sort-price-desc']],
      score:[['All','all'],['Highest First','sort-score-desc'],['Lowest First','sort-score-asc'],['70+ Scores','high'],['Below 70','low']],
      pricePct:[['All','all'],['Positive Only','positive'],['Negative Only','negative']],
      volume:[['All','all'],['Highest First','sort-volume-desc'],['Lowest First','sort-volume-asc'],['1.2x or More','strong']],
      delivery:[['All','all'],['Highest First','sort-delivery-desc'],['Lowest First','sort-delivery-asc'],['50% or More','strong']],
      oi:[['All','all'],['Highest First','sort-oi-desc'],['Lowest First','sort-oi-asc'],['OI Increasing','up'],['OI Decreasing','down'],['OI Not Available','na']],
      signals:[['All','all'],['Highest First','sort-signals-desc'],['4/5 or More','high']],
      verdict:[['All','all'],['Accumulation Starting','ACCUMULATION STARTING'],['Accumulation Confirmed','ACCUMULATION CONFIRMED']]
    };
    buttons.forEach(button => button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation(); close();
      menu = document.createElement('div'); menu.className = 'hg-menu';
      const key = button.dataset.key;
      (options[key] || [['All','all']]).forEach(([label,value]) => {
        const item = document.createElement('button'); item.type='button'; item.textContent=label;
        item.addEventListener('click', () => {
          if(value === 'all') delete active[key];
          else if(value.startsWith('sort-')) { delete active[key]; const parts=value.split('-'); sortBy(parts[1],parts[2]); }
          else if(key === 'rank' && value === 'rank-desc') { delete active[key]; sortBy('score','desc'); }
          else active[key]=value;
          close(); apply();
        });
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      const rect=button.getBoundingClientRect(), width=Math.min(menu.offsetWidth||210,window.innerWidth-16), height=menu.offsetHeight||180;
      menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
      menu.style.top=`${Math.max(8,Math.min(rect.bottom+4,window.innerHeight-height-8))}px`;
    }, true));
    document.addEventListener('click', event => { if(menu && !event.target.closest('.hg-menu') && !event.target.closest('.hg-filter')) close(); });
    table.closest('.hidden-gems-table-container')?.addEventListener('scroll', close, {passive:true});
    window.addEventListener('resize', close);
  } catch (error) {
    box.innerHTML = '<div class="dashboard-card"><h2 class="card-headline">💎 Hidden Gems Alpha Discovery</h2><p class="text-muted">Data N/A — a verified scanner snapshot is required.</p></div>';
  }
});
