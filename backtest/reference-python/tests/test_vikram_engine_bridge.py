import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from src.backtest.vikram_engine_bridge import (
    load_engine_provenance, evaluate_real_vikram_signal, RealEngineUnavailableError,
)

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "fake_accumulation_engine.js")
NONEXISTENT_PATH = "/definitely/does/not/exist/accumulation/engine.js"


def test_hard_failure_when_engine_missing():
    with pytest.raises(RealEngineUnavailableError) as exc_info:
        load_engine_provenance(NONEXISTENT_PATH)
    assert RealEngineUnavailableError.CODE in str(exc_info.value)


def test_evaluate_real_signal_hard_fails_when_engine_missing():
    with pytest.raises(RealEngineUnavailableError):
        evaluate_real_vikram_signal({"bars_up_to_t0": []}, engine_path=NONEXISTENT_PATH)


def test_bridge_mechanism_works_against_labeled_test_fixture():
    provenance = load_engine_provenance(FIXTURE_PATH)
    bars = [
        {"date": "2024-01-01", "close": 100},
        {"date": "2024-01-02", "close": 101},
        {"date": "2024-01-03", "close": 102},
    ]
    result = evaluate_real_vikram_signal({"bars_up_to_t0": bars}, engine_path=FIXTURE_PATH)
    assert result.verdict == "FIXTURE_TEST_VERDICT"
    assert result.raw_output["engine"] == "TEST_FIXTURE_NOT_REAL_VIKRAM"
    assert result.provenance.sha256 == provenance.sha256


def test_bridge_passes_only_truncated_data_it_is_given():
    result = evaluate_real_vikram_signal(
        {"bars_up_to_t0": [{"date": "2024-01-01", "close": 100}]},
        engine_path=FIXTURE_PATH,
    )
    assert result.raw_output["bars_seen"] == 1
