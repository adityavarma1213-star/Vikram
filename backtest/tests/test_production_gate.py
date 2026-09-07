import pytest
from backtest.pipeline_contract import assert_production_engine

class Synthetic:
    is_synthetic = True
    is_production_vikram = False

class Unknown:
    is_synthetic = False
    is_production_vikram = False

def test_synthetic_engine_rejected():
    with pytest.raises(RuntimeError):
        assert_production_engine(Synthetic())

def test_unverified_engine_rejected():
    with pytest.raises(RuntimeError):
        assert_production_engine(Unknown())
