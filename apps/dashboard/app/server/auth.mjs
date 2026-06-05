// HTTP Basic Auth middleware for the Copilot dashboard.
//
// Pure ESM, no deps. Used by both the production Node bridge
// (`apps/dashboard/server.mjs`) and the Vite dev server
// (`apps/dashboard/vite.config.ts`) so dev and prod share one code path.
//
// Compares username + password with `crypto.timingSafeEqual` on equal-length
// buffers. `timingSafeEqual` throws on length mismatch, so we compare lengths
// first, then pad both inputs to the same length before the constant-time
// compare. Padding lets us avoid early-return on length mismatch without
// crashing.
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  // Pad both to the same length so timingSafeEqual doesn't throw, then
  // require the original lengths to match too. The padded compare keeps
  // timing constant regardless of which input was shorter.
  const len = Math.max(ab.length, bb.length, 1);
  const ap = Buffer.alloc(len);
  const bp = Buffer.alloc(len);
  ab.copy(ap);
  bb.copy(bp);
  const eq = timingSafeEqual(ap, bp);
  return eq && ab.length === bb.length;
}

export function checkBasicAuth(headerValue, user, pass) {
  if (typeof headerValue !== 'string' || headerValue.length === 0) return false;
  if (!headerValue.startsWith('Basic ')) return false;
  const b64 = headerValue.slice('Basic '.length).trim();
  if (b64.length === 0) return false;
  let decoded;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  // Two independent constant-time compares; both must succeed.
  const userOk = safeEqual(u, user);
  const passOk = safeEqual(p, pass);
  return userOk && passOk;
}

export function basicAuthMiddleware({ user, pass, realm = 'Copilot Dashboard', skip = [] } = {}) {
  return function basicAuth(req, res, next) {
    const url = req.url ?? '';
    for (const prefix of skip) {
      if (url.startsWith(prefix)) {
        next();
        return;
      }
    }
    const header = req.headers && req.headers.authorization;
    if (checkBasicAuth(header, user, pass)) {
      next();
      return;
    }
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Authentication required\n');
  };
}
