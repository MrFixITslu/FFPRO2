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

export const googleCalendarService = {
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
   * Fetches Google Calendar events in read-only mode.
   * Strictly reads Google Calendar data to integrate into the app schedule.
   * Never mutates or sends app-only items to Google Calendar.
   */
  async fetchEvents(timeMin?: string, timeMax?: string): Promise<GoogleCalendarSyncResponse> {
    const params = new URLSearchParams();
    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);
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

    return data;
  },
};
