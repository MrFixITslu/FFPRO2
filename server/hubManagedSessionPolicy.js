export function hubManagedSessionExpired(session, now = Date.now()) {
  if (!session?.hubManaged) return false;
  const deadline = Number(session.hubAccessExpiresAt);
  return !session.hubAccessExpiresAt || !Number.isFinite(deadline) || deadline <= now;
}
