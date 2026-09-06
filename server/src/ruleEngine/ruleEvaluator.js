'use strict';

const { indicator } = require('./indicators');

const OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=']);
const GROUPS = new Set(['AND', 'OR', 'NOT']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readPath(source, path) {
  if (!source || typeof path !== 'string' || !path.trim()) return null;
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return null;
    return current[key] ?? current[String(key).toLowerCase()] ?? null;
  }, source);
}

function fieldValue(field, row) {
  const name = field?.name ?? field?.field;
  if (!name) return null;
  const direct = readPath(row, name);
  if (direct !== null && direct !== undefined) return direct;

  const lower = String(name).toLowerCase();
  const aliases = {
    price: ['close', 'last_price'],
    close: ['close', 'last_price'],
    volume: ['volume'],
    delivery: ['deliv_per', 'delivery_pct', 'deliveryPct'],
    deliverypct: ['deliv_per', 'delivery_pct', 'deliveryPct'],
    change: ['priceChangePct', 'changePct'],
    score: ['score', 'vikramScore'],
    verdict: ['verdict']
  };
  for (const alias of aliases[lower] || []) {
    const value = readPath(row, alias);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function nativeValue(field, row) {
  const name = field?.name ?? field?.field;
  if (!name) return null;
  return readPath(row, name.replace(/^VIKRAM\./i, ''));
}

function resolveValue(field, row, history) {
  if (!isObject(field)) return field;
  const type = String(field.type || 'field').toLowerCase();
  if (type === 'indicator') return indicator(field.name, history);
  if (type === 'native' || type === 'vikram') return nativeValue(field, row);
  if (type === 'field') return fieldValue(field, row);
  return null;
}

function compare(a, operator, b) {
  if (!OPERATORS.has(operator)) return null;
  if (a === null || a === undefined || b === null || b === undefined) return null;

  const leftNumber = finite(a);
  const rightNumber = finite(b);
  if (leftNumber !== null && rightNumber !== null) {
    a = leftNumber;
    b = rightNumber;
  } else if (operator !== '==' && operator !== '!=') {
    return null;
  }

  switch (operator) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: return null;
  }
}

function validateOperand(operand, side) {
  if (!isObject(operand)) return { valid: true };
  const type = String(operand.type || '').toLowerCase();
  if (!['field', 'indicator', 'native', 'vikram'].includes(type)) {
    return { valid: false, error: `${side} operand has unsupported type` };
  }
  if (!String(operand.name ?? operand.field ?? '').trim()) {
    return { valid: false, error: `${side} operand requires name` };
  }
  return { valid: true };
}

function validateRule(rule) {
  if (!isObject(rule)) return { valid: false, error: 'Rule must be an object' };
  if (rule.type === 'condition') {
    if (!OPERATORS.has(rule.operator)) return { valid: false, error: 'Condition has unsupported operator' };
    const left = validateOperand(rule.left, 'left');
    if (!left.valid) return left;
    if (rule.right === undefined) return { valid: false, error: 'Condition requires right operand' };
    const right = validateOperand(rule.right, 'right');
    if (!right.valid) return right;
    return { valid: true };
  }
  if (rule.type === 'group') {
    const operator = String(rule.operator || '').toUpperCase();
    if (!GROUPS.has(operator)) return { valid: false, error: 'Group has unsupported operator' };
    if (!Array.isArray(rule.rules) || rule.rules.length === 0) return { valid: false, error: `${operator} group requires rules` };
    if (operator === 'NOT' && rule.rules.length !== 1) return { valid: false, error: 'NOT group requires exactly one rule' };
    for (const child of rule.rules) {
      const result = validateRule(child);
      if (!result.valid) return result;
    }
    return { valid: true };
  }
  return { valid: false, error: 'Unsupported rule type' };
}

function evaluateRule(rule, row, history) {
  const validation = validateRule(rule);
  if (!validation.valid) return { result: null, reason: `N/A: ${validation.error}` };

  if (rule.type === 'condition') {
    const left = resolveValue(rule.left, row, history);
    const right = resolveValue(rule.right, row, history);
    const result = compare(left, rule.operator, right);
    const leftLabel = rule.left?.name || rule.left?.field || rule.left;
    const rightLabel = isObject(rule.right) ? (rule.right.name || rule.right.field || rule.right.type) : rule.right;
    return {
      result,
      reason: result === null
        ? `${leftLabel} ${rule.operator} ${rightLabel ?? 'N/A'} → N/A: insufficient verified data/history`
        : `${leftLabel} ${rule.operator} ${rightLabel ?? 'N/A'} → ${result}`
    };
  }

  const operator = String(rule.operator).toUpperCase();
  const results = rule.rules.map(child => evaluateRule(child, row, history));
  const known = results.filter(item => item.result !== null);

  if (!known.length) return { result: null, reason: `N/A: ${operator} has no verified child result` };

  let result;
  if (operator === 'AND') {
    result = known.length === results.length && known.every(item => item.result === true);
  } else if (operator === 'OR') {
    result = known.some(item => item.result === true);
    if (!result && known.length < results.length) return { result: null, reason: `N/A: OR has unresolved child data; ${results.map(item => item.reason).join(' OR ')}` };
  } else {
    result = known.length === 1 ? !known[0].result : null;
  }

  return { result, reason: results.map(item => item.reason).join(` ${operator} `) };
}

module.exports = { evaluateRule, validateRule, compare, resolveValue };
