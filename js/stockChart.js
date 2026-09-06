(() => {
  'use strict';

  const modalId = 'vikramStockChartModal';
  const esc = (value) => String(value ?? '').replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c] || c));
  const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
  const dateOnly = (value) => String(value || '').slice(0, 10);

  function ensureModal() {
    if (document.getElementById(modalId)) return document.getElementById(modalId);
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.innerHTML = `
      <div class="vikram-chart-backdrop" data-chart-close></div>
      <section class="vikram-chart-dialog" role="dialog" aria-modal="true" aria-labelledby="vikramChartTitle">
        <button type="button" class="vikram-chart-close" data-chart-close aria-label="Close stock chart">×</button>
        <div class="vikram-chart-header">
          <div>
            <div class="vikram-chart-kicker">VIKRAM VERIFIED PRICE HISTORY</div>
            <h2 id="vikramChartTitle">Stock Chart</h2>
            <p id="vikramChartMeta">Loading verified history…</p>
          </div>
        </div>
        <div id="vikramChartBody" class="vikram-chart-body">
          <div class="vikram-chart-loading">Loading verified market history…</div>
        </div>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-chart-close]')) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
    return modal;
  }

  function close() {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
    document.body.classList.remove('vikram-chart-open');
  }

  function drawChart(points, symbol) {
    const width = 980;
    const height = 390;
    const pad = { left: 68, right: 22, top: 24, bottom: 54 };
    const values = points.map(p => p.close).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.max(max * 0.02, 1);
    const yMin = min - span * 0.08;
    const yMax = max + span * 0.08;
    const x = i => pad.left + (i / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
    const y = value => height - pad.bottom - ((value - yMin) / (yMax - yMin)) * (height - pad.top - pad.bottom);
    const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(p.close).toFixed(2)}`).join(' ');
    const grid = [0, 0.25, 0.5, 0.75, 1].map(r => {
      const gy = pad.top + r * (height - pad.top - pad.bottom);
      const value = yMax - r * (yMax - yMin);
      return `<line x1="${pad.left}" x2="${width-pad.right}" y1="${gy}" y2="${gy}" class="chart-grid"/><text x="${pad.left-10}" y="${gy+4}" text-anchor="end" class="chart-axis">₹${value.toLocaleString('en-IN',{maximumFractionDigits:2})}</text>`;
    }).join('');
    const labels = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v,i,a) => a.indexOf(v) === i).map(i => `<text x="${x(i)}" y="${height-20}" text-anchor="middle" class="chart-axis">${esc(points[i].date.slice(5))}</text>`).join('');
    const first = points[0]?.close;
    const last = points[points.length - 1]?.close;
    const change = Number.isFinite(first) && first !== 0 ? ((last - first) / first) * 100 : null;
    const changeText = change === null ? 'N/A' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

    return `
      <div class="vikram-chart-stats">
        <div><span>Latest Close</span><strong>₹${last.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
        <div><span>Period Change</span><strong>${changeText}</strong></div>
        <div><span>Verified Sessions</span><strong>${points.length}</strong></div>
        <div><span>As Of</span><strong>${esc(points[points.length-1].date)}</strong></div>
      </div>
      <div class="vikram-chart-scroll">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="${esc(symbol)} verified closing price chart">
          ${grid}
          <path d="${path}" class="chart-line" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${x(points.length-1)}" cy="${y(last)}" r="5" class="chart-point"/>
          ${labels}
        </svg>
      </div>
      <p class="vikram-chart-footnote">Source: VIKRAM stored NSE market-history files. Only rows with a verified trade date and numeric close are plotted; unavailable sessions are omitted rather than substituted.</p>`;
  }

  async function fetchHistory(symbol, asOf) {
    const end = new Date(`${dateOnly(asOf)}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) throw new Error('INVALID_AS_OF');
    const dates = [];
    for (let i = 0; i < 45; i += 1) {
      const d = new Date(end);
      d.setUTCDate(end.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const rows = [];
    const chunkSize = 8;
    for (let i = 0; i < dates.length; i += chunkSize) {
      const chunk = dates.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map(async date => {
        try {
          const response = await fetch(`data/market-history/${date}.json`, { cache: 'no-store' });
          if (!response.ok) return null;
          const snapshot = await response.json();
          if (dateOnly(snapshot.tradeDate) !== date || !Array.isArray(snapshot.cm)) return null;
          const row = snapshot.cm.find(item => String(item.symbol || '').toUpperCase() === symbol);
          const close = num(row?.close);
          const tradeDate = dateOnly(row?.trade_date);
          return close !== null && tradeDate === date ? { date, close } : null;
        } catch (_) {
          return null;
        }
      }));
      results.filter(Boolean).forEach(row => rows.push(row));
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  }

  async function open(symbol, asOf) {
    const normalized = String(symbol || '').trim().toUpperCase();
    if (!normalized) return;
    const modal = ensureModal();
    const body = modal.querySelector('#vikramChartBody');
    const title = modal.querySelector('#vikramChartTitle');
    const meta = modal.querySelector('#vikramChartMeta');
    title.textContent = `${normalized} — Price Chart`;
    meta.textContent = 'Verified NSE EOD history · loading…';
    body.innerHTML = '<div class="vikram-chart-loading">Loading verified market history…</div>';
    modal.classList.add('open');
    document.body.classList.add('vikram-chart-open');

    try {
      const points = await fetchHistory(normalized, asOf);
      if (points.length < 2) throw new Error('INSUFFICIENT_HISTORY');
      meta.textContent = `Verified NSE EOD history · ${points[0].date} to ${points[points.length - 1].date}`;
      body.innerHTML = drawChart(points, normalized);
    } catch (error) {
      body.innerHTML = `<div class="vikram-chart-empty"><strong>Chart unavailable</strong><p>Verified historical data for ${esc(normalized)} is not sufficient to draw a chart right now.</p><p>VIKRAM will not substitute simulated, random, or stale prices.</p></div>`;
    }
  }

  window.VIKRAM_STOCK_CHART = { open, close };
})();
