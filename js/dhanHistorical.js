// VIKRAM — Dhan Historical Data download screen.
// Talks ONLY to this site's own backend (/api/dhan/historical/*). The Dhan token never reaches
// the browser. The CSV is saved through the browser's normal download mechanism, and only after
// the user clicks "Download CSV". Nothing here starts a scan or changes any VIKRAM score.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API_BASE = (window.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const IS_STATIC_PAGES = !API_BASE && /github\.io$/i.test(location.hostname);
  const TOKEN_KEY = 'vikram-auth-token';
  const EMAIL_KEY = 'vikram-auth-email';
  const BASE = '/api/dhan/historical';
  let currentJobId = null, currentComplete = false, pollTimer = null;

  async function ensureAuth() {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached) return cached;
    const email = (localStorage.getItem(EMAIL_KEY) || window.prompt('VIKRAM admin email:') || '').trim();
    if (!email) throw new Error('Email is required.');
    const password = window.prompt('Password:') || '';
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    localStorage.setItem(EMAIL_KEY, email);
    const res = await fetch(API_BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.token) throw new Error(out.error || 'Sign-in failed.');
    localStorage.setItem(TOKEN_KEY, out.token);
    return out.token;
  }
  async function api(path, options = {}) {
    const token = await ensureAuth();
    const res = await fetch(API_BASE + BASE + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) } });
    if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new Error('Session expired. Click again to sign in.'); }
    return res;
  }
  async function apiJson(path, options) {
    const res = await api(path, options);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || 'Request failed (' + res.status + ')'); e.details = body.details; throw e; }
    return body;
  }
  const showError = msg => { const el = $('formError'); el.textContent = msg || ''; el.hidden = !msg; };

  async function loadStatus() {
    if (IS_STATIC_PAGES) {
      $('backendNotice').hidden = false;
      $('backendNotice').innerHTML = '<strong>This page needs the live VIKRAM backend.</strong> The GitHub Pages copy is static and cannot hold a Dhan token. Run the backend on your own laptop (see docs/DHAN_HISTORICAL_DOWNLOADER.md).';
      $('statusBody').textContent = 'Backend not available on static hosting.'; $('requestBtn').disabled = true; return;
    }
    try {
      const s = await apiJson('/status');
      const m = s.instrumentMaster;
      const rows = [
        ['Dhan token on server', s.tokenConfigured ? 'Configured' : 'NOT configured — downloads are disabled'],
        ['Instrument list', m.ok ? esc(m.count) + ' NSE equity symbols, file date ' + esc(m.fileModified) + (m.stale ? ' (older than 30 days — refresh it)' : '') : esc(m.reason)],
        ['Live access', esc(s.liveAccess)],
      ];
      $('statusBody').innerHTML = '<table class="data-table"><tbody>' + rows.map(r => '<tr><th scope="row" style="text-align:left;padding-right:16px">' + r[0] + '</th><td>' + r[1] + '</td></tr>').join('') + '</tbody></table>';
      $('limitHint').textContent = s.intervals.map(i => i.label + ': ' + (i.maxDaysPerRequest ? 'Dhan allows ' + i.maxDaysPerRequest + ' days per request (verified), we use ' + i.chunkDays + '. ' : 'we use ' + i.chunkDays + '-day requests (Dhan gives no daily limit). ') + (i.maxHistoryYears ? 'Last ' + i.maxHistoryYears + ' years only.' : 'From listing date.')).join('  ');
      if (!s.tokenConfigured || !m.ok) $('requestBtn').disabled = true;
    } catch (e) { $('statusBody').textContent = e.message; $('requestBtn').disabled = true; }
  }

  let searchTimer = null;
  $('symbolInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $('symbolInput').value.trim();
    if (q.length < 1) return;
    searchTimer = setTimeout(async () => {
      try { const r = await apiJson('/instruments?q=' + encodeURIComponent(q)); $('symbolList').innerHTML = r.results.map(i => '<option value="' + esc(i.symbol) + '">' + esc(i.name) + '</option>').join(''); } catch (_e) { /* status card already explains */ }
    }, 250);
  });

  function renderReport(j) {
    const r = j.report; if (!r) return '';
    const warn = r.warnings && r.warnings.length ? '<ul style="color:#fbbf24">' + r.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '';
    const chunks = r.chunks.map(c => '<tr><td>' + esc(c.from) + ' → ' + esc(c.to) + '</td><td>' + esc(c.status) + (c.reason ? ' — ' + esc(c.reason) : '') + '</td><td>' + esc(c.candles == null ? '' : c.candles) + '</td></tr>').join('');
    return '<table class="data-table"><tbody>' +
      '<tr><th scope="row" style="text-align:left">Requested range</th><td>' + esc(r.requestedFrom) + ' to ' + esc(r.requestedTo) + '</td></tr>' +
      '<tr><th scope="row" style="text-align:left">Candles returned</th><td>' + esc(r.candleCount) + '</td></tr>' +
      '<tr><th scope="row" style="text-align:left">Actual range</th><td>' + esc(r.actualFrom || 'none') + ' to ' + esc(r.actualTo || 'none') + ' (' + esc(r.timezone) + ')</td></tr>' +
      '<tr><th scope="row" style="text-align:left">Requests</th><td>' + esc(r.requestsOk) + ' ok, ' + esc(r.requestsFailed) + ' failed, of ' + esc(r.requestsTotal) + '</td></tr>' +
      '<tr><th scope="row" style="text-align:left">Weekdays without data</th><td>' + esc(r.coverage.weekdaysWithoutData) + ' (may be holidays)</td></tr></tbody></table>' + warn +
      '<details><summary>Per-request detail</summary><table class="data-table"><thead><tr><th>Period</th><th>Status</th><th>Candles</th></tr></thead><tbody>' + chunks + '</tbody></table></details>';
  }

  async function poll() {
    try {
      const j = await apiJson('/jobs/' + encodeURIComponent(currentJobId));
      if (j.state === 'running') {
        $('progressLine').textContent = 'Working… request ' + (j.progress.chunksDone + 1) + ' of ' + j.progress.chunksTotal;
        pollTimer = setTimeout(poll, 800); return;
      }
      const label = { complete: 'COMPLETE', partial: 'PARTIAL — NOT COMPLETE', no_data: 'NO DATA RETURNED', failed: 'FAILED' }[j.state] || j.state;
      $('progressLine').innerHTML = '<strong>Status: ' + esc(label) + '</strong>' + (j.error ? ' — ' + esc(j.error) : '');
      $('resultBody').innerHTML = renderReport(j);
      currentComplete = !!j.complete;
      $('downloadBtn').hidden = !j.csvAvailable;
      $('partialConfirmWrap').hidden = !(j.csvAvailable && !j.complete);
      $('partialConfirm').checked = false;
      $('requestBtn').disabled = false;
    } catch (e) { $('progressLine').textContent = e.message; $('requestBtn').disabled = false; }
  }

  $('requestBtn').addEventListener('click', async () => {
    showError('');
    clearTimeout(pollTimer);
    $('downloadBtn').hidden = true; $('partialConfirmWrap').hidden = true; $('resultBody').innerHTML = '';
    const body = { symbol: $('symbolInput').value.trim(), interval: $('intervalSelect').value, from: $('fromInput').value, to: $('toInput').value };
    $('requestBtn').disabled = true;
    try {
      const start = await apiJson('/jobs', { method: 'POST', body: JSON.stringify(body) });
      currentJobId = start.jobId; $('resultCard').hidden = false; $('progressLine').textContent = 'Started — ' + start.chunksTotal + ' request(s) planned.';
      poll();
    } catch (e) { showError(e.message + (e.details ? ' ' + e.details.join(' ') : '')); $('requestBtn').disabled = false; }
  });

  // Explicit user action only: fetch the CSV with the auth header, then hand it to the browser's
  // normal "save file" flow. The server's Content-Disposition filename is reused.
  $('downloadBtn').addEventListener('click', async () => {
    if (!currentComplete && !$('partialConfirm').checked) { showError('Tick the box to confirm you want a PARTIAL file.'); return; }
    showError('');
    try {
      const res = await api('/jobs/' + encodeURIComponent(currentJobId) + '/csv');
      if (!res.ok) throw new Error('No file available (it may have expired after 10 minutes). Request again.');
      const name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'dhan_candles.csv';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { showError(e.message); }
  });

  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  $('toInput').max = today; $('fromInput').max = today;
  loadStatus();
})();
