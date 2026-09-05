import express from 'express';
import { realtimeHub } from '../realtime.js';
import { pool } from '../db.js';

const router = express.Router();

/**
 * Middleware: Ensure authenticated
 */
function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * GET /api/notifications/unread-count
 * Returns current server-side count breakdown and pending notifications.
 */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check pending project invites for this user's email
    let pendingInvitesCount = 0;
    try {
      const email = req.user.email;
      if (email) {
        const inviteRes = await pool.query(
          'SELECT COUNT(*) as count FROM project_invites WHERE LOWER(email) = LOWER($1) AND status = $2',
          [email, 'pending']
        );
        pendingInvitesCount = parseInt(inviteRes.rows?.[0]?.count || 0, 10);
      }
    } catch (err) {
      // Non-fatal if table doesn't support query in fallback mode
    }

    return res.json({
      success: true,
      userId,
      pendingInvitesCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[notifications-api] unread-count error:', err);
    return res.status(500).json({ error: 'Failed to retrieve notification count' });
  }
});

/**
 * POST /api/notifications/sync-count
 * Broadcasts the updated count to other connected tabs/devices of the current user.
 */
router.post('/sync-count', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const { unreadCount, breakdown, action } = req.body || {};

    const safeCount = typeof unreadCount === 'number' && Number.isFinite(unreadCount) && unreadCount >= 0
      ? Math.floor(unreadCount)
      : 0;

    // Broadcast across all connected client tabs/devices via SSE Realtime Hub
    realtimeHub.broadcastNotificationUpdate(userId, {
      unreadCount: safeCount,
      breakdown: breakdown || {},
      action: action || 'sync'
    });

    return res.json({
      success: true,
      syncedCount: safeCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[notifications-api] sync-count error:', err);
    return res.status(500).json({ error: 'Failed to sync notification count' });
  }
});

export default router;
