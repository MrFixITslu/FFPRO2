export function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (!req.user?.email_verified_at) {
      return res.status(403).json({
        error: 'Email verification required. Please verify your email address to access the site.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }
    return next();
  }
  res.status(401).json({ error: 'Not authenticated.' });
}
