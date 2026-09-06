document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('opportunityRadar');
  if (!box) return;

  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const money = (value) => {
    const n = num(value);
    return n === null ? 'N/A' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmt = (value, suffix = '') => {
    const n = num(value);
    return n === null ? 'N/A' : `${n.toFixed(1)}${suffix}`;
  };

  const fmtOi = (value) => {
    const n = num(value);
    return n === null ? 'N/A' : n.toLocaleString('en-IN');
  };

  const statusText = (snapshot) => {
    if (snapshot?.dataStatus) return snapshot.dataStatus;
    return snapshot?.status === 'ok' ? 'EOD VERIFIED' : 'DATA N/A';
  };

  const verdictLabel = (row) => row.verdict || 'UNCONFIRMED / MIXED';

  const opportunityRank = (row) => {
    const score = num(row.score);
    const verdict = verdictLabel(row);
    let bonus = 0;
    if (verdict === 'ACCUMULATION CONFIRMED') bonus = 20;
    else if (verdict === 'ACCUMULATION STARTING') bonus = 10;
    return (score ?? -1) + bonus;
  };

  try {
    const snapshot = await window.VIKRAM_DATA_ENGINE.loadSnapshot();
    const rows = Array.isArray(snapshot.results) ? snapshot.results : [];

    const ranked = rows
      .filter((row) => num(row.score) !== null && verdictLabel(row) !== 'DISTRIBUTION')
      .sort((a, b) => opportunityRank(b) - opportunityRank(a) || num(b.score) - num(a.score))
      .slice(0, 100);

    box.innerHTML = `
      <div class="dashboard-card">
        <h2 class="card-headline">🛰 Opportunity Radar</h2>
        <p class="text-muted">${statusText(snapshot)} · As of ${snapshot.asOf || 'N/A'} · ${ranked.length} opportunities from ${rows.length} verified rows</p>
        <div class="table-container">
          <table class="metric-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Score</th>
                <th>Price %</th>
                <th>Volume</th>
                <th>Delivery</th>
                <th>OI Change</th>
                <th>Verdict</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              ${ranked.map((row, index) => {
                const m = row.metrics || {};
                const why = Array.isArray(row.why) ? row.why.slice(0, 3).join(' ') : '';
                return `<tr>
                  <td>${index + 1}</td>
                  <td><strong>${row.symbol || row.ticker || 'N/A'}</strong></td>
                  <td>${money(m.close ?? m.last_price)}</td>
                  <td>${num(row.score) === null ? 'N/A' : row.score}</td>
                  <td>${fmt(m.priceChangePct, '%')}</td>
                  <td>${fmt(m.volumeRatio, 'x')}</td>
                  <td>${fmt(m.deliveryPct, '%')}</td>
                  <td>${fmtOi(m.changeOi)}</td>
                  <td>${verdictLabel(row)}</td>
                  <td>${why || 'No additional explanation available.'}</td>
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
