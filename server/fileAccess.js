import { projectsDb } from './projectsDb.js';
import { pool } from './db.js';
import { decryptForUser } from './crypto.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function projectAccess(projectId, userId, write = false) {
  if (!userId || typeof projectId !== 'string') return false;
  // Shared IDs are UUIDs. Personal plans use application-generated IDs.
  if (uuid.test(projectId)) {
    const project = await projectsDb.getProjectById(projectId);
    if (project) {
      const membership = await projectsDb.getMembership(projectId, userId);
      return !!membership && (!write || ['owner','editor'].includes(membership.role));
    }
  }
  const row = (await pool.query('SELECT ciphertext, iv, auth_tag, version, updated_at FROM user_data WHERE user_id = $1', [userId])).rows[0];
  if (!row) return false;
  const state = decryptForUser(userId, { ciphertext:row.ciphertext, iv:row.iv, authTag:row.auth_tag });
  return (state.events || []).some(project => project.id === projectId && !project.isShared);
}
export async function fileAccess(file, userId, write = false) {
  if (!userId || !file) return false;
  if (file.projectId && uuid.test(file.projectId)) {
    const project = await projectsDb.getProjectById(file.projectId);
    if (project) return projectAccess(file.projectId, userId, write);
  }
  return file.userId === userId;
}
export function forbidden() { const error = new Error('File access denied.'); error.status = 403; return error; }
