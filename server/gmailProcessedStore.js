import fs from 'fs';
import path from 'path';
import { pool } from './db.js';

const DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'database.json');

// In-memory cache for fast lookup and deduping
const memoryCache = new Map(); // key: userId, value: Map<messageId, { status, processedAt }>

function getCacheForUser(userId) {
  if (!memoryCache.has(userId)) {
    memoryCache.set(userId, new Map());
  }
  return memoryCache.get(userId);
}

function readJsonFile() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[gmailProcessedStore] Error reading database.json:', e?.message);
  }
  return {};
}

function writeJsonFile(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[gmailProcessedStore] Error writing database.json:', e?.message);
  }
}

/**
 * Ensures table exists in PostgreSQL if active
 */
let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gmail_processed_messages (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'read',
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_gmail_processed_user ON gmail_processed_messages(user_id);
    `);
    tableEnsured = true;
  } catch (e) {
    // If pool is fallback or table creation failed, we proceed gracefully
    tableEnsured = true;
  }
}

/**
 * Returns a Set of all processed (read or deleted) message IDs for the user
 */
export async function getProcessedMessageIds(userId) {
  await ensureTable();
  const cache = getCacheForUser(userId);

  try {
    const { rows } = await pool.query(
      'SELECT message_id, status, processed_at FROM gmail_processed_messages WHERE user_id = $1',
      [userId]
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const set = new Set();
      rows.forEach(r => {
        set.add(r.message_id);
        cache.set(r.message_id, { status: r.status, processedAt: r.processed_at });
      });
      return set;
    }
  } catch (err) {
    // Fallback to JSON or in-memory
  }

  // Fallback to database.json
  const db = readJsonFile();
  const list = db.gmail_processed_messages || [];
  const set = new Set();
  list.filter(item => item.user_id === userId).forEach(item => {
    set.add(item.message_id);
    cache.set(item.message_id, { status: item.status, processedAt: item.processed_at });
  });

  // Include in-memory cache
  for (const [msgId] of cache.entries()) {
    set.add(msgId);
  }

  return set;
}

/**
 * Marks a message as processed ('read' or 'deleted') permanently
 */
export async function markMessageProcessed(userId, messageId, status = 'read') {
  if (!userId || !messageId) return;
  await ensureTable();

  const cache = getCacheForUser(userId);
  const now = new Date().toISOString();
  cache.set(messageId, { status, processedAt: now });

  // 1. Try PostgreSQL
  try {
    await pool.query(
      `INSERT INTO gmail_processed_messages (user_id, message_id, status, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, message_id)
       DO UPDATE SET status = EXCLUDED.status, processed_at = NOW()`,
      [userId, messageId, status]
    );
    return;
  } catch (err) {
    // Continue to JSON fallback
  }

  // 2. Fallback to database.json
  try {
    const db = readJsonFile();
    db.gmail_processed_messages = db.gmail_processed_messages || [];
    const idx = db.gmail_processed_messages.findIndex(
      m => m.user_id === userId && m.message_id === messageId
    );
    const record = { user_id: userId, message_id: messageId, status, processed_at: now };
    if (idx >= 0) {
      db.gmail_processed_messages[idx] = record;
    } else {
      db.gmail_processed_messages.push(record);
    }
    writeJsonFile(db);
  } catch (err) {
    console.warn('[gmailProcessedStore] Failed to write fallback record:', err?.message);
  }
}

/**
 * Returns full list of processed messages with status
 */
export async function getAllProcessedMessages(userId) {
  await ensureTable();
  try {
    const { rows } = await pool.query(
      'SELECT message_id, status, processed_at FROM gmail_processed_messages WHERE user_id = $1 ORDER BY processed_at DESC',
      [userId]
    );
    if (Array.isArray(rows)) {
      return rows.map(r => ({
        messageId: r.message_id,
        status: r.status,
        processedAt: r.processed_at,
      }));
    }
  } catch (err) {}

  const db = readJsonFile();
  const list = db.gmail_processed_messages || [];
  return list
    .filter(item => item.user_id === userId)
    .map(item => ({
      messageId: item.message_id,
      status: item.status,
      processedAt: item.processed_at,
    }));
}
