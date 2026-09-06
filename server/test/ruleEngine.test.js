'use strict';
const assert = require('node:assert/strict');
const { indicator } = require('../src/ruleEngine/indicators');
const { evaluateRule, validateRule } = require('../src/ruleEngine/ruleEvaluator');

const history = Array.from({ length: 80 }, (_, i) => ({
  open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 100000 + i * 1000
}));

for (const name of ['SMA20','EMA20','RSI14','MACD','MACDSIGNAL','MACDHIST','BBUPPER','BBMIDDLE','BBLOWER','ATR14','ADX14','OBV','STOCHASTIC14','CCI20']) {
  assert.equal(typeof indicator(name, history), 'number', `${name} should produce a numeric value with sufficient history`);
}

const andRule = { type:'group', operator:'AND', rules:[
  { type:'condition', left:{ type:'indicator', name:'RSI14' }, operator:'>', right:50 },
  { type:'condition', left:{ type:'field', name:'close' }, operator:'>', right:{ type:'field', name:'open' } }
] };
assert.equal(validateRule(andRule).valid, true);
assert.equal(evaluateRule(andRule, history.at(-1), history).result, true);
assert.equal(evaluateRule({ type:'group', operator:'NOT', rules:[{ type:'condition', left:{ type:'field', name:'close' }, operator:'<', right:0 }] }, history.at(-1), history).result, true);
assert.equal(validateRule({ type:'group', operator:'NOT', rules:[] }).valid, false);
assert.equal(evaluateRule({ type:'condition', left:{ type:'field', name:'missing' }, operator:'>', right:1 }, history.at(-1), history).result, null);
console.log('ruleEngine.test.js: PASS');
