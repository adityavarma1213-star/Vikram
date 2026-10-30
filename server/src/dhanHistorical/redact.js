'use strict';
// Secret redaction. Used for every log line and every error message that leaves this module.
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;

function redact(text, secrets = []) {
  let out = String(text == null ? '' : text);
  for (const s of secrets) {
    if (s && String(s).length >= 4) out = out.split(String(s)).join('[REDACTED]');
  }
  out = out.replace(JWT_LIKE, '[REDACTED_JWT]');
  out = out.replace(/(access-token|client-id|authorization|app_secret|app_id)\s*[:=]\s*[^\s,;"']+/gi, '$1=[REDACTED]');
  return out;
}

module.exports = { redact };
