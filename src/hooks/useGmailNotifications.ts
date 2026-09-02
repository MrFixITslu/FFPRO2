import { useState, useEffect, useMemo, useCallback } from 'react';
import { GmailPlanningNotification, BudgetEvent, ProjectTask } from '../types';

const AUTHORIZED_GMAIL = 'vision79slu@gmail.com';

export function useGmailNotifications(
  userEmail?: string,
  events: BudgetEvent[] = [],
  externalDismissedIds?: string[],
  onDismissEmailProp?: (emailId: string) => void
) {
  const [gmailNotifications, setGmailNotifications] = useState<GmailPlanningNotification[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean>(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Persistent local dismissed email IDs stored in localStorage
  const [dismissedEmailIds, setDismissedEmailIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dashboard_dismissed_email_ids');
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

  // Sync external dismissed IDs from parent state (cloud sync)
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

  // Compile tasks for email matching
  const allUserTasks = useMemo(() => {
    const list: { taskId: string; taskTitle: string; projectName: string; projectId: string | null; task: ProjectTask }[] = [];
    events.forEach(ev => {
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

  // Fetch Gmail notifications from backend API (server-stored Google OAuth token)
  const fetchGmail = useCallback(async (isSilent = false) => {
    if (!isSilent) setGmailLoading(true);
    setGmailError(null);

    try {
      const res = await fetch('/api/gmail/notifications', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        setGmailNotifications(data.notifications || []);
        setGmailConnected(true);
        setLastSyncTime(new Date());
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setGmailConnected(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setGmailError(errData.error || 'Gmail service temporarily unavailable');
      }
    } catch (err: any) {
      console.warn('Gmail fetch error:', err);
      setGmailConnected(false);
    } finally {
      if (!isSilent) setGmailLoading(false);
    }
  }, []);

  // Initial fetch and 15-minute interval timer to sync emails with Google automatically
  useEffect(() => {
    fetchGmail(true);

    // Auto-sync with Google every 15 minutes (900,000 ms)
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const intervalId = setInterval(() => {
      fetchGmail(true);
    }, FIFTEEN_MINUTES_MS);

    return () => clearInterval(intervalId);
  }, [fetchGmail]);

  // Connect via Google Auth - redirect to server OAuth endpoint
  const handleConnectGmail = () => {
    window.location.href = '/api/auth/google';
  };

  // Remove email from dashboard locally & persist across devices
  const handleDismissEmail = useCallback((emailId: string) => {
    setDismissedEmailIds(prev => {
      const next = new Set(prev);
      next.add(emailId);
      next.add(`gmail-${emailId}`);
      try {
        localStorage.setItem('dashboard_dismissed_email_ids', JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });

    if (onDismissEmailProp) {
      onDismissEmailProp(emailId);
    }

    // Attempt marking read on Gmail server in background
    fetch('/api/gmail/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ messageId: emailId }),
    }).catch(e => console.warn('Server mark-read notice:', e));

    setGmailNotifications(prev => prev.filter(g => g.id !== emailId));
  }, [onDismissEmailProp]);

  // Filtered active unread emails (excluding those dismissed locally/synced)
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
    handleDismissEmail,
    dismissedEmailIds,
  };
}
