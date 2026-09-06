document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('hiddenGemsPreview');
  if (!box) return;

  const statusText = (snapshot) => {
    if (snapshot?.dataStatus) return snapshot.dataStatus;
    return snapshot?.status === 'ok' ? 'EOD VERIFIED' : 'DATA N/A';
  };

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const fmt = (value, suffix = '') => {
    const n = num(value);
    return n === null ? 'N/A' : `${n.toFixed(1)}${suffix}`;
  };

  try {
    const snapshot = await window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const rows = Array.isArray(snapshot.results) ? snapshot.results : [];

    const candidates = rows
      .map((row) => {
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
      })
      .filter(({ row, score, signals }) =>
        score !== null &&
        score >= 55 &&
        score < 85 &&
        row.verdict !== 'DISTRIBUTION' &&
        signals >= 2
      )
      .sort((a, b) => {
        if (b.signals !== a.signals) return b.signals - a.signals;
        return b.score - a.score;
      })
      .slice(0, 25);

    box.innerHTML = `
      <div class="dashboard-card">
        <h2 id="hiddenGemsTitle" class="card-headline">💎 Hidden Gems Alpha Discovery</h2>
        <p class="text-muted">${statusText(snapshot)} · As of ${snapshot.asOf || 'N/A'} · ${candidates.length} emerging candidates</p>
        ${candidates.length ? `
          <div class="table-container">
            <table class="metric-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Symbol</th>
                  <th>Score</th>
                  <th>Price %</th>
                  <th>Volume</th>
                  <th>Delivery</th>
                  <th>OI Change</th>
                  <th>Signals</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                ${candidates.map(({ row, m, score, signals }, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td><strong>${row.symbol || 'N/A'}</strong></td>
                    <td>${score}</td>
                    <td>${fmt(m.priceChangePct, '%')}</td>
                    <td>${fmt(m.volumeRatio, 'x')}</td>
                    <td>${fmt(m.deliveryPct, '%')}</td>
                    <td>${m.changeOi == null ? 'N/A' : Number(m.changeOi).toLocaleString('en-IN')}</td>
                    <td>${signals}/5</td>
                    <td>${row.verdict || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-placeholder-view"><p class="placeholder-text">No verified emerging candidates meet the current Hidden Gems rules. This is a data-driven result, not a placeholder.</p></div>'}
      </div>
    `;
  } catch (error) {
    box.innerHTML = '<div class="dashboard-card"><h2 class="card-headline">💎 Hidden Gems Alpha Discovery</h2><p class="text-muted">Data N/A — a verified scanner snapshot is required.</p></div>';
  }
});
