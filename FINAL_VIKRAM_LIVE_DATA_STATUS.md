# VIKRAM LIVE MARKET DATA STATUS

## Merge status
The live-data and alert-layer implementation from the supplied Gemini implementation package has been added to the legacy Express/vanilla VIKRAM repository as isolated server-side modules. Existing scanner/accumulation code was not replaced.

## Provider
INDstocks

## Public live data
UNVERIFIED / DISABLED BY DEFAULT. `LIVE_MARKET_DATA_ENABLED=false` until public-display/redistribution authorization is independently verified.

## Live API test
NOT RUN. Real provider credentials were not supplied. No live response, LTP, connection, deployment, or licensing approval is fabricated.

## Architecture
Frontend -> VIKRAM server/live-data layer -> INDstocks. Provider credentials remain server-side. Live quotes are an overlay and do not alter EOD scanner calculations.

## Added modules
- `server/src/liveData/types.js`
- `server/src/liveData/tokenManager.js`
- `server/src/liveData/instrumentMapping.js`
- `server/src/liveData/indstocksClient.js`
- `server/src/liveData/marketHours.js`
- `server/src/liveData/relayService.js`
- `server/src/liveData/index.js`
- `server/src/alertEngine/types.js`
- `server/src/alertEngine/deduplication.js`
- `server/src/alertEngine/alertEngine.js`
- `server/src/alertEngine/emailNotifier.js`
- `server/src/alertEngine/fcm/fcmSender.js`
- `server/test/liveData.test.js`
- `public/firebase-messaging-sw.js`
- `.env.example`

## Protected
Existing Option B/scanner, accumulation, ingestion, static snapshot, UI, data and regression files remain in the repository. No Option B rewrite was performed.

## Gates
CODE COMPLETE: UNVERIFIED until the merged repository is installed and the full relevant test suite passes.
LIVE DATA CONNECTED: UNVERIFIED — credentials not supplied.
PUBLIC PRODUCTION LIVE DATA VERIFIED: UNVERIFIED — authorization and production deployment not verified.
