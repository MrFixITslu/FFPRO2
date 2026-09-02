import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { pool } from '../db.js';
import { projectsDb } from '../projectsDb.js';
import { decryptForUser } from '../crypto.js';
import { getValidGoogleAccessToken, revokeGoogleTokens } from '../googleTokens.js';
import { realtimeHub } from '../realtime.js';

const router = Router();
// Primary test/demo account; reviewers and any authenticated user who connects Gmail can test their own inbox
const PRIMARY_AUTHORIZED_EMAIL = 'vision79slu@gmail.com';

const gmailRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireAuth);
router.use(gmailRateLimiter);

/**
 * Server-Side Authorization Middleware
 * Verifies that the authenticated user has an active session and access to Gmail features.
 * Permits the designated account as well as any authenticated user who grants Google OAuth consent.
 */
function requireAuthorizedAccount(req, res, next) {
  if (req.user && req.user.id) {
    return next();
  }
  return res.status(403).json({
    error: 'Authentication required to access Gmail features.',
  });
}

/**
 * Helper to get all permanently dismissed email IDs for a user across database and encrypted state
 */
async function getDismissedEmailIds(userId) {
  const dismissedSet = new Set();
  try {
    const { rows } = await pool.query(
      'SELECT message_id FROM dismissed_emails WHERE user_id = $1',
      [userId]
    );
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (r.message_id) {
          dismissedSet.add(r.message_id);
          dismissedSet.add(`gmail-${r.message_id}`);
        }
      });
    }
  } catch (err) {
    console.warn('[gmail-sync] Could not query dismissed_emails:', err?.message);
  }

  try {
    const { rows: dataRows } = await pool.query(
      'SELECT ciphertext, iv, auth_tag FROM user_data WHERE user_id = $1',
      [userId]
    );
    if (dataRows && dataRows[0]) {
      const decrypted = decryptForUser(userId, {
        ciphertext: dataRows[0].ciphertext,
        iv: dataRows[0].iv,
        authTag: dataRows[0].auth_tag,
      });
      if (Array.isArray(decrypted?.dismissedEmailIds)) {
        decrypted.dismissedEmailIds.forEach(id => {
          if (id) {
            dismissedSet.add(id);
            dismissedSet.add(`gmail-${id}`);
          }
        });
      }
    }
  } catch (err) {
    // ignore
  }

  return dismissedSet;
}

/**
 * Helper to match task/planning references from subject, sender, and snippet
 */
async function resolvePlanningTasks(userId, querySnippets = []) {
  try {
    // 1. Fetch user's private encrypted events/tasks if available
    let personalTasks = [];
    const { rows: dataRows } = await pool.query(
      'SELECT ciphertext, iv, auth_tag FROM user_data WHERE user_id = $1',
      [userId]
    );
    if (dataRows[0]) {
      try {
        const decrypted = decryptForUser(userId, {
          ciphertext: dataRows[0].ciphertext,
          iv: dataRows[0].iv,
          authTag: dataRows[0].auth_tag,
        });
        if (Array.isArray(decrypted?.events)) {
          decrypted.events.forEach(ev => {
            if (ev?.id && ev?.title) {
              personalTasks.push({
                taskId: String(ev.id),
                taskTitle: ev.title,
                projectName: 'Personal Planner',
                source: 'event',
              });
            }
            if (Array.isArray(ev?.checklist)) {
              ev.checklist.forEach(item => {
                if (item?.id && item?.text) {
                  personalTasks.push({
                    taskId: String(item.id),
                    taskTitle: item.text,
                    projectName: ev.title || 'Personal Planner',
                    source: 'checklist',
                    parentId: String(ev.id),
                  });
                }
              });
            }
          });
        }
      } catch (err) {
        console.warn('[gmail-sync] Could not decrypt user events for task matching:', err?.message);
      }
    }

    // 2. Fetch shared projects and their tasks
    let sharedTasks = [];
    const projects = await projectsDb.listProjectsForUser(userId);
    for (const proj of projects) {
      const fullProj = await projectsDb.getProjectById(proj.id);
      const data = fullProj?.data || {};
      if (Array.isArray(data.tasks)) {
        data.tasks.forEach(t => {
          if (t?.id && t?.title) {
            sharedTasks.push({
              taskId: String(t.id),
              taskTitle: t.title,
              projectId: String(proj.id),
              projectName: proj.name,
              source: 'project_task',
            });
          }
        });
      }
      if (Array.isArray(data.events)) {
        data.events.forEach(ev => {
          if (ev?.id && ev?.title) {
            sharedTasks.push({
              taskId: String(ev.id),
              taskTitle: ev.title,
              projectId: String(proj.id),
              projectName: proj.name,
              source: 'project_event',
            });
          }
        });
      }
    }

    return [...personalTasks, ...sharedTasks];
  } catch (err) {
    console.error('[gmail-sync] Task resolution error:', err);
    return [];
  }
}

/**
 * Match an email header (subject/snippet) against existing task identifiers
 */
function findMatchingTask(subject = '', snippet = '', allTasks = []) {
  const combined = (subject + ' ' + snippet).toLowerCase();

  // 1. Direct explicit ID pattern: e.g. [TASK:xyz-123], #TASK-123, task/123, #123
  const idMatch = combined.match(/(?:task|plan|proj|event|item)[-:\s#]+([a-z0-9\-_]{3,})/i) ||
                  combined.match(/#([a-z0-9\-_]{4,})/i);
  if (idMatch && idMatch[1]) {
    const rawMatch = idMatch[1].toLowerCase();
    const exact = allTasks.find(t => t.taskId.toLowerCase() === rawMatch || t.taskId.toLowerCase().includes(rawMatch));
    if (exact) return exact;
  }

  // 2. Match based on task title words in subject/snippet
  for (const t of allTasks) {
    const title = (t.taskTitle || '').trim().toLowerCase();
    if (title.length >= 4 && (combined.includes(title) || (subject.toLowerCase().includes(title)))) {
      return t;
    }
  }

  // 3. If there is a project name match
  for (const t of allTasks) {
    const proj = (t.projectName || '').trim().toLowerCase();
    if (proj.length >= 4 && (combined.includes(proj) || subject.toLowerCase().includes(proj))) {
      return t;
    }
  }

  return null;
}

/**
 * GET /api/gmail/notifications
 * Retrieves unread planning email headers for VISION79SLU@GMAIL.COM using the client-side Google OAuth access token.
 * Validates the token with Google TokenInfo and queries the Gmail API for messages matching 'is:unread' and planning keywords.
 */
router.get('/notifications', requireAuthorizedAccount, async (req, res) => {
  // The access token comes from the server-held grant captured at Google
  // login (server/googleTokens.js), refreshed transparently as needed —
  // there's no client-side token supplied; all Gmail access goes through
  // the server's stored refresh token.
  const accessToken = await getValidGoogleAccessToken(req.user.id);

  if (!accessToken) {
    return res.status(401).json({
      error: 'Log in with Google to enable Gmail planning notifications.',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    // 1. Validate token with Google TokenInfo
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!tokenInfoRes.ok) {
      return res.status(401).json({
        error: 'Google access has expired or been revoked. Please log in with Google again.',
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

    // 2. List unread messages from Gmail API
    // Search for unread messages that contain planning, task, project, update, deadline, meeting, or schedule
    const searchQuery = 'is:unread (planning OR task OR project OR deadline OR schedule OR milestone OR review OR update OR reminder)';
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=15`;

    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.warn('[gmail-sync] Gmail API list error:', listRes.status, errText);
      if (listRes.status === 401 || listRes.status === 403) {
        return res.status(401).json({
          error: 'Gmail permissions required. Please log in with Google again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(502).json({
        error: 'Planning notifications are temporarily unavailable from Gmail.',
        code: 'GMAIL_UNAVAILABLE',
      });
    }

    const listData = await listRes.json();
    const messageStubs = listData.messages || [];

    if (messageStubs.length === 0) {
      return res.json({
        notifications: [],
        totalUnread: 0,
        syncTime: new Date().toISOString(),
      });
    }

    // 3. Resolve user's dismissed email headers to guarantee permanent deletion from dashboard across all devices
    const dismissedSet = await getDismissedEmailIds(req.user.id);

    // Filter out permanently dismissed messages before making metadata calls
    const activeStubs = messageStubs.filter(
      stub => !dismissedSet.has(stub.id) && !dismissedSet.has(`gmail-${stub.id}`)
    );

    if (activeStubs.length === 0) {
      return res.json({
        notifications: [],
        totalUnread: 0,
        syncTime: new Date().toISOString(),
      });
    }

    // 4. Resolve existing tasks to link with emails
    const allTasks = await resolvePlanningTasks(req.user.id);

    // 5. Fetch metadata/headers ONLY for each active message (format=metadata)
    const notifications = [];
    // Limit parallel fetches to max 10 to protect rate limits
    const topStubs = activeStubs.slice(0, 10);

    for (const stub of topStubs) {
      try {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
        const msgRes = await fetch(msgUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();

        // Double check against dismissed set
        if (dismissedSet.has(msgData.id) || dismissedSet.has(`gmail-${msgData.id}`)) {
          continue;
        }

        const headers = msgData.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('From');
        const to = getHeader('To');
        const subject = getHeader('Subject') || '(No Subject)';
        const dateHeader = getHeader('Date');
        const snippet = msgData.snippet || '';
        const isUnread = Array.isArray(msgData.labelIds) && msgData.labelIds.includes('UNREAD');

        // If email is no longer unread, skip it
        if (!isUnread) continue;

        // Clean sender display name
        let cleanFrom = from;
        const senderMatch = from.match(/^"?([^"<]+)"?\s*<.*>$/);
        if (senderMatch && senderMatch[1]) {
          cleanFrom = senderMatch[1].trim();
        }

        // Match with planning task
        const matchedTask = findMatchingTask(subject, snippet, allTasks);

        notifications.push({
          id: msgData.id,
          threadId: msgData.threadId,
          from: cleanFrom || 'Unknown Sender',
          fromRaw: from,
          to,
          subject,
          snippet,
          date: dateHeader ? new Date(dateHeader).toISOString() : new Date(parseInt(msgData.internalDate || Date.now(), 10)).toISOString(),
          isUnread: true,
          taskReference: matchedTask ? {
            taskId: matchedTask.taskId,
            taskTitle: matchedTask.taskTitle,
            projectName: matchedTask.projectName,
            projectId: matchedTask.projectId || null,
            source: matchedTask.source,
          } : null,
        });
      } catch (msgErr) {
        console.warn(`[gmail-sync] Failed to load metadata for message ${stub.id}:`, msgErr?.message);
      }
    }

    const filteredNotifications = notifications.filter(
      n => !dismissedSet.has(n.id) && !dismissedSet.has(`gmail-${n.id}`)
    );

    return res.json({
      notifications: filteredNotifications,
      totalUnread: filteredNotifications.length,
      syncTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[gmail-sync] Fatal error fetching notifications:', err);
    return res.status(500).json({
      error: 'Planning notifications are temporarily unavailable.',
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * POST /api/gmail/dismiss
 * Permanently deletes an email header from the dashboard across all user devices (phone, desktop, etc.).
 * Persists to server DB and broadcasts in real-time to all user's active sockets.
 */
router.post('/dismiss', requireAuthorizedAccount, async (req, res) => {
  const { messageId } = req.body || {};
  if (!messageId || typeof messageId !== 'string') {
    return res.status(400).json({ error: 'Valid messageId is required.' });
  }

  const cleanId = messageId.replace(/^gmail-/, '');

  try {
    // 1. Permanently record in PostgreSQL / persistent db
    await pool.query(
      `INSERT INTO dismissed_emails (user_id, message_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, message_id) DO NOTHING`,
      [req.user.id, cleanId]
    );

    // 2. Broadcast immediately to all connected devices/phones
    realtimeHub.broadcastEmailDismissed(req.user.id, {
      messageId: cleanId,
      dismissedAt: new Date().toISOString(),
    });

    // 3. Attempt in background to mark read in Gmail if token is available
    getValidGoogleAccessToken(req.user.id).then(accessToken => {
      if (accessToken) {
        const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(cleanId)}/modify`;
        fetch(modifyUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        }).catch(() => {});
      }
    }).catch(() => {});

    res.json({ ok: true, messageId: cleanId });
  } catch (err) {
    console.error('[gmail-sync] Error dismissing email:', err);
    res.status(500).json({ error: 'Failed to record email dismissal.' });
  }
});

/**
 * GET /api/gmail/dismissed
 * Returns all permanently dismissed email IDs for this user.
 */
router.get('/dismissed', requireAuthorizedAccount, async (req, res) => {
  try {
    const dismissedSet = await getDismissedEmailIds(req.user.id);
    res.json({ dismissedIds: Array.from(dismissedSet) });
  } catch (err) {
    console.error('[gmail-sync] Error fetching dismissed emails:', err);
    res.status(500).json({ error: 'Failed to fetch dismissed emails.' });
  }
});

/**
 * POST /api/gmail/mark-read
 * Marks a Gmail message as read (removes UNREAD label) when dismissed or viewed.
 */
router.post('/mark-read', requireAuthorizedAccount, async (req, res) => {
  const { messageId } = req.body || {};
  const accessToken = await getValidGoogleAccessToken(req.user.id);

  if (!accessToken || !messageId) {
    return res.status(400).json({ error: 'Message ID is required and you must be logged in with Google.' });
  }

  try {
    const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
    const modifyRes = await fetch(modifyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD'],
      }),
    });

    if (!modifyRes.ok) {
      const errText = await modifyRes.text();
      console.warn('[gmail-sync] Failed to mark message read in Gmail:', modifyRes.status, errText);
      return res.status(502).json({ error: 'Failed to update read status in Gmail.' });
    }

    res.json({ ok: true, messageId });
  } catch (err) {
    console.error('[gmail-sync] Error marking message read:', err);
    res.status(500).json({ error: 'Failed to update email status.' });
  }
});

/**
 * POST /api/gmail/disconnect
 * User-initiated Google account disconnection and token revocation.
 * Revokes OAuth grant against Google's revocation server and purges encrypted tokens.
 */
router.post('/disconnect', requireAuthorizedAccount, async (req, res) => {
  try {
    await revokeGoogleTokens(req.user.id);
    res.json({ ok: true, message: 'Gmail disconnected and stored tokens revoked.' });
  } catch (err) {
    console.error('[gmail-sync] Error disconnecting Gmail:', err);
    res.status(500).json({ error: 'Failed to disconnect Gmail.' });
  }
});

export default router;
