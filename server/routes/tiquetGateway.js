import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { Router } from '../http.js';
import { realPool } from '../db.js';
import { encryptForUser, decryptForUser } from '../crypto.js';
import { realtimeHub } from '../realtime.js';
import { queueFinanceSnapshotEvent, wakePlatformEventPump } from '../platformEvents.js';

const router = Router();

const gatewayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

function safeSecretMatch(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return a.length === b.length && a.length >= 32 && crypto.timingSafeEqual(a, b);
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function emptyState(currency) {
  return {
    transactions: [],
    recurringExpenses: [],
    recurringIncomes: [],
    savingGoals: [],
    investmentGoals: [],
    categoryBudgets: {},
    bankConnections: [],
    investments: [],
    events: [],
    calendarItems: [],
    contacts: [],
    ideas: [],
    financialLogs: [],
    cashOpeningBalance: 0,
    displayCurrency: currency,
    lastUpdated: new Date().toISOString(),
  };
}

router.post('/tiquet/paid', gatewayLimiter, async (req, res) => {
  const expectedSecret = process.env.TIQUET_GATEWAY_SECRET;
  if (!expectedSecret || !safeSecretMatch(req.get('X-Gateway-Secret'), expectedSecret)) {
    return res.status(401).json({ error: 'Unauthorized gateway request.' });
  }
  if (!realPool) {
    return res.status(503).json({ error: 'Gateway requires PostgreSQL.' });
  }

  const eventId = cleanText(req.body?.eventId, 160);
  const organizationId = cleanText(req.body?.workspaceNumber, 160);
  const jobId = cleanText(req.body?.jobId, 160);
  const jobTitle = cleanText(req.body?.jobTitle, 240);
  const paymentReference = cleanText(req.body?.paymentReference, 160);
  const customerName = cleanText(req.body?.customer?.name, 240);
  const currency = cleanText(req.body?.currency, 8).toUpperCase();
  const amount = Number(req.body?.amount);
  const paidAt = new Date(req.body?.paidAt || '');

  if (
    !/^[A-Za-z0-9:_-]{8,160}$/.test(eventId) ||
    !organizationId ||
    !jobId ||
    !jobTitle ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 1e12 ||
    !['USD', 'XCD'].includes(currency) ||
    Number.isNaN(paidAt.getTime())
  ) {
    return res.status(400).json({ error: 'Invalid Tiquet payment event.' });
  }

  const client = await realPool.connect();
  let userId = null;
  let newVersion = null;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tiquet:${eventId}`]);

    const duplicate = (await client.query(
      'SELECT event_id FROM external_finance_events WHERE event_id = $1',
      [eventId]
    )).rows[0];
    if (duplicate) {
      await client.query('COMMIT');
      return res.json({ ok: true, duplicate: true, eventId });
    }

    const user = (await client.query(
      `SELECT id
         FROM users
        WHERE hub_organization_id = $1
          AND hub_finance_owner = TRUE
        LIMIT 1`,
      [organizationId]
    )).rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'FFPRO finance workspace is not provisioned for this organisation.' });
    }
    userId = user.id;

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`data:${userId}`]);
    const row = (await client.query(
      'SELECT ciphertext, iv, auth_tag, version FROM user_data WHERE user_id = $1 FOR UPDATE',
      [userId]
    )).rows[0];

    const data = row
      ? decryptForUser(userId, { ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag })
      : emptyState(currency);

    const stateCurrency = String(data.displayCurrency || currency).toUpperCase();
    if (stateCurrency !== currency) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Currency mismatch: Tiquet sent ${currency}, FFPRO workspace uses ${stateCurrency}.`
      });
    }

    const transactions = Array.isArray(data.transactions) ? [...data.transactions] : [];
    transactions.push({
      id: `tiquet:${eventId}`,
      date: paidAt.toISOString().slice(0, 10),
      amount,
      category: 'Business Income',
      description: `Tiquet payment: ${jobTitle}`,
      type: 'income',
      notes: [
        `Tiquet job ${jobId}`,
        paymentReference ? `Payment reference ${paymentReference}` : null,
      ].filter(Boolean).join(' · '),
      ...(customerName ? { vendor: customerName } : {}),
    });

    const nextData = {
      ...data,
      transactions,
      displayCurrency: stateCurrency,
      lastUpdated: new Date().toISOString(),
    };
    const { ciphertext, iv, authTag } = encryptForUser(userId, nextData);
    newVersion = Number(row?.version || 0) + 1;

    await client.query(
      `INSERT INTO user_data (user_id, ciphertext, iv, auth_tag, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET ciphertext = EXCLUDED.ciphertext,
             iv = EXCLUDED.iv,
             auth_tag = EXCLUDED.auth_tag,
             version = EXCLUDED.version,
             updated_at = NOW()`,
      [userId, ciphertext, iv, authTag, newVersion]
    );

    await client.query(
      `INSERT INTO external_finance_events
        (event_id, source, user_id, external_reference, amount, currency, occurred_at)
       VALUES ($1, 'tiquet', $2, $3, $4, $5, $6)`,
      [eventId, userId, paymentReference || jobId, amount, currency, paidAt.toISOString()]
    );

    await queueFinanceSnapshotEvent(client, userId, newVersion, nextData);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Tiquet Gateway]', error?.message || error);
    return res.status(500).json({ error: 'Failed to record Tiquet payment.' });
  } finally {
    client.release();
  }

  wakePlatformEventPump();
  realtimeHub.broadcastUserDataUpdate(userId, {
    version: newVersion,
    updatedAt: new Date().toISOString(),
    updatedBy: 'tiquet-gateway',
  });
  return res.status(201).json({ ok: true, duplicate: false, eventId, version: newVersion });
});

export default router;
