import { CalendarItem } from '../types';

/**
 * Parses a date string and optional time string into a local Date object.
 * Correctly accounts for user's local timezone.
 */
export function parseEventDateTime(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;

  try {
    // Clean date string (YYYY-MM-DD)
    const cleanDate = dateStr.trim().slice(0, 10);
    const [year, month, day] = cleanDate.split('-').map(Number);
    if (!year || !month || !day) return null;

    if (!timeStr || !timeStr.trim()) {
      // All-day event: local midnight start
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    // Parse time component (handles "HH:mm", "HH:mm:ss", "h:mm AM/PM")
    const cleanTime = timeStr.trim();
    let hours = 0;
    let minutes = 0;

    const ampmMatch = cleanTime.match(/(am|pm)/i);
    const isPM = ampmMatch && ampmMatch[1].toLowerCase() === 'pm';
    const isAM = ampmMatch && ampmMatch[1].toLowerCase() === 'am';

    const numbers = cleanTime.replace(/[^\d:]/g, '').split(':').map(Number);
    if (numbers.length >= 2) {
      hours = numbers[0];
      minutes = numbers[1];
    } else if (numbers.length === 1) {
      hours = numbers[0];
    }

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  } catch {
    return null;
  }
}

/**
 * Checks whether a calendar item has already passed.
 * Respects user's local timezone, distinguishing all-day events from timed events.
 *
 * Rules:
 * 1. Completed events have passed / are not active.
 * 2. If item.isPassed is true from the API, it has passed.
 * 3. All-day events:
 *    - An all-day event on a date before today (YYYY-MM-DD < todayStr) has passed.
 *    - An all-day event today remains active until the end of today (23:59:59).
 * 4. Timed events:
 *    - If event date < today: has passed.
 *    - If event date > today: has not passed (is future).
 *    - If event date === today: if event's local start time has passed (<= now), it has passed.
 */
export function hasCalendarEventPassed(item: CalendarItem, now: Date = new Date()): boolean {
  if (!item) return true;
  if (item.completed) return true;
  if ((item as any).isPassed === true) return true;

  if (!item.date) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const eventDateStr = item.date.slice(0, 10);

  // If date is before today, it has definitely passed
  if (eventDateStr < todayStr) {
    return true;
  }

  // If date is strictly in the future, it has NOT passed
  if (eventDateStr > todayStr) {
    return false;
  }

  // If date is today:
  const isAllDay = !item.startTime || !item.startTime.trim();
  if (isAllDay) {
    // All-day event today is active throughout today
    return false;
  }

  // Timed event today: check if time has already passed
  const eventDateTime = parseEventDateTime(item.date, item.startTime);
  if (!eventDateTime) {
    return false;
  }

  // Passed if event start time is less than or equal to current time
  return eventDateTime.getTime() <= now.getTime();
}

/**
 * Returns whether a calendar event is an active, upcoming notification.
 * Filters out all passed events.
 */
export function isCalendarNotificationActive(item: CalendarItem, now: Date = new Date()): boolean {
  return !hasCalendarEventPassed(item, now);
}

/**
 * Filters a list of calendar items to return only future/relevant active items.
 */
export function filterActiveCalendarNotifications(items: CalendarItem[], now: Date = new Date()): CalendarItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(item => isCalendarNotificationActive(item, now));
}
