from dataclasses import dataclass
from typing import Protocol, Any

@dataclass(frozen=True)
class Signal:
    symbol: str
    date: str
    detected: bool
    status: str
    score: float

class ProductionVikramEngine(Protocol):
    def evaluate_session(self, symbol: str, history: Any) -> Signal:
        ...

def assert_production_engine(engine: Any) -> None:
    if getattr(engine, "is_synthetic", False):
        raise RuntimeError("Synthetic adapter cannot be used for a REAL VIKRAM backtest.")
    if not getattr(engine, "is_production_vikram", False):
        raise RuntimeError("Production VIKRAM engine is not verified. Refusing real backtest.")
