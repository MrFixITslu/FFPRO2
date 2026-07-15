import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { projectsDb } from '../projectsDb.js';

const router = Router();
const previewLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Public preview — no auth required, so a not-yet-registered invitee can see
// what they're being invited to before signing up.
router.get('/:token', previewLimiter, async (req, res) => {
  try {
    const invite = await projectsDb.getInviteByToken(req.params.token);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ error: 'This invite is invalid or has already been used.' });
    }
    const project = await projectsDb.getProjectById(invite.projectId);
    if (!project) {
      return res.status(404).json({ error: 'The project this invite was for no longer exists.' });
    }
    res.json({
      projectName: project.name,
      projectType: project.project_type,
      email: invite.email,
      role: invite.role,
    });
  } catch (err) {
    console.error('GET /api/invites/:token error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/:token/accept', requireAuth, async (req, res) => {
  try {
    const invite = await projectsDb.getInviteByToken(req.params.token);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ error: 'This invite is invalid or has already been used.' });
    }
    if (invite.email.toLowerCase() !== String(req.user.email).toLowerCase()) {
      return res.status(403).json({ error: `This invite was sent to ${invite.email}. Log in with that email address to accept it.` });
    }
    const existingMembership = await projectsDb.getMembership(invite.projectId, req.user.id);
    if (!existingMembership) {
      await projectsDb.addMember(invite.projectId, req.user.id, invite.role);
    }
    await projectsDb.markInviteAccepted(invite.id);
    const project = await projectsDb.getProjectById(invite.projectId);
    res.json({ ok: true, projectId: invite.projectId, projectName: project?.name });
  } catch (err) {
    console.error('POST /api/invites/:token/accept error:', err);
    res.status(500).json({ error: 'Failed to accept invite.' });
  }
});

export default router;
