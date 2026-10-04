# V15 engine forensic validation (read-only; no engine change)

| Area | Result | Evidence |
|---|---|---|
| Score and every metric (volumeRatio, OBV, OBV trend, delivery, price change) recomputed independently on 2,676 symbols | CORRECT | 0 mismatches |
| Confirmation gates (score >= 75, price > 0.25%, volumeRatio >= 1.2, delivery >= 45, OBV trend > 0, exact-date change-OI > 0, history >= 10) | CORRECT | All 888 recovered confirmed rows satisfy every gate (telemetry audit) |
| Point-in-time safety (no look-ahead) | CORRECT | `telemetryRetention.test.js` changes all rows after day D; decisions up to D identical |
| Exact-date OI matching | CORRECT | Futures matched on `symbol|date` only |
| Missing vs zero inside the engine | CORRECT | The engine does not coerce; zero-fill came from ingestion (fixed outside the engine) |
| Near-month contract choice (expiry week change-OI turns negative, so few CONFIRMED near expiry) | UNKNOWN / spec silent | Behaves as written. Not changed. Changing it would be tuning, not a defect fix |
| Sep 4-15 zero confirmations | DATA defect, not engine | Delivery was zero-filled; engine cannot confirm without delivery |

No genuine V15 implementation defect was proven, so no V15 file was edited. Hashes in `frozen-hashes.json` are enforced by `backtest/test/v15Frozen.test.js` and by the replay itself.
