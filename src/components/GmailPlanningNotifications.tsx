import React, { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, ExternalLink, CheckCircle, AlertCircle, Sparkles, Inbox, ArrowRight, ShieldCheck, LogIn, Clock } from 'lucide-react';
import { GmailPlanningNotification } from '../types';

interface Props {
  userEmail?: string;
  onNavigateToTask?: (taskId: string, projectId?: string | null) => void;
  onNavigateToPlanner?: () => void;
}

const AUTHORIZED_EMAIL = 'vision79slu@gmail.com';
const GMAIL_CLIENT_ID = '608846965040-59ekik0g93j2j6l48a28723q9d1oal2l.apps.googleusercontent.com';

export const GmailPlanningNotifications: React.FC<Props> = ({
  userEmail,
  onNavigateToTask,
  onNavigateToPlanner,
}) => {
  // CRITICAL: Double check client-side (server also strictly checks)
  const isAuthorized = (userEmail || '').trim().toLowerCase() === AUTHORIZED_EMAIL.toLowerCase();

  const [notifications, setNotifications] = useState<GmailPlanningNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenRequired, setTokenRequired] = useState<boolean>(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<boolean>(false);

  // Retrieve existing stored token from session/memory
  const getStoredToken = useCallback(() => {
    return sessionStorage.getItem('gmail_access_token');
  }, []);

  const saveToken = (token: string) => {
    sessionStorage.setItem('gmail_access_token', token);
  };

  // Fetch unread planning notifications
  const fetchNotifications = useCallback(async (isBackground = false) => {
    if (!isAuthorized) return;

    const token = getStoredToken();
    if (!token) {
      setTokenRequired(true);
      setLoading(false);
      return;
    }

    if (!isBackground) setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/gmail/notifications', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'AUTH_REQUIRED' || data.code === 'ACCOUNT_MISMATCH') {
          sessionStorage.removeItem('gmail_access_token');
          setTokenRequired(true);
          setError(data.error || 'Gmail session expired. Please reconnect.');
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Planning notifications are temporarily unavailable.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setNotifications(data.notifications || []);
      setTokenRequired(false);
      setLastSynced(new Date());
    } catch (err: any) {
      console.warn('[Gmail Notifications] Fetch error:', err);
      setError('Planning notifications are temporarily unavailable.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [isAuthorized, getStoredToken]);

  // Request Google Identity Token for Gmail
  const handleConnectGmail = () => {
    setConnecting(true);
    setError(null);

    try {
      // Check if google GIS script is loaded
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: GMAIL_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
          callback: (response: any) => {
            setConnecting(false);
            if (response.error) {
              console.error('Google OAuth error:', response);
              setError('Failed to authorize Gmail access. Please try again.');
              return;
            }
            if (response.access_token) {
              saveToken(response.access_token);
              setTokenRequired(false);
              fetchNotifications();
            }
          },
        });
        client.requestAccessToken({ prompt: 'consent', hint: AUTHORIZED_EMAIL });
      } else {
        // Fallback: dynamically load GIS script
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
          setConnecting(false);
          handleConnectGmail();
        };
        script.onerror = () => {
          setConnecting(false);
          setError('Could not load Google authentication service.');
        };
        document.body.appendChild(script);
      }
    } catch (err) {
      console.error('Connect Gmail failed:', err);
      setConnecting(false);
      setError('Unable to initiate Gmail connection.');
    }
  };

  // Mark as read in Gmail and remove from dashboard
  const handleMarkAsRead = async (messageId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const token = getStoredToken();
    if (!token) return;

    setDismissingId(messageId);
    try {
      const res = await fetch('/api/gmail/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageId }),
      });

      if (res.ok) {
        // Optimistically remove from list
        setNotifications(prev => prev.filter(n => n.id !== messageId));
      }
    } catch (err) {
      console.warn('Failed to mark email read:', err);
    } finally {
      setDismissingId(null);
    }
  };

  // Click on "View Task"
  const handleViewTask = (notif: GmailPlanningNotification, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Mark as read so it clears upon navigation
    handleMarkAsRead(notif.id);

    if (notif.taskReference?.taskId && onNavigateToTask) {
      onNavigateToTask(notif.taskReference.taskId, notif.taskReference.projectId);
    } else if (onNavigateToPlanner) {
      onNavigateToPlanner();
    }
  };

  // Initial load and periodic synchronization (every 60 seconds)
  useEffect(() => {
    if (!isAuthorized) return;
    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [isAuthorized, fetchNotifications]);

  // CRITICAL: Do NOT render anything for any other account
  if (!isAuthorized) {
    return null;
  }

  return (
    <section className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl border border-indigo-500/30 text-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-500">
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-indigo-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0 shadow-inner">
            <Mail size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-base tracking-tight">Planning Notifications</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 flex items-center gap-1">
                <ShieldCheck size={11} className="text-emerald-400" />
                vision79slu@gmail.com
              </span>
              {notifications.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-xs">
                  {notifications.length} Unread
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-200/70 mt-0.5">
              Live unread email alerts and updates synchronized with your planning tasks
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {!tokenRequired && (
            <button
              onClick={() => fetchNotifications(false)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-800/60 hover:bg-indigo-700/80 text-indigo-100 rounded-lg text-xs font-semibold border border-indigo-500/30 transition shadow-sm disabled:opacity-50"
              title="Synchronize unread emails"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Sync</span>
            </button>
          )}

          {lastSynced && (
            <span className="text-[10px] text-indigo-300/60 font-mono hidden lg:inline">
              Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div className="p-5 sm:p-6">
        {/* Token Required / Connect State */}
        {tokenRequired && (
          <div className="p-6 bg-indigo-900/40 rounded-xl border border-indigo-400/20 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center mb-3">
              <Mail size={24} />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">Connect Gmail Planning Notifications</h4>
            <p className="text-xs text-indigo-200/70 mb-4 max-w-sm">
              Authorize read access for <strong>{AUTHORIZED_EMAIL}</strong> to surface planning emails and task updates on your dashboard.
            </p>
            <button
              onClick={handleConnectGmail}
              disabled={connecting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50"
            >
              {connecting ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
              <span>{connecting ? 'Connecting Google...' : 'Connect Gmail Account'}</span>
            </button>
          </div>
        )}

        {/* Loading State */}
        {!tokenRequired && loading && notifications.length === 0 && (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <RefreshCw size={24} className="animate-spin text-indigo-400 mb-2" />
            <p className="text-xs text-indigo-200 font-medium">Loading planning notifications...</p>
          </div>
        )}

        {/* Error State */}
        {!tokenRequired && error && (
          <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-200 text-xs flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => handleConnectGmail()}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 rounded-md font-bold text-[10px] uppercase tracking-wider border border-rose-400/30"
            >
              Reconnect
            </button>
          </div>
        )}

        {/* Empty Notifications State */}
        {!tokenRequired && !loading && notifications.length === 0 && !error && (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-800/30 text-indigo-300 flex items-center justify-center mb-2">
              <Inbox size={20} />
            </div>
            <p className="text-xs font-bold text-indigo-100">No new planning notifications</p>
            <p className="text-[11px] text-indigo-300/60 mt-0.5">
              All planning-related emails for {AUTHORIZED_EMAIL} have been reviewed.
            </p>
          </div>
        )}

        {/* Notifications List */}
        {!tokenRequired && notifications.length > 0 && (
          <div className="space-y-3">
            {notifications.map((notif) => {
              const dateStr = new Date(notif.date).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });
              const timeStr = new Date(notif.date).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              const isDismissing = dismissingId === notif.id;

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-indigo-500/20 hover:border-indigo-400/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm group ${
                    isDismissing ? 'opacity-40 pointer-events-none' : ''
                  }`}
                >
                  {/* Left: Email Details & Task Reference */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 ring-4 ring-indigo-400/20 shrink-0 mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-white tracking-tight break-words">
                          {notif.subject}
                        </h4>
                        {notif.taskReference && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1">
                            <Sparkles size={10} className="text-indigo-300" />
                            {notif.taskReference.projectName || 'Task'}: {notif.taskReference.taskTitle}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-indigo-200/70 mt-1 flex-wrap">
                        <span>
                          From: <strong className="text-indigo-100">{notif.from}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <Clock size={11} className="text-indigo-300/60" />
                          {dateStr} — {timeStr}
                        </span>
                      </div>

                      {notif.snippet && (
                        <p className="text-[11px] text-indigo-200/60 mt-1.5 line-clamp-1">
                          {notif.snippet}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={(e) => handleMarkAsRead(notif.id, e)}
                      disabled={isDismissing}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-200 hover:text-white rounded-lg text-xs font-semibold border border-indigo-500/20 transition"
                      title="Mark as read in Gmail (removes notification)"
                    >
                      <CheckCircle size={13} className="inline mr-1 text-emerald-400" />
                      Dismiss
                    </button>

                    <button
                      onClick={(e) => handleViewTask(notif, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                    >
                      <span>View Task</span>
                      <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
