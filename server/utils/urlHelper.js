/**
 * Helper to safely determine the public frontend base URL, preventing
 * Open Redirect and Host/Origin Header poisoning attacks on password reset
 * links and OAuth callbacks.
 */
export function getFrontendUrl(req) {
  // 1. Explicitly configured production / frontend environment URLs take top precedence
  const explicitUrl = process.env.APP_URL || process.env.FRONTEND_URL;
  if (explicitUrl && explicitUrl.trim()) {
    return explicitUrl.trim().replace(/\/$/, '');
  }

  if (req) {
    // 2. Derive trusted host from Host or X-Forwarded-Host (when trust proxy is active)
    const rawHost = req.get('x-forwarded-host') || req.get('host');
    if (rawHost) {
      // Validate host to prevent header injection
      const sanitizedHost = rawHost.split(',')[0].trim();
      if (/^[a-zA-Z0-9.:\-_]+$/.test(sanitizedHost)) {
        const isCloudSandbox = !!(process.env.K_SERVICE || process.env.APP_URL);
        const xfp = req.get('x-forwarded-proto');
        const isHttps = req.secure ||
          isCloudSandbox ||
          (typeof xfp === 'string' && xfp.split(',').map(s => s.trim().toLowerCase()).includes('https'));
        const proto = isHttps ? 'https' : 'http';

        // If Origin or Referer is supplied, verify it matches the current host before using it
        const origin = req.headers.origin;
        if (origin && origin !== 'null' && /^https?:\/\//i.test(origin)) {
          try {
            const u = new URL(origin);
            if (u.host.toLowerCase() === sanitizedHost.toLowerCase()) {
              return origin.replace(/\/$/, '');
            }
          } catch (_) {}
        }

        const referer = req.headers.referer;
        if (referer) {
          try {
            const u = new URL(referer);
            if (u.host.toLowerCase() === sanitizedHost.toLowerCase() && u.origin && u.origin !== 'null') {
              return u.origin.replace(/\/$/, '');
            }
          } catch (_) {}
        }

        return `${proto}://${sanitizedHost}`.replace(/\/$/, '');
      }
    }
  }

  return 'http://localhost:3000';
}
