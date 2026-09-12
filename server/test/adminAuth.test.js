'use strict';
const assert = require('node:assert/strict');
const { isAdminEmail } = require('../src/adminAuth');

// Fails closed when ADMIN_EMAILS is unset — nobody is an admin by default.
assert.equal(isAdminEmail('anyone@example.com', undefined), false);
assert.equal(isAdminEmail('anyone@example.com', ''), false);

// Exact allowlist match.
assert.equal(isAdminEmail('admin@vikram.example', 'admin@vikram.example'), true);

// Case-insensitive and whitespace-tolerant (env vars are hand-edited).
assert.equal(isAdminEmail('Admin@Vikram.Example', 'admin@vikram.example'), true);
assert.equal(isAdminEmail('admin@vikram.example', ' admin@vikram.example , ops@vikram.example '), true);
assert.equal(isAdminEmail('ops@vikram.example', ' admin@vikram.example , ops@vikram.example '), true);

// A regular, non-listed authenticated user must NOT be treated as admin.
assert.equal(isAdminEmail('random-user@example.com', 'admin@vikram.example,ops@vikram.example'), false);

// Empty/garbage email never matches, even against a non-empty allowlist.
assert.equal(isAdminEmail('', 'admin@vikram.example'), false);
assert.equal(isAdminEmail(undefined, 'admin@vikram.example'), false);

console.log('adminAuth tests passed (allowlist logic, fail-closed by default)');
