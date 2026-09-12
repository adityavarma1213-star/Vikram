'use strict';
// Server-side authentication.
//
// #10 remediation: private user data was previously scoped by an `x-vikram-user` request
// header (`owner(req)=String(req.headers['x-vikram-user']||'anonymous')`). Any client could set
// that header to any value and read or write another user's saved scans, alert preferences,
// alert history or push subscriptions. There is no impersonation-proof way to fix that other
// than server-issued, server-verified identity, so this module adds real accounts:
//   - passwords are hashed with scrypt (Node's built-in crypto, no extra dependency to add to a
//     lockfile we cannot resolve in this environment)
//   - session identity is an HMAC-SHA256 signed, expiring token minted only by the server on
//     successful login/registration
//   - req.userId is only ever set by verifying that signature server-side; nothing from the
//     request itself is trusted as identity.
const crypto = require('node:crypto');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SECRET = process.env.AUTH_SECRET;

function requireSecretConfigured() {
  if (!SECRET || SECRET.length < 16) {
    throw new Error('AUTH_SECRET is required (>=16 chars) to run the server securely. Set it in the environment.');
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(userId, tokenVersion = 0, { ttlMs = TOKEN_TTL_MS } = {}) {
  requireSecretConfigured();
  const payload = { uid: Number(userId), tv: Number(tokenVersion) || 0, exp: Date.now() + ttlMs };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const mac = base64url(crypto.createHmac('sha256', SECRET).update(payloadB64).digest());
  return `${payloadB64}.${mac}`;
}

// Returns {uid, tv} on a structurally/cryptographically valid, unexpired token, or null.
// This only proves the token was issued by this server and hasn't expired — it does NOT by
// itself prove the session hasn't been logged out; callers must additionally compare `tv`
// against the user's current token_version in the database (see requireAuth in index.js).
function verify(token) {
  requireSecretConfigured();
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, mac] = token.split('.');
  if (!payloadB64 || !mac) return null;
  const expectedMac = base64url(crypto.createHmac('sha256', SECRET).update(payloadB64).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.uid !== 'number' || !Number.isFinite(payload.uid)) return null;
  if (!payload.exp || Date.now() > payload.exp) return null;
  return { uid: payload.uid, tv: Number(payload.tv) || 0 };
}

function tokenFromRequest(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

// Sets req.userId from a server-verified session token, AND checks the token's embedded
// token_version against the user's current token_version in the database, so that
// POST /api/auth/logout (which bumps token_version) immediately invalidates every previously
// issued token for that user, not just on the client that logged out. Rejects (401) if the
// token is missing, malformed, expired, has an invalid signature, or has been logged out.
// Never trusts any client-supplied identity header.
function requireAuth(pool) {
  return async (req, res, next) => {
    let claims;
    try {
      claims = verify(tokenFromRequest(req));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    if (!claims) return res.status(401).json({ error: 'Authentication required.' });
    try {
      const q = await pool.query('SELECT token_version FROM users WHERE id=$1', [claims.uid]);
      if (!q.rowCount || Number(q.rows[0].token_version) !== claims.tv) {
        return res.status(401).json({ error: 'Session has been logged out or is no longer valid.' });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    req.userId = claims.uid;
    next();
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, 254);
}

function validCredentials(email, password) {
  return EMAIL_RE.test(normalizeEmail(email)) && typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

module.exports = {
  hashPassword,
  verifyPassword,
  sign,
  verify,
  requireAuth,
  normalizeEmail,
  validCredentials,
  TOKEN_TTL_MS
};
