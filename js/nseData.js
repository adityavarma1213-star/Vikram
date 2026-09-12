// VIKRAM — NSE Data Management page.
//
// Coverage section always works, even on a static-only deployment: it reads
// data/nse-coverage-report.json, a pre-computed artifact built directly from the real
// data/market-history files by scripts/buildNseCoverageReport.js. Nothing is recomputed or
// estimated in the browser.
//
// Acquisition section is honest about what this page can and cannot do:
//   - If no live backend is configured (the common case — see accumulation/api.js's own
//     isStaticPages detection, reused here), the "Acquire Latest Available NSE Session" button is
//     disabled and the
//     page explains exactly why, plus the real manual command that would run it.
//   - If a live backend IS configured, the button calls the real, unmodified
//     POST /api/admin/ingest/run route, which runs the exact same server/src/ingest.js code the
//     scheduled cron job uses. It is never a mock — a real result (or a real failure) comes back.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = v => (v === null || v === undefined || v === '') ? 'N/A' : esc(v);

  const API_BASE = (window.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const IS_STATIC_PAGES = !API_BASE && /github\.io$/i.test(location.hostname);
  const LIVE_BACKEND_CONFIGURED = !!API_BASE && !IS_STATIC_PAGES;

  // Same token/email keys and same "prompt once, cache token" pattern as js/alertsUI.js — this
  // is not a new auth system, it reuses the one already shipped for Alerts.
  const TOKEN_KEY = 'vikram-auth-token';
  const EMAIL_KEY = 'vikram-auth-email';

  async function ensureAuth() {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached) return cached;
    const email = (localStorage.getItem(EMAIL_KEY) || window.prompt('Email for VIKRAM (required to trigger acquisition):') || '').trim();
    if (!email) throw new Error('Email is required to trigger acquisition.');
    const password = window.prompt('Password (minimum 8 characters):') || '';
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    localStorage.setItem(EMAIL_KEY, email);
    const body = JSON.stringify({ email, password });
    let res = await fetch(API_BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (res.status === 401) res = await fetch(API_BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.token) throw new Error(out.error || 'Sign-in to the VIKRAM backend failed.');
    localStorage.setItem(TOKEN_KEY, out.token);
    return out.token;
  }

  async function authedFetch(path, options = {}) {
    const token = await ensureAuth();
    const res = await fetch(API_BASE + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new Error('Your session expired — please retry.'); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.reason || body.error || `Request failed (${res.status})`);
    return body;
  }

  // ---------- Coverage ----------
  async function loadCoverageReport() {
    const res = await fetch('data/nse-coverage-report.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderCoverage(report) {
    if (report.status !== 'VERIFIED') {
      $('coverageStatusLine').textContent = `${report.status || 'DATA INSUFFICIENT'} — ${report.reason || 'coverage report unavailable.'}`;
      return;
    }
    const d = report;
    $('coverageStatusLine').textContent = `VERIFIED — ${d.dateRange.first} \u2192 ${d.dateRange.last} (${d.tradingSessions} real trading sessions). Report generated ${text(d.generatedAt)}.`;

    $('coverageTopGrid').innerHTML = [
      ['First Available Date', d.dateRange.first],
      ['Last Available Date', d.dateRange.last],
      ['Trading Sessions', d.tradingSessions],
      ['Report Source', d.source]
    ].map(([label, value]) => `<div class="metric-group"><span class="metric-label">${esc(label)}</span><span class="metric-value" style="font-size:0.95rem">${esc(value)}</span></div>`).join('');

    $('cmGrid').innerHTML = [
      ['Days With CM Data', `${d.cm.daysWithData} / ${d.tradingSessions}`],
      ['Days Without CM Data', d.cm.daysWithoutData],
      ['Total CM Rows (symbol-days)', d.cm.totalRows.toLocaleString('en-IN')],
      ['Delivery Field Coverage', d.cm.deliveryFieldCoveragePct == null ? 'DATA N/A' : `${d.cm.deliveryFieldCoveragePct}%`]
    ].map(([label, value]) => `<div class="metric-group"><span class="metric-label">${esc(label)}</span><span class="metric-value" style="font-size:0.95rem">${esc(value)}</span></div>`).join('');

    $('foGrid').innerHTML = [
      ['Days With F&O Data', `${d.fo.daysWithData} / ${d.tradingSessions}`],
      ['Days Without F&O Data', d.fo.daysWithoutData],
      ['Total F&O Rows (contract-days)', d.fo.totalRows.toLocaleString('en-IN')],
      ['Open Interest Field Coverage', d.fo.oiFieldCoveragePct == null ? 'DATA N/A' : `${d.fo.oiFieldCoveragePct}%`]
    ].map(([label, value]) => `<div class="metric-group"><span class="metric-label">${esc(label)}</span><span class="metric-value" style="font-size:0.95rem">${esc(value)}</span></div>`).join('');

    $('flagCountBadge').textContent = `${d.dataQualityFlags.length} FLAGGED`;
    $('qualityFlags').innerHTML = d.dataQualityFlags.length
      ? d.dataQualityFlags.map(f => `<div class="quality-flag-item"><strong>${esc(f.date)}:</strong> ${esc(f.issue)}</div>`).join('')
      : '<p>No data-quality anomalies detected by this check.</p>';
    if (d.fo.emptyDates && d.fo.emptyDates.length) {
      $('qualityFlags').innerHTML += `<div class="quality-flag-item"><strong>${d.fo.emptyDates.length} day(s) with zero F&O rows:</strong> ${d.fo.emptyDates.map(esc).join(', ')} — these may be genuine days with no published derivatives file, not necessarily an ingestion failure.</div>`;
    }
    if (d.cm.suspectedDuplicateSessions && d.cm.suspectedDuplicateSessions.length) {
      $('qualityFlags').innerHTML += `<div class="quality-flag-item"><strong>${d.cm.suspectedDuplicateSessions.length} suspected duplicate CM session(s):</strong> ${d.cm.suspectedDuplicateSessions.map(s => `${esc(s.date)} (identical to ${esc(s.comparedTo)} for all ${s.symbolsCompared} compared symbols)`).join('; ')} — every one of these also appears in the zero-F&amp;O-rows list above, consistent with a stale snapshot being carried forward on what was likely a market holiday rather than an ingestion failure.</div>`;
    }

    const uw = d.unaccountedWeekdays;
    $('unaccountedNotice').textContent = uw.reason;
    $('unaccountedList').innerHTML = uw.dates.length
      ? `<strong>${uw.dates.length} weekday(s):</strong> ${uw.dates.map(esc).join(', ')}`
      : 'None — every weekday in range has a stored file.';
  }

  // ---------- Acquisition ----------
  function renderBackendStatusLine() {
    $('backendStatusLine').textContent = LIVE_BACKEND_CONFIGURED
      ? `Live backend detected at ${API_BASE} — acquisition can be triggered from this page.`
      : 'No live backend is configured on this deployment (this is the static site) — acquisition cannot be triggered from here. See the manual command below.';
  }

  function renderAcquisitionControl() {
    const el = $('acquisitionControl');
    if (!LIVE_BACKEND_CONFIGURED) {
      el.innerHTML = `
        <button class="btn btn-primary acquire-btn" disabled title="No live backend configured on this deployment">Acquire Latest Available NSE Session</button>
        <p class="text-muted" style="font-size:0.8rem;margin-top:10px">To run it manually against a deployment that has a database and the required environment variables: <code>DATABASE_URL=... AUTH_SECRET=... node server/src/ingest.js</code> (from the <code>server/</code> directory). This is the exact same code this button would call if a live backend were connected. It acquires only the single most recent not-yet-stored NSE trading day — there is no arbitrary historical backfill in this codebase.</p>`;
      return;
    }
    el.innerHTML = `<button id="runIngestBtn" class="btn btn-primary acquire-btn">Acquire Latest Available NSE Session</button>
      <p class="text-muted" style="font-size:0.8rem;margin-top:8px">Fetches the most recent not-yet-stored NSE trading day (CM + F&amp;O) and re-materializes scanner results. Requires signing in AND being on this deployment's admin allowlist (<code>ADMIN_EMAILS</code>) — a regular logged-in account is not sufficient. Only one acquisition can run at a time; a second attempt while one is in progress is rejected as <code>INGESTION_ALREADY_RUNNING</code>.</p>`;
    $('runIngestBtn').addEventListener('click', runIngestion);
  }

  async function runIngestion() {
    const btn = $('runIngestBtn');
    const resultEl = $('acquisitionResult');
    btn.disabled = true;
    btn.textContent = 'Running…';
    resultEl.innerHTML = '<p class="text-muted">Contacting the live backend…</p>';
    try {
      const result = await authedFetch('/api/admin/ingest/run', { method: 'POST' });
      const log = (result.attempts || []).map(a => a.status === 'INGESTED'
        ? `INGESTED ${a.date}  CM=${a.cmRows}  FO=${a.foRows}  materialized=${a.materializedSymbols}`
        : `SKIPPED ${a.date}: ${a.reason}`
      ).join('\n');
      if (result.status === 'SUCCESS') {
        resultEl.innerHTML = `<p style="color:var(--color-green);font-weight:700">SUCCESS — ingested ${esc(result.ingestedDate)} (CM=${result.cmRows} rows, F&O=${result.foRows} rows), materialized ${result.materializedSymbols} symbol(s).</p><div class="acquisition-log">${esc(log)}</div>`;
      } else if (result.status === 'BLOCKED') {
        resultEl.innerHTML = `<p style="color:#f2c14e;font-weight:700">INGESTION_ALREADY_RUNNING — another acquisition is already in progress. Try again shortly.</p>`;
      } else if (result.status === 'FAILED') {
        resultEl.innerHTML = `<p style="color:var(--color-red);font-weight:700">FAILED — ${esc(result.reason)}</p>`;
      } else {
        resultEl.innerHTML = `<p style="color:#f2c14e;font-weight:700">NO NEW DATA — ${esc(result.reason)}</p><div class="acquisition-log">${esc(log)}</div>`;
      }
      loadIngestionRuns();
    } catch (error) {
      resultEl.innerHTML = `<p style="color:var(--color-red);font-weight:700">ERROR — ${esc(error.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Acquire Latest Available NSE Session';
    }
  }

  async function loadIngestionRuns() {
    const tbody = document.querySelector('#ingestionRunsTable tbody');
    const lastRunGrid = $('lastRunGrid');
    if (!LIVE_BACKEND_CONFIGURED) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted">VERIFICATION BLOCKED — requires a live backend with database access, not available on this static deployment.</td></tr>';
      lastRunGrid.innerHTML = '<p class="text-muted">VERIFICATION BLOCKED — requires a live backend with database access.</p>';
      return;
    }
    try {
      const data = await authedFetch('/api/admin/ingestion-runs');
      const runs = data.runs || [];
      if (!runs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No ingestion runs recorded yet.</td></tr>';
      } else {
        tbody.innerHTML = runs.map(r => `<tr><td>${text(r.segment)}</td><td>${text(r.trade_date)}</td><td>${text(r.status)}</td><td>${text(r.row_count)}</td><td>${text(r.invalid_count)}</td><td>${text(r.created_at)}${r.error ? `<div class="text-muted" style="font-size:10px">${esc(r.error)}</div>` : ''}</td></tr>`).join('');
      }
      const lastBySegment = {};
      runs.filter(r => r.status === 'success').forEach(r => { if (!lastBySegment[r.segment]) lastBySegment[r.segment] = r; });
      lastRunGrid.innerHTML = ['CM', 'FO'].map(seg => {
        const r = lastBySegment[seg];
        return `<div class="metric-group"><span class="metric-label">${seg === 'CM' ? 'Cash Market' : 'Futures & Options'}</span><span class="metric-value" style="font-size:0.9rem">${r ? `${text(r.trade_date)} (${text(r.row_count)} rows)` : 'DATA N/A — no successful run recorded'}</span></div>`;
      }).join('');
    } catch (error) {
      const blocked = /admin authorization/i.test(error.message);
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted">${blocked ? 'VERIFICATION BLOCKED — this account is not on the admin allowlist' : `VERIFICATION BLOCKED — ${esc(error.message)}`}</td></tr>`;
      lastRunGrid.innerHTML = `<p class="text-muted">${blocked ? 'VERIFICATION BLOCKED — this account is not on the admin allowlist' : `VERIFICATION BLOCKED — ${esc(error.message)}`}</p>`;
    }
  }

  async function init() {
    renderBackendStatusLine();
    renderAcquisitionControl();
    try {
      const report = await loadCoverageReport();
      renderCoverage(report);
    } catch (error) {
      $('coverageStatusLine').textContent = `VERIFICATION BLOCKED — ${error.message}`;
    }
    loadIngestionRuns();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
