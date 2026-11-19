// The Hub queries the signed summary over Docker's private network. Keep the
// public host check for every other request, including browser and login routes.
export function allowedHost(host, pathname, publicHost, internalHost = '') {
  if (host === publicHost) return true;
  return Boolean(
    internalHost &&
    host === internalHost &&
    (
      /^\/api\/platform\/summary\/[^/]+$/.test(pathname) ||
      pathname === "/api/platform/provision" ||
      pathname === "/api/platform/admin/stats" ||
      pathname === "/api/platform/admin/accounts" ||
      // Private signed Tiquet planning endpoints only; these routes enforce
      // X-Tiquet-Planning-Secret and tenant/job/project scope individually.
      pathname === "/api/gateway/webhooks/tiquet/planning/approved" ||
      pathname === "/api/gateway/webhooks/tiquet/planning/closed" ||
      /^\/api\/gateway\/webhooks\/tiquet\/planning\/[^/]+\/files(?:\/[^/]+)?$/.test(pathname)
    )
  );
}
