import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { projectsDb } from '../projectsDb.js';
import { sendProjectInviteEmail } from '../mailer.js';
import { realtimeHub } from '../realtime.js';
import { getFrontendUrl } from '../utils/urlHelper.js';

const router = Router();
const MAX_BYTES = 5 * 1024 * 1024;
const VALID_ROLES = ['editor', 'viewer']; // 'owner' is assigned only at project creation
const VALID_PROJECT_TYPES = ['event', 'trip', 'startup'];

const inviteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.use(requireAuth);

function frontendBase(req) {
  return getFrontendUrl(req);
}

function displayNameOf(user) {
  return user.displayName || user.username || (user.email ? user.email.split('@')[0] : 'Someone');
}

async function loadMembership(req, res, next) {
  const { id } = req.params;
  try {
    const membership = await projectsDb.getMembership(id, req.user.id);
    if (!membership) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    req.projectRole = membership.role;
    next();
  } catch (err) {
    console.error('loadMembership error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.projectRole)) {
      return res.status(403).json({ error: 'You do not have permission to do that on this project.' });
    }
    next();
  };
}

// --- List / create ----------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const projects = await projectsDb.listProjectsForUser(req.user.id);
    res.json({ projects });
  } catch (err) {
    console.error('GET /api/projects error:', err);
    res.status(500).json({ error: 'Failed to load shared projects.' });
  }
});

router.post('/', async (req, res) => {
  const { name, projectType, data } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'A project name is required.' });
  }
  if (!VALID_PROJECT_TYPES.includes(projectType)) {
    return res.status(400).json({ error: 'Invalid project type.' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid project data.' });
  }
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'Project data is too large.' });
  }

  try {
    const project = await projectsDb.createProject({ ownerId: req.user.id, name: name.trim(), projectType, data });
    res.status(201).json({ project });
  } catch (err) {
    console.error('POST /api/projects error:', err);
    res.status(500).json({ error: 'Failed to create shared project.' });
  }
});

// --- Single project ----------------------------------------------------------

router.get('/:id', loadMembership, async (req, res) => {
  try {
    const project = await projectsDb.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({
      project: {
        id: project.id,
        ownerId: project.owner_id,
        name: project.name,
        projectType: project.project_type,
        data: project.data,
        version: project.version,
        role: req.projectRole,
        updatedAt: project.updated_at,
      },
    });
  } catch (err) {
    console.error('GET /api/projects/:id error:', err);
    res.status(500).json({ error: 'Failed to load project.' });
  }
});

router.put('/:id', loadMembership, requireRole('owner', 'editor'), async (req, res) => {
  const { data, expectedVersion } = req.body || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid project data.' });
  }
  if (typeof expectedVersion !== 'number') {
    return res.status(400).json({ error: 'expectedVersion is required.' });
  }
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'Project data is too large.' });
  }

  try {
    const result = await projectsDb.updateProjectData(req.params.id, data, expectedVersion);
    if (result.notFound) return res.status(404).json({ error: 'Project not found.' });
    if (result.conflict) {
      return res.status(409).json({ error: 'This project was updated elsewhere since you last loaded it.', version: result.version });
    }
    // Broadcast project update to all connected collaborators in real-time
    realtimeHub.broadcastProjectUpdate(req.params.id, {
      project: result.project,
      version: result.project.version,
      updatedAt: result.project.updated_at,
      updatedBy: req.user.id
    });
    res.json({ ok: true, version: result.project.version, updatedAt: result.project.updated_at });
  } catch (err) {
    console.error('PUT /api/projects/:id error:', err);
    res.status(500).json({ error: 'Failed to save project.' });
  }
});

router.delete('/:id', loadMembership, requireRole('owner'), async (req, res) => {
  try {
    await projectsDb.deleteProject(req.params.id);
    realtimeHub.broadcastProjectUpdate(req.params.id, {
      project: null,
      deleted: true,
      updatedBy: req.user.id
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/projects/:id error:', err);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// --- Members ------------------------------------------------------------------

router.get('/:id/members', loadMembership, async (req, res) => {
  try {
    const members = await projectsDb.listMembers(req.params.id);
    const invites = ['owner', 'editor'].includes(req.projectRole)
      ? await projectsDb.listPendingInvitesForProject(req.params.id)
      : [];
    res.json({ members, invites });
  } catch (err) {
    console.error('GET /api/projects/:id/members error:', err);
    res.status(500).json({ error: 'Failed to load members.' });
  }
});

router.delete('/:id/members/:userId', loadMembership, async (req, res) => {
  const { userId } = req.params;
  const isSelf = userId === req.user.id;

  if (isSelf) {
    if (req.projectRole === 'owner') {
      return res.status(400).json({ error: 'Project owners cannot leave — delete the project instead if you want to remove it.' });
    }
  } else if (req.projectRole !== 'owner') {
    return res.status(403).json({ error: 'Only the project owner can remove other members.' });
  }

  try {
    await projectsDb.removeMember(req.params.id, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/projects/:id/members/:userId error:', err);
    res.status(500).json({ error: 'Failed to remove member.' });
  }
});

router.patch('/:id/members/:userId', loadMembership, requireRole('owner'), async (req, res) => {
  const { role } = req.body || {};
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be "editor" or "viewer".' });
  }
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }
  try {
    await projectsDb.updateMemberRole(req.params.id, req.params.userId, role);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/projects/:id/members/:userId error:', err);
    res.status(500).json({ error: 'Failed to update role.' });
  }
});

// --- Invites --------------------------------------------------------------

router.post('/:id/invites', inviteLimiter, loadMembership, requireRole('owner', 'editor'), async (req, res) => {
  const { email, role } = req.body || {};
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be "editor" or "viewer".' });
  }

  try {
    const project = await projectsDb.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const existingUser = await projectsDb.findUserByEmail(email);
    if (existingUser) {
      const alreadyMember = await projectsDb.getMembership(req.params.id, existingUser.id);
      if (alreadyMember) {
        return res.status(409).json({ error: 'That person is already a member of this project.' });
      }
      // They already have an account — skip the pending-invite dance and add them directly.
      await projectsDb.addMember(req.params.id, existingUser.id, role);
      return res.status(201).json({ ok: true, addedDirectly: true });
    }

    const invite = await projectsDb.createInvite({
      projectId: req.params.id,
      email,
      role,
      invitedBy: req.user.id,
    });
    const inviteLink = `${frontendBase(req)}/invite/${invite.token}`;
    const { sent } = await sendProjectInviteEmail({
      toEmail: email,
      projectName: project.name,
      inviterName: displayNameOf(req.user),
      role,
      inviteLink,
    });

    res.status(201).json({ ok: true, invite, inviteLink, emailSent: sent });
  } catch (err) {
    console.error('POST /api/projects/:id/invites error:', err);
    res.status(500).json({ error: 'Failed to send invite.' });
  }
});

router.delete('/:id/invites/:inviteId', loadMembership, requireRole('owner', 'editor'), async (req, res) => {
  try {
    await projectsDb.revokeInvite(req.params.inviteId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/projects/:id/invites/:inviteId error:', err);
    res.status(500).json({ error: 'Failed to revoke invite.' });
  }
});

// --- Chat -------------------------------------------------------------------

router.get('/:id/messages', loadMembership, async (req, res) => {
  const after = typeof req.query.after === 'string' ? req.query.after : null;
  const limit = 200;
  try {
    const messages = await projectsDb.listMessages(req.params.id, after, limit);
    res.json({ messages });
  } catch (err) {
    console.error('GET /api/projects/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

router.post('/:id/messages', messageLimiter, loadMembership, async (req, res) => {
  const { body } = req.body || {};
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (body.length > 2000) {
    return res.status(400).json({ error: 'Message is too long (2000 character limit).' });
  }
  try {
    const message = await projectsDb.createMessage(req.params.id, req.user.id, body.trim());
    realtimeHub.broadcastProjectMessage(req.params.id, message);
    res.status(201).json({ message });
  } catch (err) {
    console.error('POST /api/projects/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

export default router;
