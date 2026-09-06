document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('opportunityRadar');
  if (!box) return;

  const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const money = (value) => {
    const n = number(value);
    return n === null ? 'N/A' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const percent = (value) => {
    const n = number(value);
    return n === null ? 'N/A' : `${n.toFixed(1)}%`;
  };
  const multiple = (value) => {
    const n = number(value);
    return n === null ? 'N/A' : `${n.toFixed(1)}x`;
  };
  const safe = (value) => String(value ?? '').replace(/[&<>\"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c] || c));

  const render = (snapshot) => {
    const rows = Array.isArray(snapshot?.results) ? snapshot.results : [];
    const candidates = rows
      .filter((row) => number(row?.score) !== null && String(row?.verdict || '').toUpperCase() !== 'DISTRIBUTION')
      .sort((a, b) => (number(b.score) || 0) - (number(a.score) || 0))
      .slice(0, 50);

    const status = snapshot?.dataStatus || (snapshot?.status === 'ok' ? 'EOD VERIFIED' : 'DATA N/A');
    const asOf = snapshot?.asOf || 'N/A';

    box.innerHTML = `
      <div class="dashboard-card opportunity-card">
        <div class="opportunity-heading">
          <div>
            <div class="opportunity-kicker">VIKRAM DISCOVERY</div>
            <h2 class="card-headline">Opportunity Radar</h2>
            <p class="opportunity-subtitle">Stocks with stronger accumulation evidence, ranked for further research.</p>
          </div>
          <div class="opportunity-status"><span></span><strong>${safe(status)}</strong><small>As of ${safe(asOf)}</small></div>
        </div>

        <div class="opportunity-guide">
          <div><b>CONFIRMED</b><span>Stronger evidence</span></div>
          <div><b>STARTING</b><span>Early evidence</span></div>
          <div><b>SCORE</b><span>Scanner strength</span></div>
        </div>

        ${candidates.length ? `
        <div class="opportunity-table-wrap">
          <table class="opportunity-table">
            <thead><tr>
              <th>Rank</th><th>Stock</th><th>Price</th><th>Score</th><th>Today</th>
              <th>Volume</th><th>Delivery</th><th>OI Change</th><th>Verdict</th><th>Why</th>
            </tr></thead>
            <tbody>
              ${candidates.map((row, index) => {
                const m = row.metrics || {};
                const verdict = String(row.verdict || 'UNCONFIRMED / MIXED');
                const why = Array.isArray(row.why) && row.why.length ? row.why.slice(0, 2).join(' · ') : 'Scanner evidence available';
                const verdictClass = verdict.toUpperCase().includes('CONFIRMED') ? 'confirmed' : verdict.toUpperCase().includes('STARTING') ? 'starting' : 'mixed';
                return `<tr>
                  <td class="rank">${index + 1}</td>
                  <td class="stock"><strong>${safe(row.symbol || row.ticker || 'N/A')}</strong></td>
                  <td class="price">${money(m.close ?? m.last_price)}</td>
                  <td class="score">${number(row.score)}</td>
                  <td>${percent(m.priceChangePct)}</td>
                  <td>${multiple(m.volumeRatio)}</td>
                  <td>${percent(m.deliveryPct)}</td>
                  <td>${number(m.changeOi) === null ? 'N/A' : number(m.changeOi).toLocaleString('en-IN')}</td>
                  <td><span class="verdict ${verdictClass}">${safe(verdict)}</span></td>
                  <td class="why">${safe(why)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `
          <div class="opportunity-empty">
            <div class="empty-icon">◌</div>
            <h3>No Opportunity Radar candidates yet</h3>
            <p>The verified scanner has no qualifying opportunities in the current snapshot.</p>
            <small>Data status: ${safe(status)} · ${safe(asOf)}</small>
          </div>`}
      </div>`;
  };

  const showError = (message) => {
    box.innerHTML = `<div class="dashboard-card opportunity-card opportunity-error"><div class="opportunity-kicker">VIKRAM DISCOVERY</div><h2 class="card-headline">Opportunity Radar</h2><p>${safe(message)}</p><small>Check the verified scanner snapshot and refresh the page.</small></div>`;
  };

  const boot = async () => {
    try {
      if (!window.VIKRAM_DATA_ENGINE || typeof window.VIKRAM_DATA_ENGINE.loadSnapshot !== 'function') {
        throw new Error('VIKRAM data engine is unavailable');
      }
      const snapshot = await window.VIKRAM_DATA_ENGINE.loadSnapshot();
      render(snapshot);
    } catch (error) {
      console.error('VIKRAM Opportunity Radar:', error);
      showError('The Opportunity Radar could not load the verified scanner snapshot.');
    }
  };

  boot();
});
