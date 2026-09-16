import { canonicalOrigin, production } from '../config.js';
import crypto from 'node:crypto';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
export function sameOriginOnly(req, res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  let supplied;
  try { supplied = origin || (referer ? new URL(referer).origin : null); } catch { supplied = null; }
  let expected = canonicalOrigin();
  // Development preview stays same-origin without opening production to Host poisoning.
  if (!production) expected = `${req.protocol}://${req.get('host')}`;
  if (!supplied || supplied !== expected || req.get('sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  next();
}
export function csrfProtection(req, res, next) {
  if (safeMethods.has(req.method)) return next();
  const supplied = req.get('x-csrf-token');
  const expected = req.session?.csrfToken;
  if (typeof supplied !== 'string' || !expected || !/^[a-f0-9]{64}$/.test(supplied) || supplied.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Your session changed. Please retry.', code: 'CSRF_INVALID' });
  }
  next();
}
