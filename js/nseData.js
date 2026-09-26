// VIKRAM — NSE Data Management page.
//
// This page is intentionally STATIC / READ-ONLY. It never talks to the live backend and never
// asks for credentials. It only reads data already committed to this repository:
//   - data/nse-coverage-report.json (coverage), a pre-computed artifact built directly from the
//     real data/market-history files by scripts/buildNseCoverageReport.js.
//   - data/market-history-manifest.json + data/market-history/*.json (existing dataset
//     download), served as plain static files.
// Nothing here is recomputed, estimated, or fabricated in the browser.
//
// Live NSE acquisition (server/src/ingest.js, gated behind requireAdmin()/ADMIN_EMAILS/
// AUTH_SECRET on the backend) is a separate, admin-only concern and is intentionally NOT
// reachable from this page — see nse-data.html's "Acquire / Download NSE Data" section for the
// static notice explaining that. That backend and its authentication are untouched by this file.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = v => (v === null || v === undefined || v === '') ? 'N/A' : esc(v);

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

  // ---------- Download Existing Dataset ----------
  // Packages ONLY the real data/market-history/*.json files already stored in this deployment
  // and already served statically (the same way data/nse-coverage-report.json and
  // data/scanner.json are already fetched elsewhere in this app). Never contacts NSE, never
  // estimates a missing date, never fabricates a file that isn't in the manifest, never requires
  // authentication.
  async function loadMarketHistoryManifest() {
    const res = await fetch('data/market-history-manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function formatBytes(n) {
    if (n == null) return 'N/A';
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderDatasetDownload(manifest) {
    const statusLine = $('datasetStatusLine');
    const zipBtn = $('downloadAllZipBtn');
    const fileList = $('datasetFileList');
    if (!statusLine || !zipBtn || !fileList) return;
    if (manifest.status !== 'VERIFIED' || !manifest.files || !manifest.files.length) {
      statusLine.textContent = `${manifest.status || 'DATA INSUFFICIENT'} — ${manifest.reason || 'no stored market-history files found.'}`;
      fileList.innerHTML = '<p>No files available.</p>';
      return;
    }
    statusLine.textContent = `${manifest.fileCount} real daily file(s) already stored, ${manifest.dateRange.first} \u2192 ${manifest.dateRange.last} (${formatBytes(manifest.totalBytes)} total). Manifest generated ${esc(manifest.generatedAt)}.`;
    fileList.innerHTML = manifest.files.map(f =>
      `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0"><a href="data/market-history/${esc(f.name)}" download="${esc(f.name)}">${esc(f.date)}</a><span>${formatBytes(f.bytes)}</span></div>`
    ).join('');

    if (typeof window.VikramZip === 'undefined') {
      zipBtn.disabled = true;
      zipBtn.title = 'ZIP packaging script did not load';
      return;
    }
    zipBtn.disabled = false;
    zipBtn.textContent = `Download all as ZIP (${formatBytes(manifest.totalBytes)})`;
    zipBtn.addEventListener('click', () => downloadAllAsZip(manifest));
  }

  async function downloadAllAsZip(manifest) {
    const zipBtn = $('downloadAllZipBtn');
    const statusEl = $('downloadAllStatus');
    zipBtn.disabled = true;
    const originalLabel = zipBtn.textContent;
    try {
      const entries = [];
      for (let i = 0; i < manifest.files.length; i++) {
        const f = manifest.files[i];
        statusEl.textContent = `Fetching ${i + 1}/${manifest.files.length}: ${f.name}\u2026`;
        const res = await fetch(`data/market-history/${f.name}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to fetch ${f.name}: HTTP ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        entries.push({ name: `market-history/${f.name}`, data: buf });
      }
      statusEl.textContent = 'Packaging ZIP\u2026';
      const zipBytes = window.VikramZip.buildStoreZip(entries);
      const blob = new Blob([zipBytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vikram-market-history-${manifest.dateRange.first}-to-${manifest.dateRange.last}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      statusEl.textContent = `Done \u2014 ${manifest.fileCount} real file(s), ${formatBytes(manifest.totalBytes)}, unmodified.`;
    } catch (error) {
      statusEl.textContent = `ERROR \u2014 ${error.message}`;
    } finally {
      zipBtn.disabled = false;
      zipBtn.textContent = originalLabel;
    }
  }

  async function init() {
    try {
      const report = await loadCoverageReport();
      renderCoverage(report);
    } catch (error) {
      $('coverageStatusLine').textContent = `VERIFICATION BLOCKED — ${error.message}`;
    }
    try {
      const manifest = await loadMarketHistoryManifest();
      renderDatasetDownload(manifest);
    } catch (error) {
      const statusLine = $('datasetStatusLine'), fileList = $('datasetFileList');
      if (statusLine) statusLine.textContent = `VERIFICATION BLOCKED — ${error.message}`;
      if (fileList) fileList.innerHTML = '<p>Unable to load the file manifest.</p>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
