"""
Real VIKRAM Engine Bridge — CROSS-CLAUDE REFERENCE ONLY

This module is retained from the standalone Python pipeline as a tested
integration-boundary pattern. It is NOT the canonical VIKRAM scoring engine.
The canonical scoring authority remains accumulation/engine.js in the parent
VIKRAM repository.

The bridge refuses to substitute the Python placeholder when real mode is
requested. When a real JS engine path is supplied, it records SHA-256
provenance, invokes Node.js, and parses a JSON verdict. In the standalone
Claude environment this was tested only with an explicitly labeled fake
fixture, never with real VIKRAM scoring logic.
"""
from __future__ import annotations
import os
import json
import hashlib
import subprocess
import shutil
from dataclasses import dataclass
from typing import Optional


class RealEngineUnavailableError(Exception):
    CODE = "REAL_VIKRAM_ENGINE_UNAVAILABLE"

    def __init__(self, detail: str):
        super().__init__(f"{self.CODE}: {detail}")
        self.detail = detail


@dataclass(frozen=True)
class EngineProvenance:
    engine_path: str
    sha256: str


@dataclass(frozen=True)
class EngineVerdict:
    verdict: Optional[str]
    raw_output: dict
    provenance: EngineProvenance


def _resolve_engine_path(engine_path: Optional[str]) -> str:
    path = engine_path or os.environ.get("VIKRAM_ENGINE_PATH") or os.path.join(
        os.path.dirname(__file__), "..", "..", "external_engine", "accumulation", "engine.js"
    )
    return os.path.abspath(path)


def _require_node() -> str:
    node = shutil.which("node") or shutil.which("nodejs")
    if not node:
        raise RealEngineUnavailableError("Node.js runtime not found on this machine")
    return node


def load_engine_provenance(engine_path: Optional[str] = None) -> EngineProvenance:
    resolved = _resolve_engine_path(engine_path)
    if not os.path.exists(resolved):
        raise RealEngineUnavailableError(
            f"no accumulation/engine.js found at '{resolved}'. Supply the canonical engine or set VIKRAM_ENGINE_PATH."
        )
    with open(resolved, "rb") as f:
        content = f.read()
    return EngineProvenance(engine_path=resolved, sha256=hashlib.sha256(content).hexdigest())


def evaluate_real_vikram_signal(
    historical_record_up_to_t0: dict,
    engine_path: Optional[str] = None,
    timeout_seconds: int = 30,
) -> EngineVerdict:
    provenance = load_engine_provenance(engine_path)
    node = _require_node()
    payload = json.dumps(historical_record_up_to_t0)
    try:
        proc = subprocess.run(
            [node, provenance.engine_path],
            input=payload,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise RealEngineUnavailableError(f"engine invocation timed out after {timeout_seconds}s") from exc

    if proc.returncode != 0:
        raise RealEngineUnavailableError(
            f"engine exited with code {proc.returncode}; stderr: {proc.stderr.strip()[:500]}"
        )

    try:
        parsed = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RealEngineUnavailableError(
            f"engine produced non-JSON output; cannot trust it as a real verdict: {proc.stdout[:200]!r}"
        ) from exc

    return EngineVerdict(verdict=parsed.get("verdict"), raw_output=parsed, provenance=provenance)
