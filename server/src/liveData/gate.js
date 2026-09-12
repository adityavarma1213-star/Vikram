'use strict';
// #11 remediation: LIVE_MARKET_DATA_ENABLED previously existed only as a line in
// FINAL_VIKRAM_LIVE_DATA_STATUS.md ("UNVERIFIED / DISABLED BY DEFAULT... until public-
// display/redistribution authorization is independently verified") — no code anywhere actually
// read the environment variable, so it did not control anything. This module is the single,
// actually-enforced gate: every live-provider call path must go through isLiveMarketDataEnabled()
// (or assertLiveMarketDataEnabled()) before it may reach the network, and any status surface must
// report liveMarketDataStatus() rather than assume/imply live data is available.

function isLiveMarketDataEnabled(env = process.env) {
  return String(env.LIVE_MARKET_DATA_ENABLED || '').trim().toLowerCase() === 'true';
}

class LiveMarketDataDisabledError extends Error {
  constructor() {
    super('Live market data is disabled (LIVE_MARKET_DATA_ENABLED is not set to true).');
    this.code = 'LIVE_MARKET_DATA_DISABLED';
  }
}

// Throws (does not silently no-op, does not fabricate a response) if live data is disabled.
// Callers that reach a live provider MUST call this first.
function assertLiveMarketDataEnabled(env = process.env) {
  if (!isLiveMarketDataEnabled(env)) throw new LiveMarketDataDisabledError();
}

// Single source of truth for any UI/status surface: never claim live data is active unless the
// flag is actually on, and separately report whether provider credentials are even present (so
// "enabled but misconfigured" is distinguishable from "disabled").
function liveMarketDataStatus(tokenManager, env = process.env) {
  const enabled = isLiveMarketDataEnabled(env);
  const configured = !!tokenManager?.configured;
  return {
    enabled,
    configured,
    status: !enabled ? 'DISABLED' : configured ? 'ENABLED' : 'ENABLED_BUT_NOT_CONFIGURED'
  };
}

module.exports = { isLiveMarketDataEnabled, assertLiveMarketDataEnabled, LiveMarketDataDisabledError, liveMarketDataStatus };
