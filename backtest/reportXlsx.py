#!/usr/bin/env python3
"""Builds RECOVERED_V15_Catch_History_Report.xlsx and .md from backtest/recovered/*.
Reads only the recovered outputs plus the untouched original performance block. Writes nothing else.
Missing values are written as the text N/A (never 0)."""
import csv, json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, 'recovered')
load = lambda n: json.load(open(os.path.join(R, n)))
def rows(n):
    with open(os.path.join(R, n), newline='', encoding='utf-8') as f: return list(csv.DictReader(f))
def val(x):
    if x in ('N/A', '', None): return 'N/A'
    try:
        f = float(x); return int(f) if f.is_integer() and '.' not in x else f
    except ValueError: return x

res, perf, comp, tel = load('RECOVERED_V15_HISTORICAL_RESULT.json'), load('RECOVERED_V15_PERFORMANCE.json'), load('RECOVERED_V15_BASELINE_COMPARISON.json'), load('RECOVERED_V15_TELEMETRY_AUDIT.json')
status, freq = load('RECOVERED_V15_SESSION_STATUS.json'), load('RECOVERED_V15_CATCH_FREQUENCY.json')
hist, out, diffs = rows('RECOVERED_V15_CATCH_HISTORY.csv'), rows('RECOVERED_V15_CATCH_OUTCOME.csv'), rows('RECOVERED_V15_BASELINE_DIFFERENCES.csv')

wb = Workbook(); HDR = PatternFill('solid', fgColor='1F2937')
def sheet(name, header, data, widths=None):
    ws = wb.create_sheet(name); ws.append(header)
    for c in ws[1]: c.font = Font(bold=True, color='FFFFFF'); c.fill = HDR; c.alignment = Alignment(wrap_text=True, vertical='top')
    for r in data: ws.append(r)
    ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions
    for i, h in enumerate(header, 1): ws.column_dimensions[get_column_letter(i)].width = (widths or {}).get(h, max(11, min(34, len(str(h)) + 4)))
    return ws

ws = wb.active; ws.title = 'Summary'
t = res['totals']
lines = [
 ('RECOVERED V15 REPLAY - NOT the original report', ''), ('V15 engine/config', 'UNCHANGED (hash-verified before replay)'),
 ('Replay period', json.dumps(res['replayPeriod'])), ('Dataset version', res['dataset'].get('datasetVersion') if isinstance(res['dataset'], dict) else str(res['dataset'])),
 ('Recovered catch-days', comp['recovered']['catchDays']), ('Recovered unique symbols', comp['recovered']['symbols']),
 ('Recovered events (signals)', perf['recoveredReplayAllSignals']['signals']),
 ('Original report catch-days / events / symbols', f"{comp['baseline']['catchDays']} / {comp['baseline']['events']} / {comp['baseline']['symbols']}"),
 ('Matched original catch-days', comp['matchedCatchDays']), ('Only in original', comp['onlyInBaseline']), ('Only in recovered (all after 2026-09-03)', comp['onlyInRecovered']),
 ('Unexpected differences', comp['unexpectedDifferences']), ('Field mismatches on matched rows (delivery/OI/changeOI)', len(comp['fieldMismatchesOnMatched'])),
 ('score / volumeRatio / OBV recovered on matched rows', json.dumps(comp['fieldRecoveryOnMatched'])),
 ('Session statuses', json.dumps(res['sessionStatusSummary'])),
 ('Corporate-action status', res['corporateActionStatus'] if isinstance(res['corporateActionStatus'], str) else json.dumps(res['corporateActionStatus'])),
 ('Excursions (MFE/MAE)', 'Close-to-close; stored data has no intraday high/low'),
]
for a, b in lines: ws.append([a, b])
ws.column_dimensions['A'].width = 56; ws.column_dimensions['B'].width = 110; ws['A1'].font = Font(bold=True, size=13)

H = ['symbol','tradeDate','eventIndex','streakDay','streakLength','close','verdict','confirmationStatus','score','priceChangePct','volume','avgVolume','volumeRatio','deliveryPct','deliveryQty','deliveryTrend','obv','obvTrend','futuresOi','changeOi','oiPct','oiExactDate','gateFailures','historyLength','evidence']
sheet('Catch History', H, [[val(r[h]) for h in H] for r in hist])
OH = list(out[0].keys()); sheet('Catch Outcome', OH, [[val(r[h]) for h in OH] for r in out])
DH = list(diffs[0].keys()); sheet('Baseline Differences', DH, [[r[h] for h in DH] for r in diffs], {'reason': 70})
sheet('Session Status', ['date','status','originalReportStatus','scanned','starting','confirmed','reason'], [[s['date'], s['status'], s['originalReportStatus'], *(('N/A' if s.get(k) is None else s[k]) for k in ('scanned','starting','confirmed')), s.get('reason','')] for s in status], {'reason': 70, 'originalReportStatus': 40})

def perf_rows(label, block):
    return [[label, h, d['sampleSize'], d['computed'], d['missing'], d['wins'], d['losses'], d['unchanged'], d['winRatePct'], d['lossRatePct'], d['unchangedRatePct'], d['avgReturnPct'], d['medianReturnPct'], d['bestReturnPct'], d['worstReturnPct'], d['avgMfePct'], d['avgMaePct'], d['avgMaxDrawdownPct']] for h, d in block['byHorizon'].items()]
pr = [[ 'ORIGINAL REPORT (untouched)', h, d['signalCount'], d['computedCount'], d['insufficientFutureData'], 'N/A','N/A','N/A', d['winRatePct'], 'N/A','N/A', d['avgReturnPct'], 'N/A','N/A','N/A','N/A','N/A','N/A'] for h, d in perf['originalReport']['horizonStats'].items()]
pr += perf_rows('RECOVERED - first detection <= 2026-09-03', perf['recoveredReplayFirstDetectionOnOrBefore_2026_09_03']) + perf_rows('RECOVERED like-for-like (exits capped to original data end)', perf['recoveredReplayLikeForLike_exitCappedToOriginalDataEnd']) + perf_rows('RECOVERED - all signals', perf['recoveredReplayAllSignals'])
sheet('Performance', ['basis','horizon','sample','computed','missing/insufficient','wins','losses','unchanged','winRate%','lossRate%','unchangedRate%','avgReturn%','median%','best%','worst%','avgMFE%','avgMAE%','avgMaxDD%'], pr, {'basis': 44})

def fr(rowsx, cols): return [[r.get(c, 'N/A') if r.get(c) is not None else 'N/A' for c in cols] for r in rowsx]
sheet('Freq Daily', ['date','status','scanned','starting','confirmed','newDetections','repeats','confirmationRatePct','dataQuality'], fr(freq['daily'], ['date','status','scanned','starting','confirmed','newDetections','repeats','confirmationRatePct','dataQuality']))
PC = ['period','sessions','verifiedSessions','unverifiedSessions','scanned','starting','confirmed','uniqueConfirmed','repeats','avgConfirmedPerSession','confirmationRatePct','trend','dataQuality']
sheet('Freq Weekly', PC, fr(freq['weekly'], PC), {'dataQuality': 38}); sheet('Freq Monthly', PC, fr(freq['monthly'], PC), {'dataQuality': 38})
sheet('Telemetry Audit', ['item','value'], [[k, json.dumps(v)] for k, v in tel.items()], {'item': 40, 'value': 100})
dst = os.path.join(R, 'RECOVERED_V15_Catch_History_Report.xlsx'); wb.save(dst); print('wrote', dst)
