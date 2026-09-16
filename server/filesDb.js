import crypto from 'crypto';
import { fileAccess, projectAccess, forbidden } from './fileAccess.js';
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

// Identity checks live here as well as on routes, so a forgotten route guard cannot expose bytes.
const implementation = () => (hasPostgres && realPool) ? pgFiles : jsonFiles;
export const filesDb = {
  async saveFile(args) {
    if (!args.userId || (args.projectId && !(await projectAccess(args.projectId,args.userId,true)))) throw forbidden();
    if (!args.buffer || args.buffer.length > 10*1024*1024) throw Object.assign(new Error('File too large'),{status:413});
    const maxBytes = Number(process.env.MAX_USER_FILE_BYTES || 250*1024*1024);
    if(realPool) {
      const client=await realPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`files:${args.userId}`]);
        const used=Number((await client.query('SELECT COALESCE(SUM(file_size),0) AS bytes FROM system_files WHERE user_id=$1',[args.userId])).rows[0].bytes);
        if(used+args.buffer.length>maxBytes) throw Object.assign(new Error('File storage quota exceeded'),{status:413,publicMessage:'Your file storage quota is full.'});
        const id=crypto.randomUUID();
        const row=(await client.query(`INSERT INTO system_files (id,user_id,project_id,file_name,file_type,file_size,file_data) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[id,args.userId,args.projectId,args.fileName,args.fileType,args.buffer.length,args.buffer])).rows[0];
        await client.query('COMMIT');return sanitizeFileMetadata(row);
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }
    const used=(readDB().system_files||[]).filter(f=>f.user_id===args.userId).reduce((n,f)=>n+Number(f.file_size),0);
    if(used+args.buffer.length>maxBytes) throw Object.assign(new Error('File storage quota exceeded'),{status:413});
    return jsonFiles.saveFile({...args,id:undefined,fileSize:args.buffer.length});
  },
  async getFileById(id,userId) {
    if(!userId) throw forbidden();
    if(!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const file=await implementation().getFileById(id);
    return await fileAccess(file,userId) ? file : null;
  },
  async deleteFile(id,userId) {
    if(!userId) throw forbidden();
    const file=await implementation().getFileById(id);
    if(!(await fileAccess(file,userId,true))) return false;
    // Authorisation above includes current project membership, including editors.
    if(realPool) return (await realPool.query('DELETE FROM system_files WHERE id=$1',[id])).rowCount>0;
    const db=readDB();db.system_files=(db.system_files||[]).filter(f=>f.id!==id);writeDB(db);return true;
  },
  async listFilesByProject(projectId,userId) {
    if(!(await projectAccess(projectId,userId))) throw forbidden();
    const files=await implementation().listFilesByProject(projectId);
    const allowed=await Promise.all(files.map(f=>fileAccess(f,userId)));
    return files.filter((_,i)=>allowed[i]);
  },
  async listFilesByUser(userId) {
    if(!userId) throw forbidden();
    return implementation().listFilesByUser(userId);
  },
};
