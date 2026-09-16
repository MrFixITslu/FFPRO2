import { Router } from '../http.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { encryptForUser, decryptForUser } from '../crypto.js';
import { realtimeHub } from '../realtime.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const MAX_BYTES = 5 * 1024 * 1024; // 5MB limit

// Add schema validation for data payloads
import { validateAppState } from '../../shared/appState.js';

// Generous write limiter for data sync
const dataWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 120 writes per min is safe for active debounced usage
  standardHeaders: true,
  legacyHeaders: false
});

router.use(requireAuth);

// FIX: Apply rate limiting to all write operations (GET is exempt)
router.put('/', dataWriteLimiter);
router.delete('/', dataWriteLimiter);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ciphertext, iv, auth_tag, version, updated_at FROM user_data WHERE user_id = $1',
      [req.user.id]
    );
    if (!rows[0]) {
      return res.json({ data: null, version: 0, updatedAt: null });
    }
    const row = rows[0];
    const data = decryptForUser(req.user.id, {
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    });
    res.json({ data, version: row.version, updatedAt: row.updated_at });
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: 'Failed to load your data.' });
  }
});

router.put('/', async (req, res) => {
  const { data, expectedVersion } = req.body || {};
  
  // FIX: Add comprehensive schema validation
  const validationError = validateAppState(data);
  if (validationError || typeof data !== 'object' || data === null || Array.isArray(data)) {
    return res.status(400).json({ error: validationError || 'Invalid payload.' });
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    return res.status(400).json({ error: 'expectedVersion is required.' });
  }

  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return res.status(400).json({ error: 'Payload is not serializable.' });
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'Data payload too large.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`data:${req.user.id}`]);
    // Lock this user's row (if any) so two concurrent saves from the same
    // account can't both read the same version and silently clobber one another.
    const { rows } = await client.query(
      'SELECT version FROM user_data WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const currentVersion = rows[0]?.version || 0;

    if (expectedVersion !== currentVersion) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Data was updated elsewhere since you last loaded it.',
        version: currentVersion,
      });
    }

    const { ciphertext, iv, authTag } = encryptForUser(req.user.id, data);
    const newVersion = currentVersion + 1;

    await client.query(
      `INSERT INTO user_data (user_id, ciphertext, iv, auth_tag, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE
         SET ciphertext = EXCLUDED.ciphertext,
             iv = EXCLUDED.iv,
             auth_tag = EXCLUDED.auth_tag,
             version = EXCLUDED.version,
             updated_at = now()`,
      [req.user.id, ciphertext, iv, authTag, newVersion]
    );
    await client.query('COMMIT');
    realtimeHub.broadcastUserDataUpdate(req.user.id, {
      version: newVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    });
    res.json({ ok: true, version: newVersion });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('PUT /api/data error:', err);
    res.status(500).json({ error: 'Failed to save your data.' });
  } finally {
    client?.release();
  }
});

// Used by "Purge data" in Settings so a reset actually resets the account,
// not just the local browser cache (which would otherwise be overwritten
// again on next login by the still-present cloud copy).
router.delete('/', async (req, res) => {
  const expectedVersion=req.body?.expectedVersion;
  if(!Number.isSafeInteger(expectedVersion) || expectedVersion<0) return res.status(400).json({error:'expectedVersion is required.'});
  let client;
  try {
    client=await pool.connect();await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`data:${req.user.id}`]);
    const row=(await client.query('SELECT version FROM user_data WHERE user_id = $1 FOR UPDATE',[req.user.id])).rows[0];
    if((row?.version || 0)!==expectedVersion){await client.query('ROLLBACK');return res.status(409).json({error:'Data changed elsewhere. Reload before resetting.'});}
    const version=expectedVersion+1;
    const empty={transactions:[],recurringExpenses:[],recurringIncomes:[],savingGoals:[],investmentGoals:[],categoryBudgets:{},bankConnections:[],investments:[],events:[],calendarItems:[],contacts:[],ideas:[],financialLogs:[],cashOpeningBalance:0,lastUpdated:new Date().toISOString()};
    const {ciphertext,iv,authTag}=encryptForUser(req.user.id,empty);
    await client.query(`INSERT INTO user_data (user_id,ciphertext,iv,auth_tag,version,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(user_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,version=EXCLUDED.version,updated_at=now()`,[req.user.id,ciphertext,iv,authTag,version]);
    await client.query('COMMIT');realtimeHub.broadcastUserDataUpdate(req.user.id,{version,updatedAt:empty.lastUpdated});
    res.json({ok:true,version});
  } catch(error) {if(client)await client.query('ROLLBACK');throw error;}finally{client?.release();}
});

export default router;
