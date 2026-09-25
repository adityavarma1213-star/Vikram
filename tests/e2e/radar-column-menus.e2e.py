"""Full E2E for the 2026-09-22 Opportunity Radar redesign: table-header column menus replacing the
old separate filter bar, Universe pills, and the new OBV/Volume/Delivery/OI-Change filters.
Usage: python3 tests/e2e/radar-column-menus.e2e.py [BASE_URL]   default http://localhost:8771
Read-only against real data/scanner.json; works against the live site too."""
import sys, json
from playwright.sync_api import sync_playwright
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8771').rstrip('/')
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS' if cond else 'FAIL'), '-', name, ('| ' + str(detail)[:260]) if not cond else '')

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1440, 'height': 900}).new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '/index.html', wait_until='load'); pg.wait_for_selector('#scannerCards table', timeout=120000); pg.wait_for_timeout(300)

    data = pg.evaluate("fetch('data/scanner.json',{cache:'no-store'}).then(r=>r.json()).then(d=>d.results)")
    total = len(data)
    match = pg.eval_on_selector('#filterMatchCount', 'e=>e.textContent')

    # ---------------- Point 3: no separate filter bar; only header controls ----------------
    check('No .radar-filter-bar exists (old bar removed)', pg.locator('.radar-filter-bar').count() == 0)
    check('No Verdict/Score/Sort trigger buttons or menus remain', pg.locator('#verdictFilterTrigger,#scoreFilterTrigger,#sortSelectTrigger,#verdictFilterMenu,#scoreFilterMenu,#sortSelectMenu').count() == 0)
    check('#filterMatchCount / Reset filters still present (not a "filter" per se, kept)', pg.locator('#filterMatchCount').count() == 1 and pg.locator('#clearScannerFilters').count() == 1)

    # ---------------- Point 2: row VERDICT column distinct from filter control ----------------
    check('Exactly one VERDICT table column (header) exists', pg.locator('#scannerCards thead th[data-col-menu="verdict"]').count() == 1)
    check('Row-level verdict values are rendered in that column', pg.inner_text('#scannerCards tbody tr:nth-child(1) td:nth-child(11)') != '')

    def th(key): return f'#scannerCards thead th[data-col-menu="{key}"]'
    def open_menu(key):
        pg.click(th(key)); pg.wait_for_selector('#radarColumnMenu:not([hidden])', timeout=5000)
    def menu_opts(): return pg.eval_on_selector_all('#radarColumnMenu .radar-filter-option', 'els=>els.map(e=>e.textContent.trim())')
    def pick(text): pg.click(f'#radarColumnMenu .radar-filter-option:has-text("{text}")'); pg.wait_for_timeout(250)
    def menu_hidden(): return pg.get_attribute('#radarColumnMenu', 'hidden') is not None
    def pagination(): return pg.inner_text('#tablePagination')
    def match_count(): return pg.inner_text('#filterMatchCount')
    def matches(expected):
        if expected == 0: return match_count().strip() == '0 matching stocks'
        return f'{expected} matching' in pagination()

    # ---------------- Point 1 + item 1-7: Verdict header full flow ----------------
    open_menu('verdict')
    check('1. VERDICT header opens options', not menu_hidden(), menu_hidden())
    opts = menu_opts()
    check('Verdict options are EXACT canonical set (no substring matching risk)', opts == ['All Verdicts', 'Confirmed', 'Starting', 'Unconfirmed / Mixed', 'Distribution'], opts)
    exp_starting = sum(1 for r in data if r['verdict'] == 'ACCUMULATION STARTING')
    exp_confirmed = sum(1 for r in data if r['verdict'] == 'ACCUMULATION CONFIRMED')
    exp_unconfirmed = sum(1 for r in data if r['verdict'] == 'UNCONFIRMED / MIXED')
    exp_distribution = sum(1 for r in data if r['verdict'] == 'DISTRIBUTION')
    pick('Starting')
    check('2. Verdict option selectable', True)
    check('4. Menu closes after selection', menu_hidden())
    check('3. Selected Verdict filters rows', matches(exp_starting), (exp_starting, pagination()))
    rows_verdict = pg.eval_on_selector_all('#scannerCards tbody tr td:nth-child(11)', 'els=>els.map(e=>e.textContent.trim())')
    check('   all visible rows are ACCUMULATION STARTING', all(v == 'ACCUMULATION STARTING' for v in rows_verdict), set(rows_verdict))
    open_menu('verdict')
    check('5. Verdict can be reopened', not menu_hidden())
    check('   current selection shown as active', pg.eval_on_selector('#radarColumnMenu .radar-filter-option:has-text("Starting")', "e=>e.getAttribute('aria-selected')") == 'true')
    pick('Distribution')
    check('   selecting Distribution changes the table', matches(exp_distribution), (exp_distribution, pagination()))
    open_menu('verdict'); pick('Unconfirmed / Mixed')
    check('7. Unconfirmed / Mixed distinct from Confirmed (exact match, no substring collision)', matches(exp_unconfirmed) and exp_unconfirmed != exp_confirmed, (exp_unconfirmed, exp_confirmed, pagination()))
    open_menu('verdict'); pick('Confirmed')
    check('   Confirmed is its own exact bucket (0 rows in current data -- confirmation gate is frozen, not touched)', matches(exp_confirmed), (exp_confirmed, pagination(), match_count()))
    check('   Zero-result state: header row still present (not trapped -- can reopen VERDICT directly)', pg.locator('#scannerCards thead th[data-col-menu="verdict"]').count() == 1)
    check('   Zero-result state: empty message shown as a full-width row, not by deleting the table', pg.locator('#scannerCards .empty-cell').count() == 1)
    open_menu('verdict'); pick('All Verdicts')
    check('6. All Verdicts restores all eligible rows', matches(total), pagination())

    # ---------------- item 8-9: Score header ----------------
    open_menu('score')
    check('8. Score header opens its options', not menu_hidden())
    sopts = menu_opts()
    check('   Score options are the existing bucket set (no invented thresholds)', 'Any' in sopts[0] and any('75' in o for o in sopts) and any('55' in o for o in sopts) and any('50' in o for o in sopts), sopts)
    exp75 = sum(1 for r in data if (r.get('score') or 0) >= 75)
    pick('\u2265 75')
    check('9. Score filtering works', matches(exp75), (exp75, pagination()))
    open_menu('score'); pick('Any')

    # ---------------- item 10: other filterable headers open options ----------------
    for key, expect_groups in [('obv', ['Filter']), ('volume', ['Filter', 'Sort']), ('delivery', ['Filter', 'Sort']), ('oiChange', ['Filter', 'Sort']), ('stock', ['Sort']), ('price', ['Sort']), ('today', ['Sort']), ('futuresOi', ['Sort'])]:
        open_menu(key)
        headings = pg.eval_on_selector_all('#radarColumnMenu .radar-col-menu-heading', 'els=>els.map(e=>e.textContent.trim())')
        check(f'10. {key} header opens options ({"/".join(expect_groups)})', not menu_hidden() and headings == expect_groups, (key, headings))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    check('RANK and ACTIONS have no menu (not interactive, per spec)', pg.locator('#scannerCards thead th[data-col-menu="rank"],#scannerCards thead th[data-col-menu="actions"]').count() == 0)

    # ---------------- new filters: OBV / Volume Breakout / High Delivery / OI Build-up ----------------
    exp_rising = sum(1 for r in data if r['metrics'].get('obvTrend') is not None and r['metrics']['obvTrend'] > 0)
    open_menu('obv'); pick('Rising')
    check('OBV Trend "Rising" filter matches the exact sign test used to render the column', matches(exp_rising), (exp_rising, pagination()))
    open_menu('obv'); pick('All')

    exp_breakout = sum(1 for r in data if (r['metrics'].get('volumeRatio') or 0) >= 2)
    open_menu('volume'); pick('Volume Breakout')
    check('Volume Breakout (>=2x) reuses opportunityRadar.js threshold exactly', matches(exp_breakout), (exp_breakout, pagination()))
    open_menu('volume'); pick('All')

    exp_highdel = sum(1 for r in data if (r['metrics'].get('deliveryPct') or 0) >= 60)
    open_menu('delivery'); pick('High Delivery')
    check('High Delivery (>=60%) filter applies (0 expected -- known deliveryPct=0 data issue, reported separately)', matches(exp_highdel), (exp_highdel, pagination(), match_count()))
    open_menu('delivery'); pick('All')

    exp_buildup = sum(1 for r in data if r['metrics'].get('changeOi') is not None and r['metrics']['changeOi'] > 0)
    open_menu('oiChange'); pick('OI Build-up')
    check('OI Build-up (changeOi>0, nulls excluded per Missing != Zero) filter applies', matches(exp_buildup), (exp_buildup, pagination()))
    open_menu('oiChange'); pick('All')

    # ---------------- Universe pills (item 11-17) ----------------
    check('11. Universe pills present and open/act immediately (blueprint UX, no separate "open")', pg.locator('.radar-universe-pill').count() == 4)
    exp50 = sum(1 for r in data if 'NIFTY 50' in (r.get('indexMembership') or []))
    exp200 = sum(1 for r in data if 'NIFTY 200' in (r.get('indexMembership') or []))
    exp500 = sum(1 for r in data if 'NIFTY 500' in (r.get('indexMembership') or []))
    pg.click('.radar-universe-pill:has-text("NIFTY 50")'); pg.wait_for_timeout(250)
    check('12. NIFTY 50 selection works using verified membership data', matches(exp50), (exp50, pagination()))
    check('   NIFTY 50 pill shows active state', 'active' in (pg.get_attribute('.radar-universe-pill:has-text("NIFTY 50")', 'class') or ''))
    pg.click('.radar-universe-pill:has-text("NIFTY 200")'); pg.wait_for_timeout(250)
    check('14. NIFTY 200 selection works', matches(exp200), (exp200, pagination()))
    pg.click('.radar-universe-pill:has-text("NIFTY 500")'); pg.wait_for_timeout(250)
    check('15. NIFTY 500 selection works', matches(exp500), (exp500, pagination()))
    check('13/16/17. NIFTY 100/Next 50/Midcap/Smallcap/Microcap/Total Market: NOT offered (data unavailable, documented, not faked)',
          pg.locator('.radar-universe-pill:has-text("NIFTY 100"),.radar-universe-pill:has-text("Next 50"),.radar-universe-pill:has-text("Midcap"),.radar-universe-pill:has-text("Smallcap"),.radar-universe-pill:has-text("Microcap"),.radar-universe-pill:has-text("Total Market")').count() == 0
          and 'DATA NOT AVAILABLE' in pg.inner_text('.radar-universe-note'))
    check('18. F&O / Cash Market filters: NOT offered (data unavailable, documented)', pg.locator('.radar-universe-pill:has-text("F&O"),.radar-universe-pill:has-text("Cash Market")').count() == 0 and 'F&O' in pg.inner_text('.radar-universe-note'))
    pg.click('.radar-universe-pill:has-text("All NSE Stocks")'); pg.wait_for_timeout(250)

    # ---------------- item 19-20: Reset, multiple filters together ----------------
    open_menu('verdict'); pick('Starting')
    open_menu('score'); pick('\u2265 75')
    pg.click('.radar-universe-pill:has-text("NIFTY 500")'); pg.wait_for_timeout(200)
    exp_combo = sum(1 for r in data if r['verdict'] == 'ACCUMULATION STARTING' and (r.get('score') or 0) >= 75 and 'NIFTY 500' in (r.get('indexMembership') or []))
    check('20. Multiple filters (Verdict+Score+Universe) work together', matches(exp_combo), (exp_combo, pagination()))
    pg.click('#clearScannerFilters'); pg.wait_for_timeout(300)
    check('19. Reset restores full universe and all filters to default', matches(total) and pg.eval_on_selector('#universeFilter', 'e=>e.value') == 'ALL' and pg.eval_on_selector('#verdictFilter', 'e=>e.value') == 'ALL', pagination())
    check('   Reset also clears the 4 new filters', all(pg.eval_on_selector(f'#{i}', 'e=>e.value') == 'ALL' for i in ('obvFilter', 'volumeFilter', 'deliveryFilter', 'oiChangeFilter')))

    # ---------------- item 21: sorting does not break filtering ----------------
    open_menu('verdict'); pick('Starting')
    open_menu('score')
    pg.click('#radarColumnMenu .radar-filter-option:has-text("Score: Low")'); pg.wait_for_timeout(250)
    scores = pg.eval_on_selector_all('#scannerCards tbody tr td:nth-child(4)', 'els=>els.map(e=>Number(e.textContent))')
    check('21. Sort does not break filtering (still Starting, now ascending)', matches(exp_starting) and scores == sorted(scores), (exp_starting, pagination(), scores[:5]))
    pg.click('#clearScannerFilters'); pg.wait_for_timeout(300)

    # ---------------- item 22-24: no duplicate engines ----------------
    check('22. No duplicate filter engine: exactly one #radarColumnMenu instance', pg.locator('#radarColumnMenu').count() == 1)
    check('23. No old filter bar remains (re-check)', pg.locator('.radar-filter-bar,.radar-filter-chip').count() == 0)
    check('24. The separate #opportunityRadar (disclosure-list) section is untouched and distinct -- documented in report, not modified here', pg.locator('#opportunityRadar').count() == 1)

    # ---------------- accessibility ----------------
    pg.keyboard.press('Tab')
    open_menu('verdict')
    check('Escape closes the open menu', True)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    check('   ...confirmed closed', menu_hidden())
    open_menu('verdict')
    pg.click('body', position={'x': 5, 'y': 5})
    pg.wait_for_timeout(150)
    check('Clicking outside closes the menu', menu_hidden())
    open_menu('score'); check_a = not menu_hidden()
    open_menu('verdict')
    check('Only one menu open at a time (opening a 2nd closes/replaces the 1st)', check_a and not menu_hidden() and pg.locator('#radarColumnMenu').count() == 1)
    pg.click('body', position={'x': 5, 'y': 5}); pg.wait_for_timeout(150)

    check('No page errors so far', not errs, errs)
    b.close()

    # ---------------- responsive: tablet + mobile ----------------
    for w, h in ((768, 1024), (390, 844)):
        ctx = p.chromium.launch().new_context(viewport={'width': w, 'height': h})
        pg2 = ctx.new_page(); errs2 = []; pg2.on('pageerror', lambda e: errs2.append(str(e)))
        pg2.goto(BASE + '/index.html', wait_until='load'); pg2.wait_for_selector('#scannerCards table', timeout=120000); pg2.wait_for_timeout(400)
        check(f'{w}px: no old filter bar', pg2.locator('.radar-filter-bar').count() == 0)
        check(f'{w}px: Universe pills visible', pg2.is_visible('.radar-universe-pill'))
        pg2.click('#scannerCards thead th[data-col-menu="verdict"]'); pg2.wait_for_timeout(300)
        visible = pg2.is_visible('#radarColumnMenu')
        box = pg2.eval_on_selector('#radarColumnMenu', "e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}") if visible else None
        in_viewport = visible and box and box['left'] >= 0 and box['right'] <= w and box['top'] >= 0 and box['bottom'] <= h
        check(f'{w}px: VERDICT menu opens, fully within viewport (not clipped/off-screen)', in_viewport, box)
        pg2.click(f'#radarColumnMenu .radar-filter-option:has-text("Starting")'); pg2.wait_for_timeout(300)
        check(f'{w}px: selecting an option filters correctly at this width', f'{exp_starting} matching' in pg2.inner_text('#tablePagination'))
        pg2.click('#clearScannerFilters'); pg2.wait_for_timeout(200)
        # also check the right-most column (OI CHANGE) doesn't get clipped
        pg2.click('#scannerCards thead th[data-col-menu="oiChange"]'); pg2.wait_for_timeout(300)
        box2 = pg2.eval_on_selector('#radarColumnMenu', "e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}}")
        check(f'{w}px: right-edge column (OI CHANGE) menu also stays within viewport width', box2['left'] >= 0 and box2['right'] <= w, box2)
        check(f'{w}px: no page errors', not errs2, errs2)
        ctx.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
