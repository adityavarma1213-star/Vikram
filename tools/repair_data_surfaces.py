from pathlib import Path

APP = Path('js/app.js')
MARKER = '/* VIKRAM DATA SURFACES REPAIR 2026-09-06 */'
text = APP.read_text(encoding='utf-8')
if MARKER in text:
    raise SystemExit('data surfaces repair already present')

block = r'''
  /* VIKRAM DATA SURFACES REPAIR 2026-09-06 */
  const renderVerifiedDataSurfaces = async () => {
    const surface = document.querySelector('.scanner-container-surface');
    if (!surface) return;
    let response;
    try { response = await fetch('data/scanner.json', { cache: 'no-store' }); } catch (_) { return; }
    if (!response?.ok) return;
    const snapshot = await response.json();
    if (snapshot?.dataStatus !== 'EOD VERIFIED' || !Array.isArray(snapshot.results)) return;

    const tbody = surface.querySelector('.scanner-table tbody');
    if (tbody) {
      const fmt = (value, digits=2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : 'N/A';
      const pct = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : 'N/A';
      const ratio = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}x` : 'N/A';
      const oi = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : 'N/A';
      const trend = value => { const n=Number(value); return Number.isFinite(n) ? (n>0?'Rising':n<0?'Falling':'Flat') : 'N/A'; };
      const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
      tbody.innerHTML = snapshot.results.map(item => {
        const symbol = String(item.symbol || item.ticker || item.stock || '').toUpperCase();
        const name = item.name || item.companyName || item.company_name || symbol;
        const m = item.metrics || {};
        const score = Number.isFinite(Number(item.score)) ? Number(item.score).toFixed(1).replace(/\.0$/,'') : 'N/A';
        return `<tr data-symbol="${esc(symbol)}"><td><div>${esc(name)}</div><div>${esc(symbol)}</div></td><td>₹${fmt(m.close,2)}</td><td>${pct(m.priceChangePct)}</td><td>${score}</td><td>${ratio(m.volumeRatio)}</td><td>${pct(m.deliveryPct)}</td><td>${esc(trend(m.obvTrend))}</td><td>${oi(m.changeOi)}</td><td>${esc(item.verdict || 'N/A')}</td></tr>`;
      }).join('');
      tbody.dispatchEvent(new Event('vikram:rows-rendered'));
    }

    const renderDerived = (title, mode) => {
      const heading = [...document.querySelectorAll('h1,h2,h3,h4')].find(el => el.textContent.trim() === title);
      if (!heading) return;
      const card = heading.parentElement?.parentElement || heading.parentElement;
      if (!card || card.dataset.vikramDerivedSurface === mode) return;
      card.dataset.vikramDerivedSurface = mode;
      const candidates = snapshot.results.filter(item => {
        const m=item.metrics||{}, score=Number(item.score), change=Number(m.priceChangePct), delivery=Number(m.deliveryPct), obv=Number(m.obvTrend);
        const verdict=String(item.verdict||'').toUpperCase();
        if (!Number.isFinite(score) || score < 75 || verdict.includes('DISTRIBUTION')) return false;
        if (mode === 'hidden') return delivery >= 45 && obv > 0;
        return change > 0 && (verdict.includes('CONFIRMED') || verdict.includes('STARTING') || verdict.includes('QUIET'));
      }).sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,8);
      const box=document.createElement('div');
      box.className='vikram-derived-surface';
      box.style.cssText='margin-top:18px;display:grid;gap:8px';
      if (!candidates.length) {
        box.innerHTML='<div style="padding:12px;border:1px dashed var(--border-subtle);border-radius:10px;color:var(--text-muted);font-size:11px">No verified candidates meet the current scanner evidence requirements.</div>';
      } else {
        box.innerHTML=candidates.map(item=>{const m=item.metrics||{};return `<div style="display:grid;grid-template-columns:1.4fr .7fr .7fr .8fr;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:9px"><strong>${String(item.symbol||item.ticker||'').toUpperCase()}</strong><span>Score ${Number(item.score).toFixed(1)}</span><span>${Number(m.priceChangePct).toFixed(2)}%</span><span>${String(item.verdict||'').replace('ACCUMULATION ','')}</span></div>`}).join('');
      }
      card.appendChild(box);
    };
    renderDerived('Hidden Gems','hidden');
    renderDerived('Opportunity Radar','radar');
  };
'''

needle = "  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot(); } catch (_) {}"
if needle not in text:
    raise SystemExit('app.js insertion point not found')
text = text.replace(needle, block + '\n' + needle, 1)
text = text.replace("let activeTab = 'Top Opportunities';", "let activeTab = 'All Stocks';", 1)
text = text.replace("set('overviewVikramScore', m.vikramScore);", "set('overviewVikramScore', m.vikramScore ?? m.accumulationScore);\n      if (!m.vikramScore && m.accumulationScore != null) { const label = document.getElementById('overviewVikramScore')?.previousElementSibling; if (label) label.textContent = 'Accumulation Score'; }", 1)
needle2 = "  await setupColumnFilters();"
if needle2 not in text:
    raise SystemExit('column filter insertion point not found')
text = text.replace(needle2, needle2 + "\n  await renderVerifiedDataSurfaces();", 1)
APP.write_text(text, encoding='utf-8')
