import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { getValidGoogleAccessToken } from '../googleTokens.js';

const router = Router();
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || 'vision79slu@gmail.com';

const calendarRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireAuth);
router.use(calendarRateLimiter);

/**
 * Server-Side Authorization Middleware
 * Verifies that the authenticated user strictly matches the authorized email (case-insensitive).
 */
function requireAuthorizedAccount(req, res, next) {
  const userEmail = (req.user?.email || '').trim().toLowerCase();
  if (userEmail && userEmail === AUTHORIZED_EMAIL.toLowerCase()) {
    return next();
  }
  return res.status(403).json({
    error: 'Access restricted to authorized account.',
  });
}

/**
 * GET /api/calendar/status
 * Returns connectivity status for Google Calendar integration
 */
router.get('/status', requireAuthorizedAccount, async (req, res) => {
  const accessToken = await getValidGoogleAccessToken(req.user.id);
  if (!accessToken) {
    return res.json({
      connected: false,
      userEmail: req.user?.email,
      authorized: true,
    });
  }

  try {
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!tokenInfoRes.ok) {
      return res.json({
        connected: false,
        userEmail: req.user?.email,
        authorized: true,
        reason: 'token_expired',
      });
    }

    const tokenInfo = await tokenInfoRes.json();
    const tokenScope = tokenInfo.scope || '';
    const hasCalendarScope = tokenScope.includes('calendar.events.readonly') || tokenScope.includes('calendar.readonly') || tokenScope.includes('calendar');

    return res.json({
      connected: true,
      hasCalendarScope,
      userEmail: req.user?.email,
      authorized: true,
    });
  } catch (err) {
    console.warn('[google-calendar] Status check error:', err?.message);
    return res.json({
      connected: false,
      userEmail: req.user?.email,
      authorized: true,
      reason: err?.message,
    });
  }
});

/**
 * GET /api/calendar/events
 * Read-only fetch of user's Google Calendar events.
 * Strictly adds Google data to the app — NO write operations to Google Calendar.
 */
router.get('/events', requireAuthorizedAccount, async (req, res) => {
  const accessToken = await getValidGoogleAccessToken(req.user.id);

  if (!accessToken) {
    return res.status(401).json({
      error: 'Log in with Google to enable Google Calendar synchronization.',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    // 1. Verify token with Google TokenInfo
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!tokenInfoRes.ok) {
      return res.status(401).json({
        error: 'Google access token expired or revoked. Please log in with Google again.',
        code: 'TOKEN_EXPIRED',
      });
    }

    const tokenInfo = await tokenInfoRes.json();
    const tokenEmail = (tokenInfo.email || '').toLowerCase();

    // Verify token identity strictly belongs to vision79slu@gmail.com
    if (tokenEmail !== AUTHORIZED_EMAIL.toLowerCase()) {
      return res.status(403).json({
        error: `Google token must belong to ${AUTHORIZED_EMAIL}.`,
        code: 'ACCOUNT_MISMATCH',
      });
    }

    const tokenScope = tokenInfo.scope || '';
    const hasCalendarScope = tokenScope.includes('calendar.events.readonly') || tokenScope.includes('calendar.readonly') || tokenScope.includes('calendar');

    if (!hasCalendarScope) {
      return res.status(403).json({
        error: 'Google Calendar permissions required. Please re-authenticate with Google to grant Calendar access.',
        code: 'INSUFFICIENT_SCOPES',
        authUrl: '/api/auth/google',
      });
    }

    // 2. Fetch primary calendar events from Google Calendar API
    // Default time range: 30 days in the past to 180 days in the future
    const timeMin = req.query.timeMin 
      ? new Date(String(req.query.timeMin)).toISOString() 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = req.query.timeMax 
      ? new Date(String(req.query.timeMax)).toISOString() 
      : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults = Math.min(parseInt(String(req.query.maxResults || '250'), 10), 250);

    const calUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    calUrl.searchParams.set('timeMin', timeMin);
    calUrl.searchParams.set('timeMax', timeMax);
    calUrl.searchParams.set('singleEvents', 'true');
    calUrl.searchParams.set('orderBy', 'startTime');
    calUrl.searchParams.set('maxResults', String(maxResults));
    if (req.query.updatedMin) {
      calUrl.searchParams.set('updatedMin', new Date(String(req.query.updatedMin)).toISOString());
    }

    const googleRes = await fetch(calUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!googleRes.ok) {
      const errBody = await googleRes.json().catch(() => ({}));
      console.warn('[google-calendar] API error:', googleRes.status, errBody);
      const isInsufficientScope = googleRes.status === 403 || 
        (errBody.error?.message && /insufficient.*scope|permission/i.test(errBody.error.message));
      return res.status(googleRes.status).json({
        error: isInsufficientScope
          ? 'Google Calendar permissions required. Please re-authenticate with Google to grant Calendar read access.'
          : (errBody.error?.message || 'Failed to fetch events from Google Calendar.'),
        code: isInsufficientScope ? 'INSUFFICIENT_SCOPES' : 'GOOGLE_API_ERROR',
        authUrl: isInsufficientScope ? '/api/auth/google' : undefined,
      });
    }

    const data = await googleRes.json();
    const rawItems = Array.isArray(data.items) ? data.items : [];

    // 3. Transform Google Calendar items into app-compatible CalendarItem schema
    const now = Date.now();
    const todayYMD = new Date().toISOString().split('T')[0];

    const formattedEvents = rawItems
      .filter(item => item.status !== 'cancelled' && (item.start?.dateTime || item.start?.date))
      .map(item => {
        const isAllDay = !!item.start.date && !item.start.dateTime;
        let dateStr = '';
        let startTimeStr = '';
        let isPassed = false;
        let startIso = item.start.dateTime || (item.start.date ? `${item.start.date}T00:00:00` : '');
        let endIso = item.end?.dateTime || (item.end?.date ? `${item.end.date}T23:59:59` : '');

        if (isAllDay) {
          dateStr = item.start.date; // Format: YYYY-MM-DD
          // For all-day events, Google API sets end.date to the day after (exclusive).
          // An all-day event on dateStr has passed only once dateStr is strictly before today.
          isPassed = dateStr < todayYMD;
        } else {
          // Timed event: parse ISO with timezone offset
          const startDateObj = new Date(item.start.dateTime);
          // Extract the local date component from the ISO string directly to avoid UTC shift
          dateStr = item.start.dateTime.slice(0, 10);
          const timePart = item.start.dateTime.slice(11, 16);
          startTimeStr = timePart || startDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

          // An event has passed if its end time (or start time) is in the past
          const eventEndMs = item.end?.dateTime ? new Date(item.end.dateTime).getTime() : startDateObj.getTime();
          isPassed = eventEndMs < now;
        }

        // Determine item category/type from summary or attendees
        const titleLower = (item.summary || '').toLowerCase();
        let itemType = 'event';
        if (titleLower.includes('meeting') || titleLower.includes('call') || titleLower.includes('sync') || (item.attendees && item.attendees.length > 1) || item.hangoutLink || item.conferenceData) {
          itemType = 'meeting';
        } else if (titleLower.includes('reminder') || titleLower.includes('due') || titleLower.includes('follow-up') || titleLower.includes('pay')) {
          itemType = 'reminder';
        }

        return {
          id: `gcal-${item.id}`,
          googleEventId: item.id,
          title: item.summary || '(No Title)',
          date: dateStr,
          startTime: startTimeStr || undefined,
          startDateTime: startIso,
          endDateTime: endIso,
          isAllDay,
          isPassed,
          description: item.description || (item.location ? `Location: ${item.location}` : undefined),
          type: itemType,
          recurring: 'none', // Single instances resolved by singleEvents=true
          completed: false,
          isGoogleCalendar: true,
          htmlLink: item.htmlLink,
          location: item.location,
          hangoutLink: item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri,
          attendeesCount: item.attendees?.length || 0,
        };
      });

    // If futureOnly or upcomingOnly query param is provided, filter out passed events
    const futureOnly = req.query.futureOnly === 'true' || req.query.upcomingOnly === 'true';
    const finalEvents = futureOnly ? formattedEvents.filter(ev => !ev.isPassed) : formattedEvents;

    return res.json({
      ok: true,
      count: finalEvents.length,
      events: finalEvents,
      syncTime: new Date().toISOString(),
      account: AUTHORIZED_EMAIL,
    });
  } catch (err) {
    console.error('[google-calendar] Sync handler error:', err);
    return res.status(500).json({
      error: 'Internal server error while syncing Google Calendar events.',
      details: err?.message,
    });
  }
});

/**
 * GET /api/calendar/notifications
 * Dedicated API endpoint for active calendar notifications.
 * Strictly returns only future/upcoming relevant calendar events.
 * Filters out all past events at the API level.
 */
router.get('/notifications', requireAuthorizedAccount, async (req, res) => {
  try {
    const accessToken = await getValidGoogleAccessToken(req.user.id);
    if (!accessToken) {
      return res.json({ ok: true, events: [], totalUpcoming: 0 });
    }

    const nowIso = new Date().toISOString();
    const maxFutureIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const calUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    calUrl.searchParams.set('timeMin', nowIso);
    calUrl.searchParams.set('timeMax', maxFutureIso);
    calUrl.searchParams.set('singleEvents', 'true');
    calUrl.searchParams.set('orderBy', 'startTime');
    calUrl.searchParams.set('maxResults', '50');

    const googleRes = await fetch(calUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!googleRes.ok) {
      return res.json({ ok: true, events: [], totalUpcoming: 0 });
    }

    const data = await googleRes.json();
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const now = Date.now();
    const todayYMD = new Date().toISOString().split('T')[0];

    const upcomingEvents = rawItems
      .filter(item => item.status !== 'cancelled' && (item.start?.dateTime || item.start?.date))
      .map(item => {
        const isAllDay = !!item.start.date && !item.start.dateTime;
        let dateStr = '';
        let startTimeStr = '';
        let isPassed = false;

        if (isAllDay) {
          dateStr = item.start.date;
          isPassed = dateStr < todayYMD;
        } else {
          const startDateObj = new Date(item.start.dateTime);
          dateStr = item.start.dateTime.slice(0, 10);
          startTimeStr = item.start.dateTime.slice(11, 16);
          const endMs = item.end?.dateTime ? new Date(item.end.dateTime).getTime() : startDateObj.getTime();
          isPassed = endMs < now;
        }

        return {
          id: `gcal-${item.id}`,
          googleEventId: item.id,
          title: item.summary || '(No Title)',
          date: dateStr,
          startTime: startTimeStr || undefined,
          isAllDay,
          isPassed,
          isGoogleCalendar: true,
          location: item.location,
          hangoutLink: item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri,
        };
      })
      .filter(item => !item.isPassed); // Strictly future/relevant events only

    return res.json({
      ok: true,
      events: upcomingEvents,
      totalUpcoming: upcomingEvents.length,
      syncTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[google-calendar] Notifications handler error:', err);
    return res.json({ ok: true, events: [], totalUpcoming: 0 });
  }
});

/**
 * POST /api/calendar/events
 * Create a new event in user's primary Google Calendar (optionally with Google Meet conference)
 */
router.post('/events', requireAuthorizedAccount, async (req, res) => {
  try {
    const accessToken = await getValidGoogleAccessToken(req.user.id);
    if (!accessToken) {
      return res.status(401).json({
        error: 'Log in with Google to enable Google Calendar synchronization.',
        code: 'AUTH_REQUIRED',
      });
    }

    const { title, date, startTime, endTime, description, location, addMeet } = req.body || {};
    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required.' });
    }

    const isAllDay = !startTime;
    let startObj = {};
    let endObj = {};

    if (isAllDay) {
      startObj = { date };
      // Google expects exclusive end date for all-day events
      const nextDay = new Date(date + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      endObj = { date: nextDay.toISOString().split('T')[0] };
    } else {
      const startDateTimeStr = `${date}T${startTime}:00`;
      const startDate = new Date(startDateTimeStr);
      let endDate;
      if (endTime) {
        endDate = new Date(`${date}T${endTime}:00`);
      } else {
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour
      }
      startObj = { dateTime: startDate.toISOString() };
      endObj = { dateTime: endDate.toISOString() };
    }

    const eventPayload = {
      summary: title,
      description: description || undefined,
      location: location || undefined,
      start: startObj,
      end: endObj,
    };

    if (addMeet) {
      eventPayload.conferenceData = {
        createRequest: {
          requestId: `ffpro-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const calUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    if (addMeet) {
      calUrl.searchParams.set('conferenceDataVersion', '1');
    }

    const googleRes = await fetch(calUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    if (!googleRes.ok) {
      const errBody = await googleRes.json().catch(() => ({}));
      return res.status(googleRes.status).json({
        error: errBody.error?.message || 'Failed to create event in Google Calendar.',
        code: 'GOOGLE_API_ERROR',
      });
    }

    const createdItem = await googleRes.json();
    const formattedItem = {
      id: `gcal-${createdItem.id}`,
      googleEventId: createdItem.id,
      title: createdItem.summary || title,
      date,
      startTime: startTime || undefined,
      isAllDay,
      isPassed: false,
      description: createdItem.description || (createdItem.location ? `Location: ${createdItem.location}` : undefined),
      type: addMeet ? 'meeting' : 'event',
      recurring: 'none',
      completed: false,
      isGoogleCalendar: true,
      htmlLink: createdItem.htmlLink,
      location: createdItem.location,
      hangoutLink: createdItem.hangoutLink || createdItem.conferenceData?.entryPoints?.[0]?.uri,
      attendeesCount: createdItem.attendees?.length || 0,
    };

    return res.status(201).json({
      ok: true,
      event: formattedItem,
    });
  } catch (err) {
    console.error('[google-calendar] Create event error:', err);
    return res.status(500).json({ error: 'Failed to create calendar event.', details: err?.message });
  }
});

/**
 * DELETE /api/calendar/events/:id
 * Delete an event from user's primary Google Calendar
 */
router.delete('/events/:id', requireAuthorizedAccount, async (req, res) => {
  try {
    const accessToken = await getValidGoogleAccessToken(req.user.id);
    if (!accessToken) {
      return res.status(401).json({ error: 'Auth required.', code: 'AUTH_REQUIRED' });
    }

    const eventId = req.params.id.replace(/^gcal-/, '');
    const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;

    const googleRes = await fetch(calUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!googleRes.ok && googleRes.status !== 404 && googleRes.status !== 410) {
      const errBody = await googleRes.json().catch(() => ({}));
      return res.status(googleRes.status).json({
        error: errBody.error?.message || 'Failed to delete event from Google Calendar.',
      });
    }

    return res.json({ ok: true, deletedId: req.params.id });
  } catch (err) {
    console.error('[google-calendar] Delete event error:', err);
    return res.status(500).json({ error: 'Failed to delete calendar event.' });
  }
});

export default router;
