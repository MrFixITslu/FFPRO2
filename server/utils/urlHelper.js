/**
 * Helper to dynamically determine the public frontend base URL from the incoming request,
 * falling back to process.env.FRONTEND_URL if available.
 */
export function getFrontendUrl(req) {
  if (req) {
    // 1. Try req.headers.origin first (sent by modern browsers on fetch/POST)
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && /^https?:\/\//i.test(origin)) {
      return origin.replace(/\/$/, '');
    }

    // 2. Try req.headers.referer
    const referer = req.headers.referer;
    if (referer) {
      try {
        const u = new URL(referer);
        if (u.origin && u.origin !== 'null') {
          return u.origin.replace(/\/$/, '');
        }
      } catch (e) {
        // ignore invalid referer
      }
    }

    // 3. Try X-Forwarded-Host or Host header + protocol
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) {
      const xfp = req.get('x-forwarded-proto');
      const proto = (xfp ? xfp.split(',')[0].trim() : null) || req.protocol || 'http';
      return `${proto}://${host}`.replace(/\/$/, '');
    }
  }

  // 4. Fallback to process.env.FRONTEND_URL
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) {
    return process.env.FRONTEND_URL.trim().replace(/\/$/, '');
  }

  return '';
}
