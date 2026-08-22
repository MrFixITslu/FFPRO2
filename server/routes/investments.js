import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { encryptForUser, decryptForUser } from '../crypto.js';
import { verifyBinanceCredentials, fetchBinanceHoldings } from '../binanceService.js';

const router = Router();

// Credential submission and live syncs both hit a real external API and
// should be rate-limited more tightly than ordinary reads.
const investmentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireAuth);
router.use(investmentLimiter);

async function saveCredentials(userId, provider, apiKey, apiSecret) {
  const encKey = encryptForUser(userId, apiKey);
  const encSecret = encryptForUser(userId, apiSecret);
  await pool.query(
    `INSERT INTO investment_credentials
       (user_id, provider, api_key_ciphertext, api_key_iv, api_key_auth_tag,
        api_secret_ciphertext, api_secret_iv, api_secret_auth_tag, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       api_key_ciphertext = EXCLUDED.api_key_ciphertext,
       api_key_iv = EXCLUDED.api_key_iv,
       api_key_auth_tag = EXCLUDED.api_key_auth_tag,
       api_secret_ciphertext = EXCLUDED.api_secret_ciphertext,
       api_secret_iv = EXCLUDED.api_secret_iv,
       api_secret_auth_tag = EXCLUDED.api_secret_auth_tag,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId, provider,
      encKey.ciphertext, encKey.iv, encKey.authTag,
      encSecret.ciphertext, encSecret.iv, encSecret.authTag,
    ]
  );
}

async function loadCredentials(userId, provider) {
  const { rows } = await pool.query(
    `SELECT api_key_ciphertext, api_key_iv, api_key_auth_tag,
            api_secret_ciphertext, api_secret_iv, api_secret_auth_tag
     FROM investment_credentials WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const apiKey = decryptForUser(userId, {
    ciphertext: row.api_key_ciphertext, iv: row.api_key_iv, authTag: row.api_key_auth_tag,
  });
  const apiSecret = decryptForUser(userId, {
    ciphertext: row.api_secret_ciphertext, iv: row.api_secret_iv, authTag: row.api_secret_auth_tag,
  });
  return { apiKey, apiSecret };
}

// Connect (or reconnect) a Binance account. Verifies the key/secret against
// a real signed Binance call before storing anything, and never echoes the
// secret back to the client — only ever encrypted, server-side.
router.post('/binance/credentials', async (req, res) => {
  const { apiKey, apiSecret } = req.body || {};
  if (typeof apiKey !== 'string' || typeof apiSecret !== 'string' || !apiKey.trim() || !apiSecret.trim()) {
    return res.status(400).json({ error: 'API key and secret are both required.' });
  }
  try {
    await verifyBinanceCredentials(apiKey.trim(), apiSecret.trim());
  } catch (err) {
    console.warn('Binance credential verification failed:', err.message);
    return res.status(400).json({ error: err.message || 'Could not verify Binance credentials.' });
  }
  try {
    await saveCredentials(req.user.id, 'binance', apiKey.trim(), apiSecret.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to store Binance credentials:', err);
    res.status(500).json({ error: 'Verified, but failed to save the connection. Please try again.' });
  }
});

router.delete('/binance/credentials', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM investment_credentials WHERE user_id = $1 AND provider = $2',
      [req.user.id, 'binance']
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to remove Binance credentials:', err);
    res.status(500).json({ error: 'Failed to disconnect Binance.' });
  }
});

// Pull real, current holdings from Binance using the stored credentials.
router.get('/binance/holdings', async (req, res) => {
  try {
    const creds = await loadCredentials(req.user.id, 'binance');
    if (!creds) {
      return res.status(404).json({ error: 'No Binance connection found. Connect your account first.' });
    }
    const holdings = await fetchBinanceHoldings(creds.apiKey, creds.apiSecret);
    res.json(holdings);
  } catch (err) {
    console.error('Binance holdings sync failed:', err.message);
    res.status(502).json({ error: err.message || 'Could not reach Binance right now.' });
  }
});

export default router;
