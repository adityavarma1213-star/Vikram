"""Real-browser test of the Dhan download screen (Chromium via Playwright).
Run:  python3 server/test/browser/dhan_download_screen.py   (from the repo root)
Uses a harness with a MOCKED Dhan API and SYNTHETIC candles. No real Dhan access, no real data."""
import subprocess, time, os, sys, tempfile, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(detail) if (detail and not cond) else ''))

def start(mode, port):
    env = dict(os.environ, HARNESS_MODE=mode, PORT=str(port))
    p = subprocess.Popen(['node', 'server/test/browser/dhanScreenHarness.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for _ in range(50):
        try: urllib.request.urlopen(f'http://127.0.0.1:{port}/__calls'); return p
        except Exception: time.sleep(0.1)
    raise RuntimeError('harness did not start')

def open_page(browser, port):
    ctx = browser.new_context(accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('vikram-auth-token','test-token')")
    page = ctx.new_page(); page.goto(f'http://127.0.0.1:{port}/dhan-historical.html'); return ctx, page

def fill(page, interval, frm, to):
    page.fill('#symbolInput', 'TESTCO'); page.select_option('#intervalSelect', interval)
    page.fill('#fromInput', frm); page.fill('#toInput', to); page.click('#requestBtn')

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    # --- scenario 1: complete daily download
    srv = start('complete', 4561)
    try:
        ctx, page = open_page(browser, 4561)
        page.wait_for_selector('#statusBody table')
        status_text = page.inner_text('#statusBody')
        check('status card shows token configured and instrument list', 'Configured' in status_text and '2 NSE equity symbols' in status_text, status_text)
        check('token value is not present anywhere in the page', 'FAKEFAKE' not in page.content())
        fill(page, '1d', '2026-10-26', '2026-10-28')
        page.wait_for_selector('#progressLine strong')
        check('status says COMPLETE', 'COMPLETE' in page.inner_text('#progressLine') and 'PARTIAL' not in page.inner_text('#progressLine'), page.inner_text('#progressLine'))
        body = page.inner_text('#resultBody')
        check('shows requested range, candle count and actual range', '2026-10-26 to 2026-10-28' in body and '3' in body and '2026-10-26 00:00:00' in body, body)
        check('download button visible, partial checkbox hidden', page.is_visible('#downloadBtn') and not page.is_visible('#partialConfirmWrap'))
        with page.expect_download() as dl: page.click('#downloadBtn')
        d = dl.value
        check('browser download filename is correct', d.suggested_filename == 'dhan_TESTCO_1d_2026-10-26_2026-10-28.csv', d.suggested_filename)
        path = os.path.join(tempfile.gettempdir(), 'dl_' + d.suggested_filename); d.save_as(path)
        text = open(path, encoding='utf-8').read(); lines = text.strip().split('\n')
        check('downloaded CSV has header + 3 rows', lines[0].startswith('symbol,security_id,') and len(lines) == 4, lines[:2])
        check('CSV rows are SYNTHETIC TESTCO with IST dates', lines[1].startswith('TESTCO,900001,NSE_EQ,1d,2026-10-26 00:00:00,2026-10-26,'), lines[1])
        ctx.close()
        # --- invalid input shows a clear error and makes no Dhan call
        ctx, page = open_page(browser, 4561); page.wait_for_selector('#statusBody table')
        before = int(urllib.request.urlopen('http://127.0.0.1:4561/__calls').read().decode().split(':')[1].strip('}'))
        page.fill('#symbolInput', 'TESTCO'); page.fill('#fromInput', '2026-10-28'); page.fill('#toInput', '2026-10-26'); page.click('#requestBtn')
        page.wait_for_selector('#formError:not([hidden])')
        check('invalid range shows an error', 'from must not be after to' in page.inner_text('#formError'), page.inner_text('#formError'))
        after = int(urllib.request.urlopen('http://127.0.0.1:4561/__calls').read().decode().split(':')[1].strip('}'))
        check('invalid request made no Dhan call', before == after, (before, after))
        ctx.close()
    finally: srv.terminate()
    # --- scenario 2: partial 5-minute download
    srv = start('partial', 4562)
    try:
        ctx, page = open_page(browser, 4562); page.wait_for_selector('#statusBody table')
        fill(page, '5m', '2026-05-01', '2026-10-29')
        page.wait_for_selector('#progressLine strong')
        check('status says PARTIAL — NOT COMPLETE', 'PARTIAL' in page.inner_text('#progressLine') and 'NOT COMPLETE' in page.inner_text('#progressLine'), page.inner_text('#progressLine'))
        check('partial warning text is shown', 'PARTIAL:' in page.inner_text('#resultBody'))
        check('partial confirmation checkbox is shown', page.is_visible('#partialConfirmWrap'))
        page.click('#downloadBtn')
        check('download blocked until partial is confirmed', 'confirm' in page.inner_text('#formError').lower(), page.inner_text('#formError'))
        page.check('#partialConfirm')
        with page.expect_download() as dl: page.click('#downloadBtn')
        check('partial file name carries _PARTIAL', dl.value.suggested_filename.endswith('_PARTIAL.csv'), dl.value.suggested_filename)
        ctx.close()
    finally: srv.terminate()
    browser.close()

ok = sum(1 for _, c in results if c)
print(f'\nBROWSER TEST: {ok}/{len(results)} checks passed')
sys.exit(0 if ok == len(results) else 1)
