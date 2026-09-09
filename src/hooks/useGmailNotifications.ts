import { useState, useEffect, useMemo, useCallback } from 'react';
import { GmailPlanningNotification, BudgetEvent, ProjectTask } from '../types';

// Global shared state & request deduplicator to prevent duplicate API calls
interface SharedGmailState {
  notifications: GmailPlanningNotification[];
  connected: boolean;
  error: string | null;
  lastSyncTime: Date | null;
  inFlight: Promise<any> | null;
  lastFetchMs: number;
}

const sharedGmail: SharedGmailState = {
  notifications: [],
  connected: false,
  error: null,
  lastSyncTime: null,
  inFlight: null,
  lastFetchMs: 0,
};

const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function useGmailNotifications(
  userEmail?: string,
  events: BudgetEvent[] = [],
  externalDismissedIds?: string[],
  onDismissEmailProp?: (emailId: string) => void
) {
  const [gmailNotifications, setGmailNotifications] = useState<GmailPlanningNotification[]>(sharedGmail.notifications);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean>(sharedGmail.connected);
  const [gmailError, setGmailError] = useState<string | null>(sharedGmail.error);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(sharedGmail.lastSyncTime);

  // Subscribe to shared state updates across all hook instances
  useEffect(() => {
    const handleUpdate = () => {
      setGmailNotifications(sharedGmail.notifications);
      setGmailConnected(sharedGmail.connected);
      setGmailError(sharedGmail.error);
      setLastSyncTime(sharedGmail.lastSyncTime);
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // Persistent local dismissed email IDs stored in localStorage, scoped per logged-in user
  const dismissedStorageKey = userEmail ? `dashboard_dismissed_email_ids_${userEmail}` : 'dashboard_dismissed_email_ids';
  const [dismissedEmailIds, setDismissedEmailIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(dismissedStorageKey);
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

  // Reset in-memory + swap localStorage bucket if the logged-in user changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(dismissedStorageKey);
      setDismissedEmailIds(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch (e) {
      setDismissedEmailIds(new Set());
    }
  }, [dismissedStorageKey]);

  // Pull server-persisted dismissed email IDs on mount so fresh devices immediately reflect deletions
  useEffect(() => {
    let isMounted = true;
    fetch('/api/gmail/dismissed', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (isMounted && data && Array.isArray(data.dismissedIds) && data.dismissedIds.length > 0) {
          setDismissedEmailIds(prev => {
            const next = new Set(prev);
            data.dismissedIds.forEach((id: string) => {
              next.add(id);
              next.add(`gmail-${id}`);
            });
            try {
              localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(next)));
            } catch (e) {}
            return next;
          });
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [dismissedStorageKey]);

  // Sync external dismissed IDs from parent state
  useEffect(() => {
    if (Array.isArray(externalDismissedIds) && externalDismissedIds.length > 0) {
      setDismissedEmailIds(prev => {
        const next = new Set(prev);
        let changed = false;
        externalDismissedIds.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [externalDismissedIds]);

  // Compile tasks for email matching (active projects only)
  const allUserTasks = useMemo(() => {
    const list: { taskId: string; taskTitle: string; projectName: string; projectId: string | null; task: ProjectTask }[] = [];
    events.forEach(ev => {
      if (ev.status === 'closed') return;
      if (Array.isArray(ev.tasks)) {
        ev.tasks.forEach(t => {
          if (t && t.id && t.text) {
            list.push({
              taskId: String(t.id),
              taskTitle: t.text,
              projectName: ev.name || 'Planner Project',
              projectId: String(ev.id),
              task: t,
            });
            if (Array.isArray(t.subTasks)) {
              t.subTasks.forEach(st => {
                if (st && st.id && st.text) {
                  list.push({
                    taskId: String(st.id),
                    taskTitle: `${st.text} (${t.text})`,
                    projectName: ev.name || 'Planner Project',
                    projectId: String(ev.id),
                    task: st,
                  });
                }
              });
            }
          }
        });
      }
    });
    return list;
  }, [events]);

  // Fetch Gmail notifications from backend API with automatic request deduplication
  const fetchGmail = useCallback(async (isSilent = false) => {
    // If request already in flight, reuse the exact same promise (zero duplicate calls)
    if (sharedGmail.inFlight) {
      return sharedGmail.inFlight;
    }

    // Cache guard: if fetched less than 10 seconds ago and silent, return cached data
    const now = Date.now();
    if (isSilent && sharedGmail.lastFetchMs > 0 && now - sharedGmail.lastFetchMs < 10000) {
      return;
    }

    if (!isSilent) setGmailLoading(true);

    const executeFetch = async () => {
      try {
        const res = await fetch('/api/gmail/notifications', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          const notifs = data.notifications || [];
          sharedGmail.notifications = notifs;
          sharedGmail.connected = true;
          sharedGmail.error = null;
          sharedGmail.lastSyncTime = new Date();
          sharedGmail.lastFetchMs = Date.now();
          notifyListeners();
          return notifs;
        }

        if (res.status === 401 || res.status === 403) {
          sharedGmail.connected = false;
          sharedGmail.notifications = [];
          sharedGmail.lastFetchMs = Date.now();
          notifyListeners();
        } else {
          const errData = await res.json().catch(() => ({}));
          sharedGmail.error = errData.error || 'Gmail service temporarily unavailable';
          notifyListeners();
        }
      } catch (err: any) {
        console.warn('[gmail] Fetch error:', err);
        sharedGmail.connected = false;
        notifyListeners();
      } finally {
        sharedGmail.inFlight = null;
        if (!isSilent) setGmailLoading(false);
      }
    };

    sharedGmail.inFlight = executeFetch();
    return sharedGmail.inFlight;
  }, []);

  // Initial fetch on mount and 15-minute sync interval
  useEffect(() => {
    fetchGmail(true);

    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const intervalId = setInterval(() => {
      fetchGmail(true);
    }, FIFTEEN_MINUTES_MS);

    return () => clearInterval(intervalId);
  }, [fetchGmail]);

  // Connect via Google Auth - redirect to server OAuth endpoint (reusing Executive Inbox Briefing flow)
  const handleConnectGmail = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  // Disconnect Gmail and revoke tokens
  const handleDisconnectGmail = useCallback(async () => {
    try {
      setGmailLoading(true);
      await fetch('/api/gmail/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      sharedGmail.connected = false;
      sharedGmail.notifications = [];
      sharedGmail.error = null;
      sharedGmail.lastFetchMs = 0;
      notifyListeners();
    } catch (err) {
      console.warn('Error disconnecting Gmail:', err);
    } finally {
      setGmailLoading(false);
    }
  }, []);

  // Remove email from dashboard locally & persist across devices permanently
  const handleDismissEmail = useCallback(
    (emailId: string) => {
      const cleanId = emailId.replace(/^gmail-/, '');
      // 1. Instantly update local state and localStorage
      setDismissedEmailIds(prev => {
        const next = new Set(prev);
        next.add(emailId);
        next.add(cleanId);
        next.add(`gmail-${cleanId}`);
        try {
          localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(next)));
        } catch (e) {}
        return next;
      });

      // 2. Instantly remove from shared notification list
      sharedGmail.notifications = sharedGmail.notifications.filter(
        g => g.id !== cleanId && g.id !== emailId && `gmail-${g.id}` !== emailId
      );
      notifyListeners();

      // 3. Notify parent callback
      if (onDismissEmailProp) {
        onDismissEmailProp(cleanId);
      }

      // 4. Send permanent dismiss to server database
      fetch('/api/gmail/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageId: cleanId }),
      }).catch(e => console.warn('Server permanent dismiss notice:', e));

      // 5. Attempt marking read on Gmail server in background
      fetch('/api/gmail/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageId: cleanId }),
      }).catch(e => console.warn('Server mark-read notice:', e));
    },
    [dismissedStorageKey, onDismissEmailProp]
  );

  // Filtered active unread emails (excluding those dismissed)
  const activeUnreadEmails = useMemo(() => {
    return gmailNotifications.filter(
      g => !dismissedEmailIds.has(g.id) && !dismissedEmailIds.has(`gmail-${g.id}`)
    );
  }, [gmailNotifications, dismissedEmailIds]);

  return {
    activeUnreadEmails,
    unreadCount: activeUnreadEmails.length,
    gmailLoading,
    gmailConnected,
    gmailError,
    lastSyncTime,
    fetchGmail,
    handleConnectGmail,
    handleDisconnectGmail,
    handleDismissEmail,
    dismissedEmailIds,
  };
}
