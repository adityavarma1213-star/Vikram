def require_real_backtest(manifest, engine):
    if manifest.get("real_data_records", 0) <= 0:
        raise RuntimeError("REAL DATA REQUIRED: manifest contains no real market records.")
    if manifest.get("data_provenance") != "REAL_NSE":
        raise RuntimeError("REAL DATA REQUIRED: provenance is not REAL_NSE.")
    if not getattr(engine, "is_production_vikram", False):
        raise RuntimeError("PRODUCTION VIKRAM ENGINE REQUIRED.")
    if getattr(engine, "is_synthetic", False):
        raise RuntimeError("SYNTHETIC ENGINE REFUSED FOR REAL BACKTEST.")
