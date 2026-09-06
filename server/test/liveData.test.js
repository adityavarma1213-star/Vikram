'use strict';
const assert=require('assert');
const {totp}=require('../src/liveData/tokenManager');const {normalizedQuote,STATUS}=require('../src/liveData/types');const {isMarketOpen}=require('../src/liveData/marketHours');const {evaluateDeduplication}=require('../src/alertEngine/deduplication');
assert.strictEqual(totp('JBSWY3DPEHPK3PXP',Date.UTC(1970,0,1,0,0,0)),'282760');assert.strictEqual(normalizedQuote({ltp:'x'}).ltp,null);assert.strictEqual(normalizedQuote({source:'EOD_CACHE',marketStatus:STATUS.EOD}).ltp,null);assert.strictEqual(isMarketOpen(new Date('2026-09-07T04:00:00Z')),true);assert.strictEqual(evaluateDeduplication({symbol:'TCS'},null,null,'NEW_MATCH_ONLY').shouldAlert,true);console.log('liveData.test.js: PASS');
