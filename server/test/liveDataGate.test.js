'use strict';
// #11 remediation tests. Runs fully offline: IndstocksClient accepts an injectable fetchImpl, so
// no real network call is ever made — a call reaching the fake fetch at all is exactly what we're
// asserting should (or should not) happen.
const assert = require('node:assert/strict');
const { IndstocksClient } = require('../src/liveData/indstocksClient');
const { InstrumentMapping } = require('../src/liveData/instrumentMapping');
const { TokenManager } = require('../src/liveData/tokenManager');
const { isLiveMarketDataEnabled, liveMarketDataStatus, LiveMarketDataDisabledError } = require('../src/liveData/gate');

function mappedInstruments() {
  return new InstrumentMapping().load([{ TRADING_SYMBOL: 'RELIANCE', SECURITY_ID: '2885', EXCH: 'NSE' }]);
}

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } });
}

async function main() {
  // 1. Disabled -> live provider path blocked, and no network call is attempted.
  await withEnv({ LIVE_MARKET_DATA_ENABLED: undefined, INDSTOCKS_API_KEY: 'k', INDSTOCKS_MPIN: 'm', INDSTOCKS_TOTP_SECRET: 'JBSWY3DPEHPK3PXP' }, async () => {
    let fetchCalled = false;
    const fetchImpl = async () => { fetchCalled = true; throw new Error('should not be called while disabled'); };
    const client = new IndstocksClient({ fetchImpl, instrumentMapping: mappedInstruments() });
    await assert.rejects(() => client.quote(['RELIANCE']), LiveMarketDataDisabledError);
    assert.equal(fetchCalled, false, 'no network call should be attempted while LIVE_MARKET_DATA_ENABLED is not true');
    assert.equal(isLiveMarketDataEnabled(), false);
    assert.equal(liveMarketDataStatus(new TokenManager()).status, 'DISABLED');
  });

  // 1b. Explicitly false is also disabled.
  await withEnv({ LIVE_MARKET_DATA_ENABLED: 'false' }, async () => {
    assert.equal(isLiveMarketDataEnabled(), false);
  });

  // 3. Enabled but missing provider configuration -> safe failure, not a fabricated quote.
  await withEnv({ LIVE_MARKET_DATA_ENABLED: 'true', INDSTOCKS_API_KEY: undefined, INDSTOCKS_MPIN: undefined, INDSTOCKS_TOTP_SECRET: undefined }, async () => {
    let fetchCalled = false;
    const fetchImpl = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
    const client = new IndstocksClient({ fetchImpl, instrumentMapping: mappedInstruments() });
    await assert.rejects(() => client.quote(['RELIANCE']), /INDSTOCKS_NOT_CONFIGURED/);
    assert.equal(fetchCalled, false, 'no network call should be attempted with missing provider credentials');
    const status = liveMarketDataStatus(new TokenManager());
    assert.equal(status.enabled, true);
    assert.equal(status.configured, false);
    assert.equal(status.status, 'ENABLED_BUT_NOT_CONFIGURED');
  });

  // 2. Enabled with valid configuration -> live path permitted (reaches the network layer).
  await withEnv({ LIVE_MARKET_DATA_ENABLED: 'true', INDSTOCKS_API_KEY: 'k', INDSTOCKS_MPIN: 'm', INDSTOCKS_TOTP_SECRET: 'JBSWY3DPEHPK3PXP' }, async () => {
    let fetchCalled = false;
    const fetchImpl = async (url) => {
      fetchCalled = true;
      if (String(url).includes('/generate/token')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    };
    const client = new IndstocksClient({ fetchImpl, instrumentMapping: mappedInstruments() });
    const result = await client.quote(['RELIANCE']).catch(e => { throw e; });
    assert.equal(fetchCalled, true, 'the live path should reach the network layer once enabled and configured');
    assert.ok(Array.isArray(result));
    const status = liveMarketDataStatus(new TokenManager());
    assert.equal(status.status, 'ENABLED');
  });

  // 4. Application status must never claim live data while disabled.
  await withEnv({ LIVE_MARKET_DATA_ENABLED: undefined }, () => {
    const status = liveMarketDataStatus(new TokenManager({}));
    assert.equal(status.enabled, false);
    assert.notEqual(status.status, 'ENABLED');
  });

  // 5. Every live-network entry point is gated, not just quote() — instrumentMapping.refresh()
  // must also be blocked while disabled (found on re-audit: it made its own network call).
  await withEnv({ LIVE_MARKET_DATA_ENABLED: undefined }, async () => {
    let fetchCalled = false;
    const mapping = new InstrumentMapping({ fetchImpl: async () => { fetchCalled = true; return { ok: true, text: async () => '' }; } });
    await assert.rejects(() => mapping.refresh('https://example.com/instruments.csv'), LiveMarketDataDisabledError);
    assert.equal(fetchCalled, false, 'instrumentMapping.refresh() must not reach the network while disabled');
  });

  console.log('liveDataGate.test.js: PASS');
}

main().catch(e => { console.error(e); process.exit(1); });
