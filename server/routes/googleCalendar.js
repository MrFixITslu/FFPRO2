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
    const formattedEvents = rawItems
      .filter(item => item.status !== 'cancelled' && (item.start?.dateTime || item.start?.date))
      .map(item => {
        const isAllDay = !!item.start.date && !item.start.dateTime;
        let dateStr = '';
        let startTimeStr = '';

        if (isAllDay) {
          dateStr = item.start.date; // Format: YYYY-MM-DD
        } else {
          const startDateObj = new Date(item.start.dateTime);
          dateStr = startDateObj.toISOString().split('T')[0];
          startTimeStr = startDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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

    return res.json({
      ok: true,
      count: formattedEvents.length,
      events: formattedEvents,
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

export default router;
