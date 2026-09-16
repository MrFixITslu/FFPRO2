import { Router } from '../http.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { realtimeHub } from '../realtime.js';
import { projectsDb } from '../projectsDb.js';

const router = Router();

router.use(requireAuth);

/**
 * Server-Sent Events stream for real-time live synchronization.
 * Automatically broadcasts personal data changes and shared project edits to active clients.
 */
router.get('/stream', (req, res) => {
  if((realtimeHub.clients.get(req.user.id)?.size || 0)>=6 || realtimeHub.clients.size>=500) return res.status(429).json({error:'Too many live connections. Close unused tabs and retry.'});
  // Set headers required for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Credentials': 'true'
  });
  res.flushHeaders?.();

  // Register client connection in the real-time event hub
  realtimeHub.addClient(req.user.id, req, res);
});

/**
 * Endpoint for a client to watch/focus on a specific project for priority real-time updates.
 * Strictly verifies project membership to prevent Broken Object Level Authorization (BOLA).
 */
router.post('/watch', async (req, res) => {
  const { projectId } = req.body || {};
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Valid projectId required.' });
  }

  try {
    const membership = await projectsDb.getMembership(projectId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this project.' });
    }
    realtimeHub.watchProject(req.user.id, projectId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error validating project watch authorization:', err);
    res.status(500).json({ error: 'Failed to watch project.' });
  }
});

router.post('/unwatch', (req, res) => {
  const { projectId } = req.body || {};
  if (projectId && typeof projectId === 'string') {
    realtimeHub.unwatchProject(req.user.id, projectId);
  }
  res.json({ ok: true });
});

export default router;
