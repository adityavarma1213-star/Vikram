'use strict';
// Admin authorization for privileged routes (currently: NSE ingestion trigger + history).
//
// This is deliberately separate from server/src/auth.js's requireAuth: requireAuth only proves
// WHO you are (a real, server-verified logged-in user); it says nothing about WHAT you're allowed
// to do. Before this module existed, POST /api/admin/ingest/run was reachable by ANY authenticated
// user — including someone who had just self-registered through the same auto-register flow used
// by Alerts. That is a real privilege-escalation gap, not a hypothetical one, and it is fixed here
// by requiring the caller's account email to appear in a server-side, environment-controlled
// allowlist (ADMIN_EMAILS) — never a frontend role, header, query parameter, or hidden UI element.
const ADMIN_EMAILS_ENV = process.env.ADMIN_EMAILS;

// Pure function, unit-testable without a DB or Express: given a raw ADMIN_EMAILS env value and an
// email, says whether that email is an admin. Comparison is case-insensitive and whitespace-
// tolerant since env vars are hand-edited by operators.
function isAdminEmail(email, adminEmailsEnv = ADMIN_EMAILS_ENV) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !adminEmailsEnv) return false;
  const allowlist = String(adminEmailsEnv)
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(normalizedEmail);
}

// Express middleware factory. Must run AFTER requireAuth (needs req.userId already set by it).
// Looks the user's email up in the database by the server-verified req.userId — never trusts an
// email the client might have sent in the request body/headers — then checks it against
// ADMIN_EMAILS. If ADMIN_EMAILS is unset entirely, this fails closed (nobody is an admin) rather
// than failing open, since an unset allowlist is far more likely to be a misconfiguration than an
// intentional "let everyone in".
function requireAdmin(pool) {
  return async (req, res, next) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required.' });
    if (!ADMIN_EMAILS_ENV) {
      return res.status(503).json({ error: 'Admin access is not configured on this deployment (ADMIN_EMAILS is not set).' });
    }
    try {
      const q = await pool.query('SELECT email FROM users WHERE id=$1', [req.userId]);
      const email = q.rows[0]?.email;
      if (!email || !isAdminEmail(email)) {
        return res.status(403).json({ error: 'This action requires VIKRAM admin authorization.' });
      }
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

module.exports = { isAdminEmail, requireAdmin };
