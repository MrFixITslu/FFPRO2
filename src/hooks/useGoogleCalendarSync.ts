import { useEffect, useRef, useState, useCallback } from 'react';
import { googleCalendarService } from '../services/googleCalendarService';
import { CalendarItem } from '../types';

const LAST_SYNC_KEY = 'last_gcal_sync_timestamp';
const LAST_6AM_SYNC_DATE_KEY = 'last_gcal_6am_sync_date';
const POLL_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes background poll

export function useGoogleCalendarSync(
  calendarItems: CalendarItem[],
  onUpdateCalendarItems: (items: CalendarItem[]) => void,
  userEmail?: string | null
) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => localStorage.getItem(LAST_SYNC_KEY));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const isSyncingRef = useRef(false);
  const calendarItemsRef = useRef(calendarItems);
  calendarItemsRef.current = calendarItems;

  // Helper to merge fetched Google Calendar events with local non-Google directives
  const mergeGoogleEvents = useCallback((gcalEvents: CalendarItem[]) => {
    const current = calendarItemsRef.current || [];
    // Keep local custom directives (isGoogleCalendar !== true)
    const localItems = current.filter(item => !item.isGoogleCalendar);
    // Combine local items with fresh Google items
    const merged = [...localItems, ...gcalEvents];
    onUpdateCalendarItems(merged);
  }, [onUpdateCalendarItems]);

  const performSync = useCallback(async (isScheduled6am = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      // First check connection status
      const status = await googleCalendarService.getStatus();
      setIsConnected(!!status.connected && !!status.hasCalendarScope);

      if (!status.connected || !status.hasCalendarScope) {
        setIsSyncing(false);
        isSyncingRef.current = false;
        return;
      }

      const res = await googleCalendarService.fetchEvents();
      if (res.ok && Array.isArray(res.events)) {
        mergeGoogleEvents(res.events);
        const nowIso = new Date().toISOString();
        setLastSyncedAt(nowIso);
        localStorage.setItem(LAST_SYNC_KEY, nowIso);

        if (isScheduled6am) {
          const todayDateStr = new Date().toISOString().split('T')[0];
          localStorage.setItem(LAST_6AM_SYNC_DATE_KEY, todayDateStr);
          console.log('[useGoogleCalendarSync] Completed 6:00 AM daily Google Calendar sync');
        }
      }
    } catch (err: any) {
      console.warn('[useGoogleCalendarSync] Sync failed:', err?.message);
      setSyncError(err?.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [mergeGoogleEvents]);

  // Initial sync & status check
  useEffect(() => {
    performSync(false);
  }, [performSync, userEmail]);

  // Check if 6:00 AM sync is due today, and setup 6:00 AM daily scheduler
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const checkAndSchedule6am = () => {
      const now = new Date();
      const todayDateStr = now.toISOString().split('T')[0];
      const last6amDate = localStorage.getItem(LAST_6AM_SYNC_DATE_KEY);

      // Check if current time is past 6:00 AM today and we haven't synced today's 6 AM yet
      const today6am = new Date();
      today6am.setHours(6, 0, 0, 0);

      if (now.getTime() >= today6am.getTime() && last6amDate !== todayDateStr) {
        // Due for 6:00 AM sync
        performSync(true);
      }

      // Calculate time to NEXT 6:00 AM
      const next6am = new Date();
      next6am.setHours(6, 0, 0, 0);
      if (now.getTime() >= next6am.getTime()) {
        next6am.setDate(next6am.getDate() + 1);
      }
      const msUntilNext6am = next6am.getTime() - now.getTime();

      timerId = setTimeout(() => {
        performSync(true);
        // Recursively schedule next day's 6 AM
        checkAndSchedule6am();
      }, msUntilNext6am);
    };

    checkAndSchedule6am();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [performSync]);

  // Auto-sync when a new event is saved in Google (detected on tab visibility / focus change)
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const lastSync = localStorage.getItem(LAST_SYNC_KEY);
        const elapsed = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
        // If more than 30 seconds since last sync, re-sync immediately on return
        if (elapsed > 30000) {
          performSync(false);
        }
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [performSync]);

  // Periodic background polling (every 4 minutes) to pick up new events added in Google Calendar
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        performSync(false);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [performSync]);

  return {
    isSyncing,
    lastSyncedAt,
    syncError,
    isConnected,
    syncNow: () => performSync(false),
  };
}
