import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { realtimeHub } from '../realtime.js';

const router = Router();

router.use(requireAuth);

/**
 * Server-Sent Events stream for real-time live synchronization.
 * Automatically broadcasts personal data changes and shared project edits to active clients.
 */
router.get('/stream', (req, res) => {
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
 */
router.post('/watch', (req, res) => {
  const { projectId } = req.body || {};
  if (projectId && typeof projectId === 'string') {
    realtimeHub.watchProject(req.user.id, projectId);
  }
  res.json({ ok: true });
});

router.post('/unwatch', (req, res) => {
  const { projectId } = req.body || {};
  if (projectId && typeof projectId === 'string') {
    realtimeHub.unwatchProject(req.user.id, projectId);
  }
  res.json({ ok: true });
});

export default router;
