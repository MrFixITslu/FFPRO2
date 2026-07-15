import crypto from 'crypto';
import { hasPostgres, realPool, readDB, writeDB } from './db.js';

const nowISO = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function sanitizeMemberRow(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username || null,
    displayName: row.display_name || null,
    role: row.role,
    addedAt: row.added_at,
  };
}

function sanitizeInviteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at || null,
  };
}

function sanitizeMessageRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    senderId: row.sender_id,
    senderName: row.sender_name || row.display_name || row.username || 'Unknown',
    body: row.body,
    createdAt: row.created_at,
  };
}

function sanitizeProjectRow(row, role) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    projectType: row.project_type,
    data: row.data,
    version: row.version,
    role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Postgres-backed implementation
// ---------------------------------------------------------------------------
const pg = {
  async findUserByEmail(email) {
    const { rows } = await realPool.query(
      'SELECT id, email, username, display_name FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return rows[0] || null;
  },

  async listProjectsForUser(userId) {
    const { rows } = await realPool.query(
      `SELECT p.*, pm.role AS member_role
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.updated_at DESC`,
      [userId]
    );
    return rows.map(r => sanitizeProjectRow(r, r.member_role));
  },

  async getMembership(projectId, userId) {
    const { rows } = await realPool.query(
      'SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    return rows[0] ? { role: rows[0].role } : null;
  },

  async getProjectById(projectId) {
    const { rows } = await realPool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    return rows[0] || null;
  },

  async createProject({ ownerId, name, projectType, data }) {
    const { rows } = await realPool.query(
      `INSERT INTO projects (owner_id, name, project_type, data) VALUES ($1, $2, $3, $4) RETURNING *`,
      [ownerId, name, projectType, JSON.stringify(data)]
    );
    const project = rows[0];
    await realPool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [project.id, ownerId]
    );
    return sanitizeProjectRow(project, 'owner');
  },

  async updateProjectData(projectId, data, expectedVersion) {
    const client = await realPool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT version FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return { conflict: false, notFound: true };
      }
      const currentVersion = rows[0].version;
      if (currentVersion !== expectedVersion) {
        await client.query('ROLLBACK');
        return { conflict: true, version: currentVersion };
      }
      const newVersion = currentVersion + 1;
      const { rows: updated } = await client.query(
        `UPDATE projects SET data = $1, name = COALESCE($2, name), version = $3, updated_at = now() WHERE id = $4 RETURNING *`,
        [JSON.stringify(data), data?.name || null, newVersion, projectId]
      );
      await client.query('COMMIT');
      return { conflict: false, project: updated[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async deleteProject(projectId) {
    await realPool.query('DELETE FROM projects WHERE id = $1', [projectId]);
  },

  async listMembers(projectId) {
    const { rows } = await realPool.query(
      `SELECT pm.user_id, pm.role, pm.added_at, u.email, u.username, u.display_name
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 ORDER BY pm.added_at ASC`,
      [projectId]
    );
    return rows.map(sanitizeMemberRow);
  },

  async addMember(projectId, userId, role) {
    await realPool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [projectId, userId, role]
    );
  },

  async removeMember(projectId, userId) {
    await realPool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
  },

  async updateMemberRole(projectId, userId, role) {
    await realPool.query('UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3', [role, projectId, userId]);
  },

  async createInvite({ projectId, email, role, invitedBy }) {
    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await realPool.query(
      `INSERT INTO project_invites (project_id, email, role, invited_by, token) VALUES ($1, LOWER($2), $3, $4, $5) RETURNING *`,
      [projectId, email, role, invitedBy, token]
    );
    return sanitizeInviteRow(rows[0]);
  },

  async getInviteByToken(token) {
    const { rows } = await realPool.query('SELECT * FROM project_invites WHERE token = $1', [token]);
    return rows[0] || null;
  },

  async listPendingInvitesForProject(projectId) {
    const { rows } = await realPool.query(
      `SELECT * FROM project_invites WHERE project_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
      [projectId]
    );
    return rows.map(sanitizeInviteRow);
  },

  async revokeInvite(inviteId) {
    await realPool.query(`UPDATE project_invites SET status = 'revoked' WHERE id = $1`, [inviteId]);
  },

  async markInviteAccepted(inviteId) {
    await realPool.query(`UPDATE project_invites SET status = 'accepted', accepted_at = now() WHERE id = $1`, [inviteId]);
  },

  async getPendingInvitesForEmail(email) {
    const { rows } = await realPool.query(
      `SELECT * FROM project_invites WHERE LOWER(email) = LOWER($1) AND status = 'pending'`,
      [email]
    );
    return rows.map(sanitizeInviteRow);
  },

  async listMessages(projectId, afterISO, limit) {
    const { rows } = afterISO
      ? await realPool.query(
          `SELECT pmsg.*, u.display_name, u.username FROM project_messages pmsg
           JOIN users u ON u.id = pmsg.sender_id
           WHERE pmsg.project_id = $1 AND pmsg.created_at > $2
           ORDER BY pmsg.created_at ASC LIMIT $3`,
          [projectId, afterISO, limit]
        )
      : await realPool.query(
          `SELECT pmsg.*, u.display_name, u.username FROM project_messages pmsg
           JOIN users u ON u.id = pmsg.sender_id
           WHERE pmsg.project_id = $1
           ORDER BY pmsg.created_at DESC LIMIT $2`,
          [projectId, limit]
        );
    const ordered = afterISO ? rows : rows.reverse();
    return ordered.map(r => sanitizeMessageRow({ ...r, sender_name: r.display_name || r.username }));
  },

  async createMessage(projectId, senderId, body) {
    const { rows } = await realPool.query(
      `INSERT INTO project_messages (project_id, sender_id, body) VALUES ($1, $2, $3) RETURNING *`,
      [projectId, senderId, body]
    );
    const { rows: userRows } = await realPool.query('SELECT display_name, username FROM users WHERE id = $1', [senderId]);
    return sanitizeMessageRow({ ...rows[0], sender_name: userRows[0]?.display_name || userRows[0]?.username });
  },
};

// ---------------------------------------------------------------------------
// Local JSON-file-backed implementation (used when no Postgres is configured)
// ---------------------------------------------------------------------------
const file = {
  async findUserByEmail(email) {
    const db = readDB();
    const u = db.users.find(x => x.email.toLowerCase() === String(email).toLowerCase());
    return u ? { id: u.id, email: u.email, username: u.username, display_name: u.display_name } : null;
  },

  async listProjectsForUser(userId) {
    const db = readDB();
    const memberships = db.project_members.filter(m => m.user_id === userId);
    return memberships
      .map(m => {
        const p = db.projects.find(x => x.id === m.project_id);
        return p ? sanitizeProjectRow(p, m.role) : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async getMembership(projectId, userId) {
    const db = readDB();
    const m = db.project_members.find(x => x.project_id === projectId && x.user_id === userId);
    return m ? { role: m.role } : null;
  },

  async getProjectById(projectId) {
    const db = readDB();
    return db.projects.find(p => p.id === projectId) || null;
  },

  async createProject({ ownerId, name, projectType, data }) {
    const db = readDB();
    const project = {
      id: uuid(),
      owner_id: ownerId,
      name,
      project_type: projectType,
      data,
      version: 1,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    db.projects.push(project);
    db.project_members.push({ project_id: project.id, user_id: ownerId, role: 'owner', added_at: nowISO() });
    writeDB(db);
    return sanitizeProjectRow(project, 'owner');
  },

  async updateProjectData(projectId, data, expectedVersion) {
    const db = readDB();
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return { conflict: false, notFound: true };
    if (project.version !== expectedVersion) {
      return { conflict: true, version: project.version };
    }
    project.data = data;
    if (data?.name) project.name = data.name;
    project.version += 1;
    project.updated_at = nowISO();
    writeDB(db);
    return { conflict: false, project };
  },

  async deleteProject(projectId) {
    const db = readDB();
    db.projects = db.projects.filter(p => p.id !== projectId);
    db.project_members = db.project_members.filter(m => m.project_id !== projectId);
    db.project_invites = db.project_invites.filter(i => i.project_id !== projectId);
    db.project_messages = db.project_messages.filter(msg => msg.project_id !== projectId);
    writeDB(db);
  },

  async listMembers(projectId) {
    const db = readDB();
    return db.project_members
      .filter(m => m.project_id === projectId)
      .map(m => {
        const u = db.users.find(x => x.id === m.user_id);
        return sanitizeMemberRow({
          user_id: m.user_id,
          role: m.role,
          added_at: m.added_at,
          email: u?.email,
          username: u?.username,
          display_name: u?.display_name,
        });
      })
      .sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
  },

  async addMember(projectId, userId, role) {
    const db = readDB();
    const existing = db.project_members.find(m => m.project_id === projectId && m.user_id === userId);
    if (existing) {
      existing.role = role;
    } else {
      db.project_members.push({ project_id: projectId, user_id: userId, role, added_at: nowISO() });
    }
    writeDB(db);
  },

  async removeMember(projectId, userId) {
    const db = readDB();
    db.project_members = db.project_members.filter(m => !(m.project_id === projectId && m.user_id === userId));
    writeDB(db);
  },

  async updateMemberRole(projectId, userId, role) {
    const db = readDB();
    const m = db.project_members.find(x => x.project_id === projectId && x.user_id === userId);
    if (m) m.role = role;
    writeDB(db);
  },

  async createInvite({ projectId, email, role, invitedBy }) {
    const db = readDB();
    const invite = {
      id: uuid(),
      project_id: projectId,
      email: String(email).toLowerCase(),
      role,
      invited_by: invitedBy,
      token: crypto.randomBytes(24).toString('hex'),
      status: 'pending',
      created_at: nowISO(),
      accepted_at: null,
    };
    db.project_invites.push(invite);
    writeDB(db);
    return sanitizeInviteRow(invite);
  },

  async getInviteByToken(token) {
    const db = readDB();
    return db.project_invites.find(i => i.token === token) || null;
  },

  async listPendingInvitesForProject(projectId) {
    const db = readDB();
    return db.project_invites
      .filter(i => i.project_id === projectId && i.status === 'pending')
      .map(sanitizeInviteRow)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async revokeInvite(inviteId) {
    const db = readDB();
    const invite = db.project_invites.find(i => i.id === inviteId);
    if (invite) invite.status = 'revoked';
    writeDB(db);
  },

  async markInviteAccepted(inviteId) {
    const db = readDB();
    const invite = db.project_invites.find(i => i.id === inviteId);
    if (invite) {
      invite.status = 'accepted';
      invite.accepted_at = nowISO();
    }
    writeDB(db);
  },

  async getPendingInvitesForEmail(email) {
    const db = readDB();
    return db.project_invites
      .filter(i => i.email.toLowerCase() === String(email).toLowerCase() && i.status === 'pending')
      .map(sanitizeInviteRow);
  },

  async listMessages(projectId, afterISO, limit) {
    const db = readDB();
    let msgs = db.project_messages.filter(m => m.project_id === projectId);
    msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (afterISO) {
      msgs = msgs.filter(m => new Date(m.created_at) > new Date(afterISO));
      msgs = msgs.slice(0, limit);
    } else {
      msgs = msgs.slice(-limit);
    }
    return msgs.map(m => {
      const u = db.users.find(x => x.id === m.sender_id);
      return sanitizeMessageRow({ ...m, sender_name: u?.display_name || u?.username });
    });
  },

  async createMessage(projectId, senderId, body) {
    const db = readDB();
    const message = { id: uuid(), project_id: projectId, sender_id: senderId, body, created_at: nowISO() };
    db.project_messages.push(message);
    writeDB(db);
    const u = db.users.find(x => x.id === senderId);
    return sanitizeMessageRow({ ...message, sender_name: u?.display_name || u?.username });
  },
};

const impl = () => (hasPostgres && realPool ? pg : file);

export const projectsDb = {
  findUserByEmail: (...args) => impl().findUserByEmail(...args),
  listProjectsForUser: (...args) => impl().listProjectsForUser(...args),
  getMembership: (...args) => impl().getMembership(...args),
  getProjectById: (...args) => impl().getProjectById(...args),
  createProject: (...args) => impl().createProject(...args),
  updateProjectData: (...args) => impl().updateProjectData(...args),
  deleteProject: (...args) => impl().deleteProject(...args),
  listMembers: (...args) => impl().listMembers(...args),
  addMember: (...args) => impl().addMember(...args),
  removeMember: (...args) => impl().removeMember(...args),
  updateMemberRole: (...args) => impl().updateMemberRole(...args),
  createInvite: (...args) => impl().createInvite(...args),
  getInviteByToken: (...args) => impl().getInviteByToken(...args),
  listPendingInvitesForProject: (...args) => impl().listPendingInvitesForProject(...args),
  revokeInvite: (...args) => impl().revokeInvite(...args),
  markInviteAccepted: (...args) => impl().markInviteAccepted(...args),
  getPendingInvitesForEmail: (...args) => impl().getPendingInvitesForEmail(...args),
  listMessages: (...args) => impl().listMessages(...args),
  createMessage: (...args) => impl().createMessage(...args),
};
