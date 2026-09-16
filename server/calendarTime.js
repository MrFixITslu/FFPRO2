import { DateTime, IANAZone } from 'luxon';
export function calendarTimes({ date, startTime = null, endTime = null, timeZone }) {
  const invalid = () => { throw Object.assign(new Error('Use a valid date, timezone and end time after the start time.'), { status: 400 }); };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !IANAZone.isValidZone(timeZone)) return invalid();
  const day = DateTime.fromISO(date, { zone: timeZone });
  if (!day.isValid) return invalid();
  if (!startTime) return { start: { date }, end: { date: day.plus({ days: 1 }).toISODate() } };
  if (!/^\d{2}:\d{2}$/.test(startTime) || (endTime && !/^\d{2}:\d{2}$/.test(endTime))) return invalid();
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone: timeZone });
  const end = endTime ? DateTime.fromISO(`${date}T${endTime}`, { zone: timeZone }) : start.plus({ hours: 1 });
  // Reject nonexistent spring-forward wall times instead of silently shifting appointments.
  if (!start.isValid || !end.isValid || start.toFormat('HH:mm') !== startTime || (endTime && end.toFormat('HH:mm') !== endTime) || end <= start) return invalid();
  return { start: { dateTime: start.toISO(), timeZone }, end: { dateTime: end.toISO(), timeZone } };
}
export async function calendarPages(url, accessToken) {
  const items = []; let pageToken;
  for (let page = 0; page < 20; page++) {
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(response.status===403 ? 'Reconnect Google and grant Calendar access.' : 'Google Calendar is unavailable. Please retry.'), { status: response.status, code: response.status===403 ? 'INSUFFICIENT_SCOPES' : 'GOOGLE_API_ERROR' });
    items.push(...(Array.isArray(data.items) ? data.items : []));
    pageToken=data.nextPageToken;
    if (!pageToken) return items;
  }
  throw Object.assign(new Error('Calendar range contains too many events. Select a shorter date range.'), { status: 422 });
}
