# VIKRAM LIVE MARKET DATA STATUS

## Current implementation
The existing INDstocks live-data modules are now connected to the Express server and exposed to the VIKRAM website through safe server-side routes. The Accumulation Engine/EOD scanner path was not replaced.

## Provider
INDstocks

## Website
The main VIKRAM Settings section now shows live-data readiness and includes a server-mediated **Test Live Quote** control. Provider credentials are never entered into or stored in browser code.

## API routes
- `GET /api/live/status` — reports enabled/configured/instrument-mapping state without exposing secrets.
- `GET /api/live/quotes?symbols=RELIANCE` — requests verified live quotes through the server and returns provider data only when live data is explicitly enabled.

## Configuration
Required server-side environment variables are documented in `.env.example`:
- `LIVE_MARKET_DATA_ENABLED`
- `INDSTOCKS_API_KEY`
- `INDSTOCKS_MPIN`
- `INDSTOCKS_TOTP_SECRET`
- `INDSTOCKS_INSTRUMENTS_URL`
- optional token/base URL overrides

## Production status
LIVE MARKET DATA: **NOT YET VERIFIED**. Real provider credentials have not been supplied in this development environment, and provider authorization for public display/redistribution has not been independently verified. Therefore VIKRAM must continue to show a not-ready state until those gates are satisfied.

## Integrity
No live LTP, connection result, provider response, deployment status, or licensing approval is fabricated. Live quotes remain an overlay and do not replace verified EOD scanner calculations.

## Verified repository change
PR #4 was merged to `main`, adding the server integration and website Settings visibility for live market data.
