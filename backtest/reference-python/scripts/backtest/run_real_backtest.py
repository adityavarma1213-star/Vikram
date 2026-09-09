"""Hard-gated reference runner from the cross-Claude Python pipeline.

This is NON-PRODUCTION reference infrastructure. It never falls back to
synthetic data or a placeholder signal rule. The canonical production
backtest remains the JavaScript VIKRAM pipeline using accumulation/engine.js.
"""
import os
import sys
import json
import glob

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from src.backtest.vikram_engine_bridge import load_engine_provenance, RealEngineUnavailableError

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "validated")


def check_data_ready():
    if not os.path.isdir(DATA_DIR):
        return False, f"DATA_READY: FAIL — {DATA_DIR} does not exist"
    files = glob.glob(os.path.join(DATA_DIR, "*.json")) + glob.glob(os.path.join(DATA_DIR, "*.csv"))
    real_files = []
    for fp in files:
        try:
            if fp.endswith(".json"):
                with open(fp) as f:
                    content = json.load(f)
                if isinstance(content, dict) and str(content.get("SOURCE", "")).startswith("SYNTHETIC"):
                    continue
            real_files.append(fp)
        except Exception:
            continue
    if not real_files:
        return False, f"DATA_READY: FAIL — no non-synthetic validated files found in {DATA_DIR}"
    return True, f"DATA_READY: PASS — {len(real_files)} validated real file(s) found"


def check_engine_integrated():
    try:
        prov = load_engine_provenance()
        return True, f"ENGINE_INTEGRATED: PASS — {prov.engine_path} (sha256={prov.sha256[:16]}...)"
    except RealEngineUnavailableError as exc:
        return False, f"ENGINE_INTEGRATED: FAIL — {exc}"


def main():
    print("=== REAL VIKRAM BACKTEST — REFERENCE GATE STATUS ===\n")
    print("CODE_READY: PASS — reference bridge and runner import cleanly")
    data_ok, data_msg = check_data_ready()
    print(data_msg)
    engine_ok, engine_msg = check_engine_integrated()
    print(engine_msg)
    if not (data_ok and engine_ok):
        print("\nBACKTEST_EXECUTED: NOT ATTEMPTED — both DATA_READY and ENGINE_INTEGRATED are required")
        print("STATISTICAL_VALIDATION_COMPLETE: NOT ATTEMPTED")
        print("PRODUCTION_VERIFIED: FAIL")
        print("Hard stop: no placeholder adapter and no synthetic substitution.")
        return 1
    print("Both gates passed. This reference runner deliberately stops before claiming a production run;")
    print("use the canonical JavaScript VIKRAM backtest runner for the actual production execution.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
