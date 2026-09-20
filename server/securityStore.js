import crypto from 'node:crypto';
import { realPool, readDB, writeDB } from './db.js';

export async function initSecuritySchema() {
  if (!realPool) return;
  await realPool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized ON users (LOWER(email));
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
    );
  `);
}
export async function getUser(id) {
  if (realPool) return (await realPool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0] || null;
  return readDB().users.find(user => user.id === id) || null;
}
export async function getUserByEmail(email) {
  if (realPool) return (await realPool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email])).rows[0] || null;
  return readDB().users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;
}
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
export async function createVerification(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  if (realPool) {
    // A later resend need not invalidate a link still being delivered. Consumption invalidates all.
    await realPool.query('INSERT INTO email_verification_tokens (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [digest(token),userId,expires]);
  } else {
    const db = readDB(); db.email_verification_tokens ||= [];
    db.email_verification_tokens.push({ token_hash:digest(token), user_id:userId, expires_at:expires }); writeDB(db);
  }
  return token;
}
export async function consumeVerification(token) {
  const hash = digest(token);
  if (!realPool) {
    const db = readDB();
    const row = (db.email_verification_tokens || []).find(t => t.token_hash === hash && !t.used_at && new Date(t.expires_at) > new Date());
    if (!row) return false;
    const user = db.users.find(u => u.id === row.user_id); if (!user) return false;
    user.email_verified_at = new Date().toISOString();
    db.email_verification_tokens.filter(t => t.user_id === user.id).forEach(t => t.used_at = user.email_verified_at);
    writeDB(db); return true;
  }
  const client = await realPool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM email_verification_tokens WHERE token_hash=$1 FOR UPDATE', [hash])).rows[0];
    if (!row || row.used_at || new Date(row.expires_at) <= new Date()) { await client.query('ROLLBACK'); return false; }
    await client.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [row.user_id]);
    await client.query('UPDATE email_verification_tokens SET used_at=now() WHERE user_id=$1', [row.user_id]);
    await client.query('COMMIT'); return true;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function resetPassword(token, passwordHash) {
  const hash = digest(token);
  if (!realPool) {
    const db = readDB(); const row = db.password_reset_tokens.find(t => t.token_hash === hash && !t.used_at && new Date(t.expires_at) > new Date());
    if (!row) return false;
    const user = db.users.find(u => u.id === row.user_id); if (!user) return false;
    user.password_hash=passwordHash; user.session_version=(user.session_version || 0)+1; user.email_verified_at=new Date().toISOString();
    db.password_reset_tokens.filter(t=>t.user_id===user.id).forEach(t=>t.used_at=user.email_verified_at);writeDB(db);return true;
  }
  const client = await realPool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE', [hash])).rows[0];
    if (!row || row.used_at || new Date(row.expires_at) <= new Date()) { await client.query('ROLLBACK'); return false; }
    await client.query('UPDATE users SET password_hash=$1, session_version=session_version+1, email_verified_at=now() WHERE id=$2', [passwordHash,row.user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [row.user_id]);
    await client.query('COMMIT');return true;
  } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
}
export async function verifyUser(userId) {
  if(realPool) await realPool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [userId]);
  else {const db=readDB(); const user=db.users.find(u=>u.id===userId); if(user){user.email_verified_at=new Date().toISOString();writeDB(db);}}
}

export async function updateUserPassword(userId, passwordHash) {
  if (realPool) {
    await realPool.query(
      'UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2',
      [passwordHash, userId]
    );
  } else {
    const db = readDB();
    const user = (db.users || []).find(u => u.id === userId);
    if (user) {
      user.password_hash = passwordHash;
      user.session_version = (user.session_version || 0) + 1;
      writeDB(db);
    }
  }
}
