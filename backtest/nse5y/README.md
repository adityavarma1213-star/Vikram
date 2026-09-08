# VIKRAM 5+ Year NSE Historical Pipeline

This directory is the resumable historical-data foundation carried into the VIKRAM repository from the supplied Claude/Gemini pipeline work.

## Current truth

- Downloader code: present.
- Validation code: present.
- Manifest/checkpoint architecture: present.
- Trading-session handling: present.
- Real NSE historical acquisition: **NOT VERIFIED / NOT COMPLETED in this environment**.
- Real VIKRAM backtest: **NOT COMPLETED** until genuine NSE data is acquired and the actual `accumulation/engine.js` is executed chronologically.

Synthetic fixtures may be used only for software tests and must never be presented as VIKRAM performance.

## Target flow

`NSE/authorized source → raw immutable archive → checksum/manifest → validation → normalization → actual VIKRAM engine → chronological backtest → ASM → reports`

The historical archive must be resumable, idempotent, provenance-preserving, and extendable each trading day. It must support at least five years of validated trading-session history; 5–7 years is preferred where legally and technically available.
