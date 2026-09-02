import { useState, useEffect, useMemo, useCallback } from 'react';
import { GmailPlanningNotification, BudgetEvent, ProjectTask } from '../types';
import {
  signInWithGooglePopup,
  getFirebaseAccessToken,
  setFirebaseAccessToken,
  fetchDirectGmailNotifications,
} from '../services/firebaseAuth';
import { authService } from '../services/authService';

const AUTHORIZED_GMAIL = 'vision79slu@gmail.com';

export function useGmailNotifications(userEmail?: string, events: BudgetEvent[] = []) {
  const [gmailNotifications, setGmailNotifications] = useState<GmailPlanningNotification[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean>(() => !!getFirebaseAccessToken());
  const [gmailError, setGmailError] = useState<string | null>(null);

  // Persistent local dismissed email IDs stored in localStorage
  const [dismissedEmailIds, setDismissedEmailIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dashboard_dismissed_email_ids');
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

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

  // Fetch Gmail notifications from backend API or direct Google REST API
  const fetchGmail = useCallback(async (isSilent = false, explicitToken?: string) => {
    if (!isSilent) setGmailLoading(true);
    setGmailError(null);

    const clientToken = explicitToken || getFirebaseAccessToken();

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (clientToken) {
        headers['Authorization'] = `Bearer ${clientToken}`;
      }

      const res = await fetch('/api/gmail/notifications', {
        credentials: 'include',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setGmailNotifications(data.notifications || []);
        setGmailConnected(true);
        return;
      }

      if (clientToken) {
        try {
          const directNotes = await fetchDirectGmailNotifications(clientToken, allUserTasks);
          setGmailNotifications(directNotes);
          setGmailConnected(true);
          return;
        } catch (directErr) {
          console.warn('Direct Gmail fetch error:', directErr);
        }
      }

      if (res.status === 401 || res.status === 403) {
        setGmailConnected(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setGmailError(errData.error || 'Gmail service temporarily unavailable');
      }
    } catch (err: any) {
      if (clientToken) {
        try {
          const directNotes = await fetchDirectGmailNotifications(clientToken, allUserTasks);
          setGmailNotifications(directNotes);
          setGmailConnected(true);
          return;
        } catch (e) {
          setGmailError('Unable to connect to Gmail service');
        }
      } else {
        setGmailConnected(false);
      }
    } finally {
      if (!isSilent) setGmailLoading(false);
    }
  }, [allUserTasks]);

  useEffect(() => {
    const token = getFirebaseAccessToken();
    if (token) {
      setGmailConnected(true);
      fetchGmail(true, token);
    } else {
      fetchGmail(true);
    }
  }, [fetchGmail]);

  // Connect via Google Auth Popup
  const handleConnectGmail = async () => {
    setGmailLoading(true);
    setGmailError(null);
    try {
      const res = await signInWithGooglePopup();
      if (res && res.accessToken) {
        setFirebaseAccessToken(res.accessToken);
        setGmailConnected(true);

        if (res.user) {
          authService.loginWithGoogleToken({
            email: res.user.email || AUTHORIZED_GMAIL,
            displayName: res.user.displayName,
            avatarUrl: res.user.photoURL,
            googleId: res.user.uid,
            accessToken: res.accessToken,
          }).catch(err => {
            console.warn('[Gmail Connect] Server token sync notice:', err?.message);
          });
        }

        await fetchGmail(false, res.accessToken);
      }
    } catch (err: any) {
      console.error('Google sign-in popup error:', err);
      setGmailError(err?.message || 'Google authentication was not completed.');
    } finally {
      setGmailLoading(false);
    }
  };

  // Remove email from dashboard locally & persist in localStorage without deleting from Gmail
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

    setGmailNotifications(prev => prev.filter(g => g.id !== emailId));
  }, []);

  // Filtered active unread emails (excluding those dismissed locally)
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
    fetchGmail,
    handleConnectGmail,
    handleDismissEmail,
    dismissedEmailIds,
  };
}
