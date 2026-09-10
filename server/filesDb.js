import crypto from 'crypto';
import { hasPostgres, realPool, readDB, writeDB } from './db.js';

const nowISO = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function sanitizeFileMetadata(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || null,
    projectId: row.project_id || null,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    downloadUrl: `/api/files/${row.id}/download`,
    viewUrl: `/api/files/${row.id}`,
  };
}

// ---------------------------------------------------------------------------
// Postgres-backed File Database Implementation
// ---------------------------------------------------------------------------
const pgFiles = {
  async saveFile({ id, userId, projectId, fileName, fileType, fileSize, buffer }) {
    const fileId = id || uuid();
    const query = `
      INSERT INTO system_files (id, user_id, project_id, file_name, file_type, file_size, file_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size,
        file_data = EXCLUDED.file_data,
        updated_at = NOW()
      RETURNING id, user_id, project_id, file_name, file_type, file_size, created_at, updated_at
    `;
    const { rows } = await realPool.query(query, [
      fileId,
      userId || null,
      projectId || null,
      fileName,
      fileType || 'application/octet-stream',
      fileSize,
      buffer,
    ]);
    return sanitizeFileMetadata(rows[0]);
  },

  async getFileById(id) {
    const { rows } = await realPool.query(
      `SELECT id, user_id, project_id, file_name, file_type, file_size, file_data, created_at, updated_at 
       FROM system_files 
       WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      ...sanitizeFileMetadata(row),
      fileData: row.file_data, // Buffer
    };
  },

  async deleteFile(id, userId) {
    if (userId) {
      const { rowCount } = await realPool.query(
        'DELETE FROM system_files WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
        [id, userId]
      );
      return rowCount > 0;
    }
    const { rowCount } = await realPool.query('DELETE FROM system_files WHERE id = $1', [id]);
    return rowCount > 0;
  },

  async listFilesByProject(projectId) {
    const { rows } = await realPool.query(
      `SELECT id, user_id, project_id, file_name, file_type, file_size, created_at, updated_at
       FROM system_files
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );
    return rows.map(sanitizeFileMetadata);
  },

  async listFilesByUser(userId) {
    const { rows } = await realPool.query(
      `SELECT id, user_id, project_id, file_name, file_type, file_size, created_at, updated_at
       FROM system_files
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(sanitizeFileMetadata);
  }
};

// ---------------------------------------------------------------------------
// File-based / In-Memory JSON Fallback Implementation
// ---------------------------------------------------------------------------
const jsonFiles = {
  async saveFile({ id, userId, projectId, fileName, fileType, fileSize, buffer }) {
    const db = readDB();
    if (!db.system_files) db.system_files = [];

    const fileId = id || uuid();
    const now = nowISO();
    const base64Data = buffer ? buffer.toString('base64') : '';

    const existingIdx = db.system_files.findIndex(f => f.id === fileId);
    const fileRecord = {
      id: fileId,
      user_id: userId || null,
      project_id: projectId || null,
      file_name: fileName,
      file_type: fileType || 'application/octet-stream',
      file_size: Number(fileSize),
      file_data: base64Data,
      created_at: existingIdx >= 0 ? db.system_files[existingIdx].created_at : now,
      updated_at: now,
    };

    if (existingIdx >= 0) {
      db.system_files[existingIdx] = fileRecord;
    } else {
      db.system_files.push(fileRecord);
    }
    writeDB(db);
    return sanitizeFileMetadata(fileRecord);
  },

  async getFileById(id) {
    const db = readDB();
    const row = (db.system_files || []).find(f => f.id === id);
    if (!row) return null;
    return {
      ...sanitizeFileMetadata(row),
      fileData: row.file_data ? Buffer.from(row.file_data, 'base64') : Buffer.alloc(0),
    };
  },

  async deleteFile(id, userId) {
    const db = readDB();
    if (!db.system_files) return false;
    const initialLen = db.system_files.length;
    db.system_files = db.system_files.filter(f => {
      if (f.id !== id) return true;
      if (userId && f.user_id && f.user_id !== userId) return true;
      return false;
    });
    if (db.system_files.length !== initialLen) {
      writeDB(db);
      return true;
    }
    return false;
  },

  async listFilesByProject(projectId) {
    const db = readDB();
    return (db.system_files || [])
      .filter(f => f.project_id === projectId)
      .map(sanitizeFileMetadata)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async listFilesByUser(userId) {
    const db = readDB();
    return (db.system_files || [])
      .filter(f => f.user_id === userId)
      .map(sanitizeFileMetadata)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
};

export const filesDb = new Proxy({}, {
  get(_target, prop) {
    const impl = (hasPostgres && realPool) ? pgFiles : jsonFiles;
    const value = impl[prop];
    if (typeof value === 'function') {
      return value.bind(impl);
    }
    return value;
  }
});
