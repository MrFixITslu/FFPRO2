// The Hub queries the signed summary over Docker's private network. Keep the
// public host check for every other request, including browser and login routes.
export function allowedHost(host, pathname, publicHost, internalHost = '') {
  if (host === publicHost) return true;
  return Boolean(internalHost && host === internalHost && /^\/api\/platform\/summary\/[^/]+$/.test(pathname));
}
