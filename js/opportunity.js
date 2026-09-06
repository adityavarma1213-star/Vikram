document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('opportunityRadar');
  if (!box) return;

  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
  const money = (v) => { const x = n(v); return x === null ? 'N/A' : `₹${x.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };
  const pct = (v) => { const x = n(v); return x === null ? 'N/A' : `${x.toFixed(1)}%`; };
  const mult = (v) => { const x = n(v); return x === null ? 'N/A' : `${x.toFixed(1)}x`; };
  const safe = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c] || c));
  const getVerdict = r => String(r?.verdict || 'UNCONFIRMED / MIXED').toUpperCase();

  const boot = async () => {
    try {
      if (!window.VIKRAM_DATA_ENGINE?.loadSnapshot) throw new Error('Data engine unavailable');
      const snapshot = await window.VIKRAM_DATA_ENGINE.loadSnapshot();
      const source = Array.isArray(snapshot.results) ? snapshot.results : [];
      const rows = source
        .filter(r => n(r.score) !== null && getVerdict(r) !== 'DISTRIBUTION')
        .map(r => {
          const m = r.metrics || {};
          return {
            symbol: String(r.symbol || r.ticker || 'N/A'),
            price: n(m.close ?? m.last_price),
            score: n(r.score),
            today: n(m.priceChangePct),
            volume: n(m.volumeRatio),
            delivery: n(m.deliveryPct),
            oi: n(m.changeOi),
            verdict: getVerdict(r),
            why: Array.isArray(r.why) && r.why.length ? r.why.slice(0,2).join(' · ') : 'Scanner evidence available'
          };
        });

      const strength = r => r.score + (r.verdict === 'ACCUMULATION CONFIRMED' ? 20 : r.verdict === 'ACCUMULATION STARTING' ? 10 : 0);
      const state = { symbol:'', score:'all', today:'all', volume:'all', delivery:'all', oi:'all', verdict:'all', sort:'rank' };

      const menuOptions = {
        rank: [['Best First','rank'],['Score Highest','score-desc'],['Score Lowest','score-asc']],
        symbol: [['All','all'],['A–Z','symbol-asc'],['Z–A','symbol-desc']],
        price: [['All','all'],['Low to High','price-asc'],['High to Low','price-desc']],
        score: [['All','all'],['70+ Strong','high'],['Below 70','low'],['Highest First','score-desc'],['Lowest First','score-asc']],
        today: [['All','all'],['Positive Today','pos'],['Negative Today','neg']],
        volume: [['All','all'],['1.2x+ Strong','strong'],['Highest First','volume-desc'],['Lowest First','volume-asc']],
        delivery: [['All','all'],['50%+ Strong','strong'],['Highest First','delivery-desc'],['Lowest First','delivery-asc']],
        oi: [['All','all'],['OI Increasing','up'],['OI Decreasing','down'],['OI Not Available','na'],['Highest First','oi-desc'],['Lowest First','oi-asc']],
        verdict: [['All','all'],['Accumulation Confirmed','ACCUMULATION CONFIRMED'],['Accumulation Starting','ACCUMULATION STARTING'],['Unconfirmed / Mixed','UNCONFIRMED / MIXED']]
      };

      const matches = r => {
        if (state.symbol && !r.symbol.toUpperCase().includes(state.symbol.toUpperCase())) return false;
        if (state.score === 'high' && r.score < 70) return false;
        if (state.score === 'low' && r.score >= 70) return false;
        if (state.today === 'pos' && !(r.today !== null && r.today >= 0)) return false;
        if (state.today === 'neg' && !(r.today !== null && r.today < 0)) return false;
        if (state.volume === 'strong' && !(r.volume !== null && r.volume >= 1.2)) return false;
        if (state.delivery === 'strong' && !(r.delivery !== null && r.delivery >= 50)) return false;
        if (state.oi === 'up' && !(r.oi !== null && r.oi > 0)) return false;
        if (state.oi === 'down' && !(r.oi !== null && r.oi < 0)) return false;
        if (state.oi === 'na' && r.oi !== null) return false;
        if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
        return true;
      };

      const sorted = list => [...list].sort((a,b) => {
        if (state.sort === 'rank') return strength(b) - strength(a) || b.score - a.score;
        const [field, dir] = state.sort.split('-');
        if (field === 'symbol') return dir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
        const av = field === 'score' ? a.score : field === 'price' ? a.price : field === 'volume' ? a.volume : field === 'delivery' ? a.delivery : field === 'oi' ? a.oi : a.today;
        const bv = field === 'score' ? b.score : field === 'price' ? b.price : field === 'volume' ? b.volume : field === 'delivery' ? b.delivery : field === 'oi' ? b.oi : b.today;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return dir === 'asc' ? av - bv : bv - av;
      });

      box.innerHTML = `
        <div class="dashboard-card opportunity-card">
          <div class="opportunity-heading">
            <div><div class="opportunity-kicker">VIKRAM DISCOVERY</div><h2 class="card-headline">Opportunity Radar</h2><p class="opportunity-subtitle">Stocks with stronger accumulation evidence, ranked for further research.</p></div>
            <div class="opportunity-status"><span></span><strong>${safe(snapshot.dataStatus || (snapshot.status === 'ok' ? 'EOD VERIFIED' : 'DATA N/A'))}</strong><small>As of ${safe(snapshot.asOf || 'N/A')}</small></div>
          </div>
          <div class="opportunity-guide"><div><b>CONFIRMED</b><span>Stronger evidence</span></div><div><b>STARTING</b><span>Early evidence</span></div><div class="op-count"></div></div>
          <div class="opportunity-table-wrap">
            <table class="opportunity-table">
              <thead><tr>
                <th><button class="op-filter" data-key="rank">RANK</button></th>
                <th><button class="op-filter" data-key="symbol">STOCK</button></th>
                <th><button class="op-filter" data-key="price">PRICE</button></th>
                <th><button class="op-filter" data-key="score">SCORE</button></th>
                <th><button class="op-filter" data-key="today">TODAY</button></th>
                <th><button class="op-filter" data-key="volume">VOLUME</button></th>
                <th><button class="op-filter" data-key="delivery">DELIVERY</button></th>
                <th><button class="op-filter" data-key="oi">OI CHANGE</button></th>
                <th><button class="op-filter" data-key="verdict">VERDICT</button></th>
                <th>WHY</th>
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>`;

      const style = document.createElement('style');
      style.textContent = `
        #opportunityRadar .opportunity-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:14px}
        #opportunityRadar .opportunity-kicker{font-size:11px;font-weight:800;letter-spacing:1.4px;color:#6ea8ff;margin-bottom:6px}
        #opportunityRadar .opportunity-heading .card-headline{margin:0 0 5px!important}
        #opportunityRadar .opportunity-subtitle{margin:0;color:#93a0b8;font-size:13px}
        #opportunityRadar .opportunity-status{display:flex;align-items:center;gap:8px;color:#9aa8c1;font-size:12px;white-space:nowrap}
        #opportunityRadar .opportunity-status span{width:8px;height:8px;border-radius:50%;background:#36c98f;box-shadow:0 0 0 4px rgba(54,201,143,.12)}
        #opportunityRadar .opportunity-status small{color:#71809b}
        #opportunityRadar .opportunity-guide{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
        #opportunityRadar .opportunity-guide>div{background:#151e33;border:1px solid #293650;border-radius:999px;padding:7px 11px;color:#aebbd0;font-size:12px}
        #opportunityRadar .opportunity-guide b{color:#eef3fc;margin-right:5px}
        #opportunityRadar .op-count{margin-left:auto}
        #opportunityRadar .opportunity-table-wrap{height:calc(100vh - 245px);min-height:560px;overflow:auto;border:1px solid #26324d;border-radius:14px;background:#0d1424}
        #opportunityRadar .opportunity-table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;color:#e8edf7;font-size:13px}
        #opportunityRadar .opportunity-table th{position:sticky;top:0;z-index:30;background:#151e33;border-bottom:1px solid #2b3854;padding:0;height:48px}
        #opportunityRadar .opportunity-table td{background:#0f1729;color:#e8edf7;border-bottom:1px solid #202b43;padding:9px 12px;height:44px;vertical-align:middle}
        #opportunityRadar .opportunity-table tbody tr:hover td{background:#15213a}
        #opportunityRadar .op-filter{width:100%;height:48px;border:0;background:transparent;color:#9aa8c1;text-align:left;padding:0 11px;font-size:10px;font-weight:800;letter-spacing:.7px;cursor:pointer}
        #opportunityRadar .op-filter:after{content:'⌄';float:right;color:#71809b}
        #opportunityRadar .op-filter:hover,#opportunityRadar .op-filter.active{background:#1b2945;color:#78adff}
        #opportunityRadar .price,.opportunity-table .score{font-weight:800}
        #opportunityRadar .why{color:#9aa8c1;font-size:12px;max-width:280px}
        #opportunityRadar .verdict{font-size:11px;font-weight:800;color:#42d29a}
        #opportunityRadar .op-empty{text-align:center;color:#9aa8c1;padding:30px!important}
        .op-menu{position:fixed;z-index:100000;min-width:205px;max-height:320px;overflow:auto;padding:6px;background:#151e33;border:1px solid #34425f;border-radius:10px;box-shadow:0 18px 45px rgba(0,0,0,.5)}
        .op-menu button{display:block;width:100%;border:0;background:transparent;color:#e9eef8;text-align:left;border-radius:7px;padding:10px 12px;font-size:12px;font-weight:650;cursor:pointer}
        .op-menu button:hover{background:#1e2d4a;color:#78adff}
        @media(max-width:800px){#opportunityRadar .opportunity-heading{align-items:flex-start;flex-direction:column}#opportunityRadar .opportunity-table-wrap{height:calc(100vh - 220px);min-height:500px}#opportunityRadar .op-count{margin-left:0}}
      `;
      document.head.appendChild(style);

      const tbody = box.querySelector('.opportunity-table tbody');
      const count = box.querySelector('.op-count');
      const buttons = [...box.querySelectorAll('.op-filter')];
      let menu = null;

      const closeMenu = () => { if (menu) menu.remove(); menu = null; buttons.forEach(b => b.classList.remove('active')); };

      const render = () => {
        const visible = sorted(rows.filter(matches)).slice(0,100);
        tbody.innerHTML = visible.length ? visible.map((r,i) => `<tr><td>${i+1}</td><td><strong>${safe(r.symbol)}</strong></td><td class="price">${money(r.price)}</td><td class="score"><strong>${r.score}</strong></td><td>${pct(r.today)}</td><td>${mult(r.volume)}</td><td>${pct(r.delivery)}</td><td>${r.oi === null ? 'N/A' : r.oi.toLocaleString('en-IN')}</td><td><span class="verdict">${safe(r.verdict)}</span></td><td class="why">${safe(r.why)}</td></tr>`).join('') : '<tr><td colspan="10" class="op-empty">No opportunities match these filters.</td></tr>';
        count.textContent = `${visible.length} shown · ${rows.length} available`;
      };

      buttons.forEach(button => button.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        const key = button.dataset.key;
        menu = document.createElement('div');
        menu.className = 'op-menu';
        (menuOptions[key] || [['All','all']]).forEach(([label,value]) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = label;
          item.addEventListener('click', e2 => {
            e2.preventDefault();
            e2.stopPropagation();
            closeMenu();

            if (key === 'rank') state.sort = value;
            else if (key === 'symbol') { if (value === 'all') state.symbol = ''; else state.sort = value; }
            else if (key === 'price') state.sort = value === 'all' ? 'rank' : value;
            else if (key === 'score') { if (value === 'all' || value === 'high' || value === 'low') state.score = value; else state.sort = value; }
            else if (key === 'today') state.today = value;
            else if (key === 'volume') { if (value === 'all' || value === 'strong') state.volume = value; else state.sort = value; }
            else if (key === 'delivery') { if (value === 'all' || value === 'strong') state.delivery = value; else state.sort = value; }
            else if (key === 'oi') { if (['all','up','down','na'].includes(value)) state.oi = value; else state.sort = value; }
            else if (key === 'verdict') state.verdict = value;
            render();
          });
          menu.appendChild(item);
        });
        document.body.appendChild(menu);
        button.classList.add('active');
        const rect = button.getBoundingClientRect();
        const w = Math.min(menu.offsetWidth || 210, window.innerWidth - 16);
        const h = Math.min(menu.offsetHeight || 220, window.innerHeight - 16);
        menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - h - 8))}px`;
      });

      document.addEventListener('click', e => { if (menu && !e.target.closest('.op-menu') && !e.target.closest('.op-filter')) closeMenu(); });
      box.querySelector('.opportunity-table-wrap')?.addEventListener('scroll', closeMenu, {passive:true});
      window.addEventListener('resize', closeMenu);
      render();
    } catch (error) {
      console.error('VIKRAM Opportunity Radar:', error);
      box.innerHTML = '<div class="dashboard-card opportunity-card"><h2 class="card-headline">Opportunity Radar</h2><p class="opportunity-subtitle">Unable to load the verified scanner snapshot.</p></div>';
    }
  };

  boot();
});
