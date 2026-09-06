from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index = ROOT / 'index.html'
text = index.read_text(encoding='utf-8')
text = text.replace('href="accumulation.html"', 'href="index.html#scannerSurface"')

# Keep the scanner inside the dashboard viewport on desktop. The previous
# min-width forced the right half of the nine-column table off-screen.
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

mobile_marker = '@media(max-width:760px){'
mobile = ('@media(max-width:1100px){.scanner-table{min-width:760px;table-layout:auto}'
          '.scanner-table th,.scanner-table td{white-space:nowrap}'
          '.scanner-table-wrap{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}}\n')
if '@media(max-width:1100px)' not in text and mobile_marker in text:
    text = text.replace(mobile_marker, mobile + mobile_marker, 1)

index.write_text(text, encoding='utf-8')
(ROOT / 'accumulation.html').unlink(missing_ok=True)

assert '.scanner-table{width:100%;min-width:0;table-layout:fixed' in text
assert 'scanner-table-wrap' in text
