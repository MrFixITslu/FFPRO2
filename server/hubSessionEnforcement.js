import { hubManagedSessionExpired } from "./hubManagedSessionPolicy.js";

export function createHubSessionEnforcement({ checkHubSubscription = null }) {
  return async function enforceHubSession(req, res, next) {
    // Health, liveness and explicit logout must remain callable even when
    // a browser carries an expired Hub session cookie.
    if (["/api/health", "/api/live", "/api/auth/logout"].includes(req.path)) return next();
    const current = req.session;
    if (!current?.hubManaged) {
      // Once release enforcement is enabled, no already-issued local Passport
      // session may bypass Hub billing by avoiding the Hub-managed cookie.
      const securedApi = req.path.startsWith("/api/") &&
        !req.path.startsWith("/api/platform/") &&
        !["/api/auth/csrf"].includes(req.path);
      if (checkHubSubscription && securedApi && req.isAuthenticated?.()) {
        return res.status(403).json({
          error: "Sign in through V79 Hub to continue using FFPRO.",
          code: "HUB_IDENTITY_REQUIRED",
        });
      }
      return next();
    }
    if (hubManagedSessionExpired(current)) {
      // Deny protected API access in the same request; logging out alone is
      // insufficient because routing could continue with a stale req.user.
      try {
        if (typeof req.logout === "function") {
          req.logout(() => req.session?.destroy?.(() => {}));
        }
      } catch { /* Access remains denied regardless of logout errors. */ }
      if (req.path.startsWith("/api/")) return res.status(401).json({
        error: "Your V79 Hub session has expired.", code: "HUB_SESSION_EXPIRED"
      });
      return next();
    }
    const protectedPath = req.path.startsWith("/api/") &&
      !["/api/health","/api/live","/api/auth/logout"].includes(req.path) &&
      !req.path.startsWith("/api/platform/");
    if (checkHubSubscription && protectedPath) {
      let allowed = false;
      try {
        allowed = await checkHubSubscription({
          organizationId: String(current.hubOrganizationId || ""),
          scopedUserId: String(current.hubUserId || ""),
        });
      } catch { allowed = false; }
      if (!allowed) return res.status(403).json({
        error: "V79 Hub subscription is inactive or unavailable.",
        code: "HUB_ENTITLEMENT_REVOKED",
      });
    }
    return next();
  };
}
