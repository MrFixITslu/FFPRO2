import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { pool } from '../db.js';
import { projectsDb } from '../projectsDb.js';
import { decryptForUser } from '../crypto.js';
import { getValidGoogleAccessToken } from '../googleTokens.js';
import { getProcessedMessageIds, markMessageProcessed, getAllProcessedMessages } from '../gmailProcessedStore.js';

const router = Router();
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || 'vision79slu@gmail.com';

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
 * Verifies that the authenticated user strictly matches the authorized email (case-insensitive).
 * For any other user, returns 403 Forbidden with zero Gmail data/endpoints exposed.
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

    // 3. Check previously read/deleted messages so we NEVER pull them from Google again
    const processedSet = await getProcessedMessageIds(req.user.id);
    const unpulledStubs = messageStubs.filter(stub => !processedSet.has(stub.id));

    if (unpulledStubs.length === 0) {
      return res.json({
        notifications: [],
        totalUnread: 0,
        syncTime: new Date().toISOString(),
      });
    }

    // 4. Resolve existing tasks to link with emails
    const allTasks = await resolvePlanningTasks(req.user.id);

    // 5. Fetch metadata/headers ONLY for each unpulled message (format=metadata)
    const notifications = [];
    // Limit parallel fetches to max 10 to protect rate limits
    const topStubs = unpulledStubs.slice(0, 10);

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
        const headers = msgData.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('From');
        const to = getHeader('To');
        const subject = getHeader('Subject') || '(No Subject)';
        const dateHeader = getHeader('Date');
        const snippet = msgData.snippet || '';
        const isUnread = Array.isArray(msgData.labelIds) && msgData.labelIds.includes('UNREAD');

        // If email is no longer unread or was processed in the meantime, skip it
        if (!isUnread || processedSet.has(msgData.id)) continue;

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

    return res.json({
      notifications,
      totalUnread: notifications.length,
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
 * GET /api/gmail/processed
 * Retrieves all message IDs marked as read or deleted for the authenticated user.
 */
router.get('/processed', requireAuthorizedAccount, async (req, res) => {
  try {
    const list = await getAllProcessedMessages(req.user.id);
    const processedIds = list.map(item => item.messageId);
    res.json({ processed: list, processedIds, dismissedIds: processedIds });
  } catch (err) {
    console.error('[gmail-sync] Error fetching processed list:', err);
    res.status(500).json({ error: 'Failed to retrieve processed messages.' });
  }
});

/**
 * GET /api/gmail/dismissed
 * Backwards-compatible endpoint returning dismissed/processed message IDs.
 */
router.get('/dismissed', requireAuthorizedAccount, async (req, res) => {
  try {
    const list = await getAllProcessedMessages(req.user.id);
    const dismissedIds = list.map(item => item.messageId);
    res.json({ dismissedIds });
  } catch (err) {
    console.error('[gmail-sync] Error fetching dismissed list:', err);
    res.status(500).json({ error: 'Failed to retrieve dismissed messages.' });
  }
});

/**
 * POST /api/gmail/read
 * Marks a notification as read permanently so it is never pulled from Google again,
 * and removes UNREAD label in Gmail.
 */
router.post('/read', requireAuthorizedAccount, async (req, res) => {
  const { messageId } = req.body || {};
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required.' });
  }

  // Record read status in persistent store
  await markMessageProcessed(req.user.id, messageId, 'read');

  // Attempt removing UNREAD label on Gmail server
  const accessToken = await getValidGoogleAccessToken(req.user.id);
  if (accessToken) {
    try {
      const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
      await fetch(modifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    } catch (e) {
      console.warn('[gmail-sync] Could not mark read in Gmail:', e?.message);
    }
  }

  res.json({ ok: true, messageId, status: 'read' });
});

/**
 * POST /api/gmail/dismiss
 * Marks a notification as deleted/dismissed permanently so it is never pulled from Google again.
 */
router.post('/dismiss', requireAuthorizedAccount, async (req, res) => {
  const { messageId } = req.body || {};
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required.' });
  }

  // Record deleted status in persistent store
  await markMessageProcessed(req.user.id, messageId, 'deleted');

  // Also remove UNREAD label on Gmail server
  const accessToken = await getValidGoogleAccessToken(req.user.id);
  if (accessToken) {
    try {
      const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
      await fetch(modifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    } catch (e) {
      console.warn('[gmail-sync] Could not mark dismissed in Gmail:', e?.message);
    }
  }

  res.json({ ok: true, messageId, status: 'deleted' });
});

/**
 * POST /api/gmail/mark-read
 * Marks a Gmail message as read (removes UNREAD label) and records in persistent store.
 */
router.post('/mark-read', requireAuthorizedAccount, async (req, res) => {
  const { messageId } = req.body || {};
  const accessToken = await getValidGoogleAccessToken(req.user.id);

  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required.' });
  }

  // Record in persistent store
  await markMessageProcessed(req.user.id, messageId, 'read');

  if (accessToken) {
    try {
      const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
      await fetch(modifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD'],
        }),
      });
    } catch (err) {
      console.warn('[gmail-sync] Failed to mark message read in Gmail:', err?.message);
    }
  }

  res.json({ ok: true, messageId, status: 'read' });
});

export default router;
