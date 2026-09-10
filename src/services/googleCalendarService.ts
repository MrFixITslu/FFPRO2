import { CalendarItem } from '../types';

const BASE = '/api/calendar';

export interface GoogleCalendarStatus {
  connected: boolean;
  hasCalendarScope?: boolean;
  userEmail?: string;
  authorized?: boolean;
  reason?: string;
}

export interface GoogleCalendarSyncResponse {
  ok: boolean;
  count: number;
  events: CalendarItem[];
  syncTime: string;
  account: string;
  error?: string;
}

export interface CreateCalendarEventPayload {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string;
  addMeet?: boolean;
}

type SyncListener = (data: { events: CalendarItem[]; syncTime: string; isAuto?: boolean }) => void;
const syncListeners = new Set<SyncListener>();

export const googleCalendarService = {
  /**
   * Subscribe to Google Calendar sync events across components
   */
  subscribe(listener: SyncListener): () => void {
    syncListeners.add(listener);
    return () => {
      syncListeners.delete(listener);
    };
  },

  notifyListeners(events: CalendarItem[], syncTime: string, isAuto = false) {
    syncListeners.forEach(fn => {
      try {
        fn({ events, syncTime, isAuto });
      } catch (e) {
        console.error('[googleCalendarService] listener error:', e);
      }
    });
  },

  /**
   * Check connection status and whether user has granted Google Calendar scope
   */
  async getStatus(): Promise<GoogleCalendarStatus> {
    try {
      const res = await fetch(`${BASE}/status`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return { connected: false, authorized: false };
      }
      return await res.json();
    } catch (err: any) {
      console.warn('[googleCalendarService] getStatus error:', err?.message);
      return { connected: false, authorized: false, reason: err?.message };
    }
  },

  /**
   * Fetches Google Calendar events.
   */
  async fetchEvents(timeMin?: string, timeMax?: string, updatedMin?: string): Promise<GoogleCalendarSyncResponse> {
    const params = new URLSearchParams();
    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);
    if (updatedMin) params.set('updatedMin', updatedMin);
    params.set('maxResults', '250');

    const url = `${BASE}/events${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: any = new Error(data.error || 'Failed to sync with Google Calendar.');
      error.code = data.code;
      error.authUrl = data.authUrl || '/api/auth/google';
      throw error;
    }

    if (data.events && Array.isArray(data.events)) {
      this.notifyListeners(data.events, data.syncTime || new Date().toISOString());
    }

    return data;
  },

  /**
   * Create a new event directly in Google Calendar (with optional Google Meet video link)
   */
  async createEvent(payload: CreateCalendarEventPayload): Promise<{ ok: boolean; event: CalendarItem }> {
    const res = await fetch(`${BASE}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: any = new Error(data.error || 'Failed to create Google Calendar event.');
      error.code = data.code;
      throw error;
    }

    return data;
  },

  /**
   * Delete an event from Google Calendar
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    const res = await fetch(`${BASE}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    return res.ok;
  },
};
