document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('opportunityRadar');
  if (!box) return;

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const fmt = (value, suffix = '') => {
    const n = num(value);
    return n === null ? 'N/A' : `${n.toFixed(1)}${suffix}`;
  };

  const statusText = (snapshot) => {
    if (snapshot?.dataStatus) return snapshot.dataStatus;
    return snapshot?.status === 'ok' ? 'EOD VERIFIED' : 'DATA N/A';
  };

  try {
    const snapshot = await window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const rows = Array.isArray(snapshot.results) ? snapshot.results : [];

    const ranked = rows
      .filter((row) => num(row.score) !== null)
      .sort((a, b) => num(b.score) - num(a.score))
      .slice(0, 100);

    box.innerHTML = `
      <div class="dashboard-card">
        <h2 class="card-headline">🛰 Opportunity Radar</h2>
        <p class="text-muted">${statusText(snapshot)} · As of ${snapshot.asOf || 'N/A'} · ${rows.length} verified rows</p>
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
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              ${ranked.map((row, index) => {
                const m = row.metrics || {};
                return `<tr>
                  <td>${index + 1}</td>
                  <td><strong>${row.symbol || row.ticker || 'N/A'}</strong></td>
                  <td>${num(row.score) === null ? 'N/A' : row.score}</td>
                  <td>${fmt(m.priceChangePct, '%')}</td>
                  <td>${fmt(m.volumeRatio, 'x')}</td>
                  <td>${fmt(m.deliveryPct, '%')}</td>
                  <td>${m.changeOi == null ? 'N/A' : Number(m.changeOi).toLocaleString('en-IN')}</td>
                  <td>${row.verdict || 'N/A'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    box.innerHTML = '<div class="dashboard-card"><h2 class="card-headline">🛰 Opportunity Radar</h2><p class="text-muted">Data N/A — a verified scanner snapshot is required.</p></div>';
  }
});
