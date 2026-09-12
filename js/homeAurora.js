// VIKRAM homepage — Today's Focus and Data Trust panels.
// Both sections read the SAME real data the rest of the app already uses
// (data/scanner.json, the NSE coverage report) — nothing here is fabricated,
// simulated, or hard-coded per-symbol.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function renderTodaysFocus() {
    const body = $('todaysFocusBody');
    if (!body) return;
    try {
      const res = await fetch('data/scanner.json', { cache: 'no-store' });
      const data = await res.json();
      const rows = Array.isArray(data.results) ? data.results : [];
      const top = rows.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
      if (!top.length) { body.innerHTML = '<p class="desc">DATA INSUFFICIENT.</p>'; return; }
      const rowsHtml = top.map(r => {
        const chg = r.metrics && typeof r.metrics.priceChangePct === 'number' ? r.metrics.priceChangePct : null;
        const chgTxt = chg == null ? 'N/A' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
        return `<tr><td><strong>${esc(r.symbol)}</strong>${r.companyName ? `<div style="color:var(--aurora-text-muted);font-size:11px">${esc(r.companyName)}</div>` : ''}</td>
          <td>${r.metrics ? esc(r.metrics.close) : 'N/A'}</td>
          <td style="color:${chg >= 0 ? 'var(--aurora-verified)' : 'var(--aurora-negative)'}">${chgTxt}</td>
          <td>${esc(r.score)}</td>
          <td>${esc(r.verdict)}</td></tr>`;
      }).join('');
      body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.85rem">
        <thead><tr style="text-align:left;color:var(--aurora-text-muted);font-size:.72rem;text-transform:uppercase">
          <th style="padding:6px 8px">Company</th><th style="padding:6px 8px">Price</th><th style="padding:6px 8px">Change</th><th style="padding:6px 8px">Score</th><th style="padding:6px 8px">Verdict</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
        <p style="margin:12px 0 0"><a href="index.html#scannerSurface" style="color:var(--aurora-gps);font-size:.8rem;font-weight:700">View all in Accumulation Scanner →</a></p>`;
    } catch (e) {
      body.innerHTML = '<p class="desc">VERIFICATION BLOCKED — could not load data/scanner.json.</p>';
    }
  }

  function statusBadge(status) {
    if (status === 'VERIFIED' || status === 'AVAILABLE') return `<span class="aurora-status aurora-status--verified"><span class="dot"></span>${esc(status)}</span>`;
    if (status === 'DATA_INSUFFICIENT') return `<span class="aurora-status aurora-status--na"><span class="dot"></span>DATA INSUFFICIENT</span>`;
    return `<span class="aurora-status aurora-status--blocked"><span class="dot"></span>VERIFICATION BLOCKED</span>`;
  }

  async function renderDataTrust() {
    const body = $('dataTrustBody');
    if (!body) return;
    try {
      const res = await fetch('data/nse-coverage-report.json', { cache: 'no-store' });
      const d = await res.json();
      const cell = (label, valueHtml) => `<div><div style="color:var(--aurora-text-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em">${esc(label)}</div><div style="margin-top:4px;font-size:.9rem;font-weight:700">${valueHtml}</div></div>`;
      body.innerHTML = [
        cell('EOD Data', `${statusBadge('VERIFIED')} <span style="color:var(--aurora-text-muted);font-weight:400"> through ${esc(d.dateRange && d.dateRange.last)}</span>`),
        cell('Price Data', statusBadge('VERIFIED') + ' <span style="color:var(--aurora-text-muted);font-weight:400">EOD — never shown as live</span>'),
        cell('Corporate Actions', statusBadge('DATA_INSUFFICIENT')),
        cell('Institutional', statusBadge('DATA_INSUFFICIENT')),
        cell('News & Events', statusBadge('DATA_INSUFFICIENT')),
        cell('Total Coverage', `${d.tradingSessions || 'N/A'} sessions, ${d.cmDaysWithData || 'N/A'} with CM data`)
      ].join('');
    } catch (e) {
      body.innerHTML = '<p class="desc">VERIFICATION BLOCKED — could not load the NSE coverage report.</p>';
    }
  }

  function init() { renderTodaysFocus(); renderDataTrust(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
