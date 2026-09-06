from pathlib import Path

p = Path('server/test/accumulationEngine.test.js')
s = p.read_text(encoding='utf-8')
old = "const fallingObvHistory = base.map((r, i) => i === base.length - 1 ? { ...r, close: 104, prev_close: 105, volume: 2000, deliv_per: 60 } : r);"
new = "const fallingObvHistory = base.map((r, i) => { if (i < base.length - 5) return r; const closes = [104, 103, 102, 101, 100]; const prevs = [105, 104, 103, 102, 101]; return { ...r, close: closes[i - (base.length - 5)], prev_close: prevs[i - (base.length - 5)], volume: 2000, deliv_per: 60 }; });"
if old in s:
    p.write_text(s.replace(old, new, 1), encoding='utf-8')
else:
    print('OBV fixture already repaired; nothing to do.')
