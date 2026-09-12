// VIKRAM — 1-Year Research page.
//
// Data sources (never mixed without a label):
//   1. backtest/REAL_1YEAR_BACKTEST_RESULT.json — the REAL, already-computed one-year backtest
//      artifact (engine = accumulation/engine.js, is_production_vikram: true). Provides:
//      manifestSummary (coverage), horizonStats + signals (historical signal research, forward
//      returns), asm.records (Accumulation Success Matrix detail).
//   2. data/scanner.json — the SAME static snapshot the Accumulation Scanner / Opportunity Radar
//      use, including its unused-until-now `periods` object (1D/1W/1M/3M/6M/1Y trailing-window
//      recomputes of TODAY's verdict). Used only for the "Trailing-Window Scanner View" section,
//      which is explicitly labeled CURRENT/LIVE SCANNER DATA, never presented as historical.
//
// Nothing here is estimated, interpolated, or invented. Where a field genuinely is not tracked in
// the source data, the UI says so (DATA N/A / DATA INSUFFICIENT) instead of omitting the caveat.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = v => (v === null || v === undefined || v === '') ? 'N/A' : esc(v);
  const fmtNum = (v, digits = 2) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : 'N/A';
  const fmtInt = v => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-IN') : 'N/A';
  const fmtPct = v => Number.isFinite(Number(v)) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : null;

  const state = {
    backtest: null,
    scannerSnapshot: null,
    minDate: null,
    maxDate: null,
    // Trailing-window (current scanner) section
    period: '1Y',
    periodUniverse: 'ALL',
    periodVerdict: 'ALL',
    periodSearch: '',
    periodPage: 1,
    periodPageSize: 25,
    // Historical signal research section
    signalSymbol: '',
    signalFrom: null,
    signalTo: null,
    signalResult: 'ALL',
    signalSort: { key: 'signalDate', dir: 'desc' },
    signalPage: 1,
    signalPageSize: 25,
    expandedSignalKey: null
  };

  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  // ---------- Coverage ----------
  function renderCoverage() {
    const grid = $('coverageGrid');
    const headline = $('coverageHeadline');
    const disclosure = $('coverageDisclosure');
    const caBadge = $('caStatusBadge');
    const bt = state.backtest;
    if (!bt || !bt.manifestSummary) {
      if (grid) grid.innerHTML = '<p class="text-muted">DATA INSUFFICIENT — the backtest coverage manifest could not be loaded.</p>';
      if (headline) headline.textContent = 'Verified data coverage: DATA INSUFFICIENT.';
      return;
    }
    const m = bt.manifestSummary;
    const dates = Array.isArray(m.date_range) ? m.date_range : [];
    state.minDate = dates[0] || null;
    state.maxDate = dates[dates.length - 1] || null;
    if (headline) headline.textContent = state.minDate && state.maxDate
      ? `Verified data currently available: ${state.minDate} \u2192 ${state.maxDate} (${dates.length} real trading sessions).`
      : 'Verified data coverage: DATA INSUFFICIENT.';

    const cmSeg = m.by_segment && m.by_segment.CM ? m.by_segment.CM : null;
    const cells = [
      ['First Available Date', state.minDate || 'DATA N/A'],
      ['Last Available Date', state.maxDate || 'DATA N/A'],
      ['Trading Sessions Confirmed', fmtInt(m.trading_sessions_confirmed)],
      ['Real Data Records', fmtInt(m.real_data_records)],
      ['Data Provenance', text(m.data_provenance)],
      ['CM Sessions: Success / Total', cmSeg ? `${fmtInt(cmSeg.success_valid)} / ${fmtInt(cmSeg.total)}` : 'DATA N/A'],
      ['CM Sessions: Failed', cmSeg ? fmtInt(cmSeg.failed) : 'DATA N/A'],
      ['Engine Verified', bt.engine ? (bt.engine.is_production_vikram ? 'YES \u2014 production accumulation/engine.js' : 'NO') : 'DATA N/A']
    ];
    if (grid) grid.innerHTML = cells.map(([label, value]) => `<div class="metric-group"><span class="metric-label">${esc(label)}</span><span class="metric-value" style="font-size:1rem">${esc(value)}</span></div>`).join('');

    const ca = bt.corporateActionCoverage || {};
    if (caBadge) caBadge.textContent = ca.status === 'CORPORATE_ACTION_DATA_REQUIRED' ? 'DATA INSUFFICIENT' : text(ca.status);
    if (disclosure) disclosure.textContent = ca.reason
      ? `Known limitation: ${ca.reason} Any forward return whose holding period spans a suspected split/bonus/merger discontinuity carries an explicit corporateActionCaveat in Historical Signal Research below rather than a silently unadjusted number.`
      : '';
  }

  // ---------- Signal Overview / Performance ----------
  function renderHorizonStats() {
    const bt = state.backtest;
    const grid = $('signalOverviewGrid');
    const tbody = document.querySelector('#horizonTable tbody');
    if (!bt || !bt.horizonStats) {
      if (grid) grid.innerHTML = '<p class="text-muted">DATA INSUFFICIENT.</p>';
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-muted">DATA INSUFFICIENT.</td></tr>';
      return;
    }
    if (grid) grid.innerHTML = `<div class="metric-group"><span class="metric-label">Total Signals (ACCUMULATION CONFIRMED events)</span><span class="metric-value" style="font-size:1.4rem">${fmtInt(bt.totalSignals)}</span></div>`;
    const horizons = ['1D', '5D', '20D', '60D', '120D'];
    if (tbody) tbody.innerHTML = horizons.map(h => {
      const s = bt.horizonStats[h];
      if (!s) return `<tr><td>${h}</td><td colspan="5" class="text-muted">DATA N/A</td></tr>`;
      const win = Number.isFinite(s.winRatePct) ? `${s.winRatePct}%` : 'N/A';
      const avg = fmtPct(s.avgReturnPct);
      const avgClass = s.avgReturnPct > 0 ? 'return-positive' : s.avgReturnPct < 0 ? 'return-negative' : '';
      return `<tr><td><strong>${h}</strong></td><td>${fmtInt(s.signalCount)}</td><td>${fmtInt(s.computedCount)}</td><td>${fmtInt(s.insufficientFutureData)}</td><td>${win}</td><td class="return-cell ${avgClass}">${avg == null ? 'N/A' : avg}</td></tr>`;
    }).join('');
  }

  // ---------- Trailing-window (current scanner) section ----------
  function periodRows() {
    const snap = state.scannerSnapshot;
    if (!snap || !snap.periods || !Array.isArray(snap.periods[state.period])) return [];
    return snap.periods[state.period];
  }
  function renderPeriodTable() {
    const tbody = document.querySelector('#periodTable tbody');
    const statusLine = $('periodStatusLine');
    const pager = $('periodPagination');
    if (!tbody) return;
    const all = periodRows();
    if (!all.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted">Verified scanner snapshot unavailable for this window.</td></tr>';
      if (statusLine) statusLine.textContent = '';
      if (pager) pager.innerHTML = '';
      return;
    }
    const inUniverse = r => window.VikramUniverseMembership ? window.VikramUniverseMembership.matchesUniverse(r, state.periodUniverse) : true;
    const q = state.periodSearch.trim().toUpperCase();
    let rows = all.filter(r => inUniverse(r) && (state.periodVerdict === 'ALL' || r.verdict === state.periodVerdict));
    if (q) rows = rows.filter(r => String(r.symbol || '').toUpperCase().includes(q) || String(r.companyName || '').toUpperCase().includes(q));
    rows = rows.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

    const pageSize = state.periodPageSize;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.periodPage = Math.min(Math.max(1, state.periodPage), totalPages);
    const pageRows = rows.slice((state.periodPage - 1) * pageSize, state.periodPage * pageSize);

    if (statusLine) statusLine.textContent = `${rows.length.toLocaleString('en-IN')} of ${all.length.toLocaleString('en-IN')} evaluated \u00b7 window: ${state.period} \u00b7 as of ${text(state.scannerSnapshot.asOf)}`;

    tbody.innerHTML = pageRows.length ? pageRows.map(r => {
      const m = r.metrics || {};
      const changeClass = Number(m.priceChangePct) > 0 ? 'return-positive' : Number(m.priceChangePct) < 0 ? 'return-negative' : '';
      return `<tr>
        <td><a class="symbol-link" href="index.html?symbol=${encodeURIComponent(r.symbol)}">${text(r.companyName || r.symbol)}</a><div class="text-muted" style="font-size:10px">${text(r.symbol)}</div></td>
        <td>\u20b9${fmtNum(m.close)}</td>
        <td class="return-cell ${changeClass}">${fmtPct(m.priceChangePct) || 'N/A'}</td>
        <td>${fmtNum(r.score, 1)}</td>
        <td>${text(r.verdict)}</td>
        <td>${Number.isFinite(Number(m.volumeRatio)) ? Number(m.volumeRatio).toFixed(2) + 'x' : 'N/A'}</td>
        <td>${Number.isFinite(Number(m.deliveryPct)) ? Number(m.deliveryPct).toFixed(1) + '%' : 'N/A'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="text-muted">No rows match these filters.</td></tr>';

    if (pager) pager.innerHTML = `<span>Page ${state.periodPage} of ${totalPages}</span><span><button type="button" id="periodPrev" ${state.periodPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button> <button type="button" id="periodNext" ${state.periodPage >= totalPages ? 'disabled' : ''}>Next \u2192</button></span>`;
    const prevBtn = $('periodPrev'); const nextBtn = $('periodNext');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.periodPage -= 1; renderPeriodTable(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.periodPage += 1; renderPeriodTable(); });
  }

  // ---------- Historical Signal Research ----------
  function horizonReturn(signal, h) {
    const fr = signal.forwardReturns && signal.forwardReturns[`${h}D`];
    if (!fr) return null;
    if (fr.status !== 'COMPUTED') return { status: fr.status };
    return { status: 'COMPUTED', returnPct: fr.returnPct, caveat: fr.corporateActionCaveat || null };
  }

  function filteredSignals() {
    const bt = state.backtest;
    if (!bt || !Array.isArray(bt.signals)) return [];
    const q = state.signalSymbol.trim().toUpperCase();
    let rows = bt.signals;
    if (q) rows = rows.filter(s => String(s.symbol || '').toUpperCase().includes(q));
    if (state.signalFrom) rows = rows.filter(s => s.signalDate >= state.signalFrom);
    if (state.signalTo) rows = rows.filter(s => s.signalDate <= state.signalTo);
    if (state.signalResult !== 'ALL') {
      rows = rows.filter(s => {
        const r20 = horizonReturn(s, 20);
        if (!r20 || r20.status !== 'COMPUTED') return false;
        return state.signalResult === 'POSITIVE' ? r20.returnPct > 0 : r20.returnPct < 0;
      });
    }
    const { key, dir } = state.signalSort;
    const mul = dir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      if (key === 'signalDate') return mul * String(a.signalDate).localeCompare(String(b.signalDate));
      if (key === 'symbol') return mul * String(a.symbol).localeCompare(String(b.symbol));
      if (key === 'return20D') {
        const ra = horizonReturn(a, 20), rb = horizonReturn(b, 20);
        const va = ra && ra.status === 'COMPUTED' ? ra.returnPct : -Infinity;
        const vb = rb && rb.status === 'COMPUTED' ? rb.returnPct : -Infinity;
        return mul * (va - vb);
      }
      return 0;
    });
    return rows;
  }

  function asmFor(index) {
    const bt = state.backtest;
    if (!bt || !bt.asm || !Array.isArray(bt.asm.records)) return null;
    return bt.asm.records[index] || null;
  }

  function renderReturnCell(hr) {
    if (!hr) return '<span class="return-na">N/A</span>';
    if (hr.status !== 'COMPUTED') return '<span class="return-na" title="Not enough real future trading days exist yet for this horizon">INSUFFICIENT DATA</span>';
    const cls = hr.returnPct > 0 ? 'return-positive' : hr.returnPct < 0 ? 'return-negative' : '';
    const caveat = hr.caveat ? ' \u26a0\ufe0f' : '';
    return `<span class="return-cell ${cls}" ${hr.caveat ? `title="${esc(hr.caveat)}"` : ''}>${fmtPct(hr.returnPct)}${caveat}</span>`;
  }

  function renderSignalTable() {
    const tbody = document.querySelector('#signalTable tbody');
    const pager = $('signalPagination');
    const summary = $('signalResultSummary');
    if (!tbody) return;
    const bt = state.backtest;
    if (!bt || !Array.isArray(bt.signals)) { tbody.innerHTML = '<tr><td colspan="10" class="text-muted">DATA INSUFFICIENT \u2014 backtest artifact unavailable.</td></tr>'; return; }

    const allFiltered = filteredSignals();
    const pageSize = state.signalPageSize;
    const totalPages = Math.max(1, Math.ceil(allFiltered.length / pageSize));
    state.signalPage = Math.min(Math.max(1, state.signalPage), totalPages);
    const pageRows = allFiltered.slice((state.signalPage - 1) * pageSize, state.signalPage * pageSize);

    if (summary) summary.textContent = `${allFiltered.length.toLocaleString('en-IN')} of ${bt.signals.length.toLocaleString('en-IN')} real signals match these filters \u00b7 all ACCUMULATION CONFIRMED events \u00b7 range ${text(state.minDate)} \u2192 ${text(state.maxDate)}`;

    tbody.innerHTML = pageRows.length ? pageRows.map(s => {
      const originalIndex = bt.signals.indexOf(s);
      const key = `${s.symbol}|${s.signalDate}|${s.eventIndex}`;
      const isOpen = state.expandedSignalKey === key;
      const mainRow = `<tr class="signal-row-expand" data-key="${esc(key)}" data-index="${originalIndex}">
        <td>${text(s.signalDate)}</td>
        <td><a class="symbol-link" href="index.html?symbol=${encodeURIComponent(s.symbol)}" onclick="event.stopPropagation()">${text(s.symbol)}</a></td>
        <td>\u20b9${fmtNum(s.entryClose)}</td>
        <td>${fmtInt(s.tradingSessionStreak)} day${s.tradingSessionStreak === 1 ? '' : 's'}</td>
        <td>${text(s.eventStatus)}</td>
        <td>${renderReturnCell(horizonReturn(s, 1))}</td>
        <td>${renderReturnCell(horizonReturn(s, 5))}</td>
        <td>${renderReturnCell(horizonReturn(s, 20))}</td>
        <td>${renderReturnCell(horizonReturn(s, 60))}</td>
        <td>${renderReturnCell(horizonReturn(s, 120))}</td>
      </tr>`;
      if (!isOpen) return mainRow;
      const asm = asmFor(originalIndex);
      const asmHorizons = asm ? Object.entries(asm.horizons || {}) : [];
      const detailBody = asm ? asmHorizons.map(([h, v]) => `<div><strong>${esc(h)}</strong>${v.status === 'COMPUTED'
        ? `Return: ${fmtPct(v.returnPct)}<br>MFE: ${fmtPct(v.mfePct)}<br>MAE: ${fmtPct(v.maePct)}<br>Max DD: ${fmtPct(v.maxDrawdownPct)}`
        : 'INSUFFICIENT DATA'}</div>`).join('') : '<div>ASM detail unavailable for this event.</div>';
      const detailRow = `<tr class="asm-detail-row"><td colspan="10"><div class="asm-detail">${detailBody}<div><strong>Benchmark-Relative</strong>NOT AVAILABLE \u2014 no benchmark series provided</div></div></td></tr>`;
      return mainRow + detailRow;
    }).join('') : '<tr><td colspan="10" class="text-muted">No signals match these filters.</td></tr>';

    tbody.querySelectorAll('tr.signal-row-expand').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.dataset.key;
        state.expandedSignalKey = state.expandedSignalKey === key ? null : key;
        renderSignalTable();
      });
    });

    if (pager) pager.innerHTML = `<span>Page ${state.signalPage} of ${totalPages}</span><span><button type="button" id="signalPrev" ${state.signalPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button> <button type="button" id="signalNext" ${state.signalPage >= totalPages ? 'disabled' : ''}>Next \u2192</button></span>`;
    const prevBtn = $('signalPrev'); const nextBtn = $('signalNext');
    if (prevBtn) prevBtn.addEventListener('click', () => { state.signalPage -= 1; renderSignalTable(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.signalPage += 1; renderSignalTable(); });

    const caCount = allFiltered.filter(s => ['1D', '5D', '20D', '60D', '120D'].some(h => { const hr = horizonReturn(s, h); return hr && hr.caveat; })).length;
    const caNotice = $('corporateActionNotice');
    if (caNotice) caNotice.textContent = caCount ? `\u26a0\ufe0f ${caCount} of ${allFiltered.length} filtered signal(s) have at least one horizon flagged for a suspected corporate-action price discontinuity (split/bonus/merger) \u2014 hover the flagged return for detail. Returns are never silently adjusted.` : '';
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function exportCsv() {
    const rows = filteredSignals();
    const header = ['signalDate', 'symbol', 'entryClose', 'tradingSessionStreak', 'eventStatus', 'return1D', 'return5D', 'return20D', 'return60D', 'return120D'];
    const lines = [header.join(',')];
    rows.forEach(s => {
      const cells = [s.signalDate, s.symbol, s.entryClose, s.tradingSessionStreak, s.eventStatus];
      [1, 5, 20, 60, 120].forEach(h => {
        const hr = horizonReturn(s, h);
        cells.push(hr && hr.status === 'COMPUTED' ? hr.returnPct : (hr ? hr.status : 'DATA N/A'));
      });
      lines.push(cells.map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vikram-historical-signals-${state.minDate || 'start'}-to-${state.maxDate || 'end'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Wiring ----------
  function wireControls() {
    const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

    on('periodSelect', 'change', e => { state.period = e.target.value; state.periodPage = 1; renderPeriodTable(); });
    on('periodUniverse', 'change', e => { state.periodUniverse = e.target.value; state.periodPage = 1; renderPeriodTable(); });
    on('periodVerdict', 'change', e => { state.periodVerdict = e.target.value; state.periodPage = 1; renderPeriodTable(); });
    on('periodSearch', 'input', e => { state.periodSearch = e.target.value; state.periodPage = 1; renderPeriodTable(); });

    on('signalSymbolSearch', 'input', e => { state.signalSymbol = e.target.value; state.signalPage = 1; renderSignalTable(); });
    on('signalResultFilter', 'change', e => { state.signalResult = e.target.value; state.signalPage = 1; renderSignalTable(); });
    on('signalSort', 'change', e => { const [key, dir] = e.target.value.split(':'); state.signalSort = { key, dir }; renderSignalTable(); });

    const outOfRangeBtn = $('signalDateOutOfRange');
    function validateDate(input, boundsCheck) {
      const val = input.value;
      if (!val) return null;
      if (state.minDate && state.maxDate && (val < state.minDate || val > state.maxDate)) {
        if (outOfRangeBtn) outOfRangeBtn.style.display = 'inline-block';
        return undefined; // signal "invalid, do not apply"
      }
      if (outOfRangeBtn) outOfRangeBtn.style.display = 'none';
      return val;
    }
    on('signalDateFrom', 'change', e => {
      const v = validateDate(e.target);
      if (v === undefined) return; // out of range — do not silently substitute another date
      state.signalFrom = v; state.signalPage = 1; renderSignalTable();
    });
    on('signalDateTo', 'change', e => {
      const v = validateDate(e.target);
      if (v === undefined) return;
      state.signalTo = v; state.signalPage = 1; renderSignalTable();
    });

    on('exportCsvBtn', 'click', exportCsv);
  }

  function applyDateBounds() {
    ['signalDateFrom', 'signalDateTo'].forEach(id => {
      const el = $(id);
      if (el && state.minDate && state.maxDate) { el.min = state.minDate; el.max = state.maxDate; }
    });
  }

  async function init() {
    wireControls();
    try {
      const [bt, snap] = await Promise.all([
        fetchJson('backtest/REAL_1YEAR_BACKTEST_RESULT.json'),
        fetchJson('data/scanner.json').catch(() => null)
      ]);
      state.backtest = bt;
      state.scannerSnapshot = snap && snap.dataStatus === 'EOD VERIFIED' ? snap : null;
    } catch (error) {
      $('coverageHeadline').textContent = 'VERIFICATION BLOCKED \u2014 the verified backtest artifact could not be loaded from backtest/REAL_1YEAR_BACKTEST_RESULT.json.';
      $('coverageGrid').innerHTML = '<p class="text-muted">DATA INSUFFICIENT.</p>';
      document.querySelector('#horizonTable tbody').innerHTML = '<tr><td colspan="6" class="text-muted">DATA INSUFFICIENT.</td></tr>';
      document.querySelector('#signalTable tbody').innerHTML = '<tr><td colspan="10" class="text-muted">DATA INSUFFICIENT.</td></tr>';
      document.querySelector('#periodTable tbody').innerHTML = '<tr><td colspan="7" class="text-muted">DATA INSUFFICIENT.</td></tr>';
      return;
    }
    renderCoverage();
    applyDateBounds();
    renderHorizonStats();
    renderPeriodTable();
    renderSignalTable();

    if (location.hash === '#asm') {
      const el = $('asm');
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
