def test_synthetic_status_is_not_real():
    summary = {
        "data_provenance": "SYNTHETIC_TEST_ONLY",
        "real_data_records": 0,
        "real_vikram_engine": False,
        "real_backtest": False,
    }
    assert summary["real_data_records"] == 0
    assert summary["real_vikram_engine"] is False
    assert summary["real_backtest"] is False
