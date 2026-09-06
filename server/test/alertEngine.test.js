'use strict';
const assert=require('node:assert/strict');
const {detectNewMatches}=require('../src/alerts/newMatchDetector');
const email=require('../src/alerts/providers/email');
const push=require('../src/alerts/providers/push');
(async()=>{
  assert.equal(email.isConfigured(),false);
  assert.equal(push.isConfigured(),false);
  const calls=[];
  const client={query:async(sql,args)=>{calls.push({sql,args});if(/^SELECT 1/.test(sql))return{rowCount:0};return{rowCount:1};},release(){}};
  const pool={connect:async()=>client};
  const out=await detectNewMatches(pool,'test',[{symbol:'ABC',tradeDate:'2026-09-05'}]);
  assert.deepEqual(out,[{symbol:'ABC',tradeDate:'2026-09-05'}]);
  assert.ok(calls.some(c=>c.sql.includes('scanner_matches_seen')));
  console.log('alertEngine.test.js: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
