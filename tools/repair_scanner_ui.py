from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
index = ROOT / 'index.html'
text = index.read_text(encoding='utf-8')
text = text.replace('href="accumulation.html"', 'href="index.html#scannerSurface"')
old = '.scanner-table{width:100%;min-width:900px;border-collapse:collapse}'
new = ('.scanner-table{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse}'
       '.scanner-table th:nth-child(1),.scanner-table td:nth-child(1){width:20%}'
       '.scanner-table th:nth-child(2),.scanner-table td:nth-child(2){width:9%}'
       '.scanner-table th:nth-child(3),.scanner-table td:nth-child(3){width:8%}'
       '.scanner-table th:nth-child(4),.scanner-table td:nth-child(4){width:8%}'
       '.scanner-table th:nth-child(5),.scanner-table td:nth-child(5){width:9%}'
       '.scanner-table th:nth-child(6),.scanner-table td:nth-child(6){width:10%}'
       '.scanner-table th:nth-child(7),.scanner-table td:nth-child(7){width:10%}'
       '.scanner-table th:nth-child(8),.scanner-table td:nth-child(8){width:9%}'
       '.scanner-table th:nth-child(9),.scanner-table td:nth-child(9){width:17%}'
       '.scanner-table th,.scanner-table td{padding:9px 8px;white-space:normal;overflow-wrap:anywhere}'
       '.scanner-table td:first-child,.scanner-table td:last-child{word-break:break-word}')
if old in text:
    text = text.replace(old, new, 1)
if '.scanner-meta{' not in text:
    marker = '.scanner-table th{color:var(--text-muted);font-size:8px;letter-spacing:.08em;text-transform:uppercase;background:var(--bg-card-2);position:sticky;top:0;z-index:3}'
    repl = marker + '.scanner-meta{margin:0 0 11px;color:var(--text-muted);font-size:10px;font-weight:700;display:flex;gap:14px;flex-wrap:wrap}.scanner-meta strong{color:var(--text-main);font-weight:800}'
    text = text.replace(marker, repl, 1)
text = text.replace('.scanner-table th{color:var(--text-muted);font-size:8px;letter-spacing:.08em;text-transform:uppercase;background:var(--bg-card-2);position:sticky;top:0;z-index:3}', '.scanner-table th{color:var(--text-muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase;background:var(--bg-card-2);position:sticky;top:0;z-index:3;font-weight:800}', 1)
text = text.replace('.scanner-table td{color:var(--text-main)}', '.scanner-table td{color:var(--text-main);font-size:12.5px}.scanner-table td:nth-child(1) strong{font-size:13px;font-weight:800}.scanner-table td:nth-child(4) strong{font-size:13px}', 1)
text = text.replace('.status-confirmed{color:var(--green)}', '.status-confirmed{color:var(--green);font-weight:800;font-size:12.5px}', 1)
text = text.replace('.status-starting,.status-quiet{color:var(--accent-cyan)}', '.status-starting,.status-quiet{color:var(--accent-cyan);font-weight:800;font-size:12.5px}', 1)
text = text.replace('.status-distribution{color:var(--red)}', '.status-distribution{color:var(--red);font-weight:800;font-size:12.5px}', 1)
if 'id="scannerMeta"' not in text:
    marker = '<div class="filter-controls" aria-label="Scanner filters">'
    text = text.replace(marker, '<div class="scanner-meta" id="scannerMeta"><span>Scanner Data Date: <strong id="scannerDataDate">—</strong></span><span>Data Age: <strong id="scannerDataAge">—</strong></span></div>\n      ' + marker, 1)
if 'function renderScannerMeta' not in text:
    marker = "  const d = new Date(); document.getElementById('feedDate').textContent = d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});"
    repl = marker + "\n  const dataDateEl = document.getElementById('scannerDataDate');\n  const dataAgeEl = document.getElementById('scannerDataAge');\n  function renderScannerMeta(asOf) {\n    if (!dataDateEl || !dataAgeEl) return;\n    if (!asOf) { dataDateEl.textContent = 'N/A'; dataAgeEl.textContent = 'N/A'; return; }\n    const asOfDate = new Date(`${asOf}T00:00:00Z`);\n    if (Number.isNaN(asOfDate.getTime())) { dataDateEl.textContent = 'N/A'; dataAgeEl.textContent = 'N/A'; return; }\n    dataDateEl.textContent = asOfDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });\n    const diffDays = Math.floor((Date.now() - asOfDate.getTime()) / 86400000);\n    dataAgeEl.textContent = diffDays <= 0 ? 'Today (EOD verified)' : diffDays === 1 ? '1 day old' : `${diffDays} days old`;\n  }"
    text = text.replace(marker, repl, 1)
text = text.replace("rows = Array.isArray(snapshot.results) ? snapshot.results : []; render();", "rows = Array.isArray(snapshot.results) ? snapshot.results : []; renderScannerMeta(snapshot.asOf); render();", 1)
# Normalize the error branch so repeated repair runs cannot duplicate the metadata call.
text = re.sub(r'(body\.innerHTML = \'<tr><td colspan=\\"9\\" class=\\"empty-cell\\">Verified scanner snapshot unavailable\. No market values are being estimated\.</td></tr>\';)(?:\s*renderScannerMeta\(null\);)+', r'\1 renderScannerMeta(null);', text)
text = text.replace("}).slice(0, 40);", "});", 1)
mobile_marker = '@media(max-width:760px){'
if '@media(max-width:1100px)' not in text and mobile_marker in text:
    mobile = '@media(max-width:1100px){.scanner-table{min-width:760px;table-layout:auto}.scanner-table th,.scanner-table td{white-space:nowrap}.scanner-table-wrap{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}}\n'
    text = text.replace(mobile_marker, mobile + mobile_marker, 1)
script_tag = '<script src="js/discoveryRepair.js"></script>'
if script_tag not in text:
    text = text.replace('</body>', f'{script_tag}\n</body>', 1)
index.write_text(text, encoding='utf-8')
(ROOT / 'accumulation.html').unlink(missing_ok=True)
assert '.scanner-table{width:100%;min-width:0;table-layout:fixed' in text
assert 'scanner-meta' in text
assert "}).slice(0, 40);" not in text
assert script_tag in text
