import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { encryptForUser, decryptForUser } from '../crypto.js';
import { realtimeHub } from '../realtime.js';

const router = Router();

const PROVIDER_TIQUET = 'tiquet';
const TIQUET_BUSINESS_LABEL = 'V79D — Vision79 Digital';
const MAX_WORKSPACE_NUMBER_LEN = 255;
const MAX_STRING_LEN = 500;

function isNonEmptyString(v, maxLen = MAX_STRING_LEN) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

// ─────────────────────────────────────────────────────────────────────────
// Settings → Gateway: CRUD for the authenticated user's own connections.
// Everything here is scoped by req.user.id — a user can only ever read or
// write their own gateway_connections row, never anyone else's.
// ─────────────────────────────────────────────────────────────────────────

const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/connections/:provider', async (req, res) => {
  const { provider } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT workspace_number, enabled, updated_at FROM gateway_connections WHERE user_id = $1 AND provider = $2',
      [req.user.id, provider]
    );
    const connection = rows[0] || null;

    let lastEvent = null;
    if (connection) {
      const { rows: eventRows } = await pool.query(
        `SELECT external_id, amount, currency, received_at FROM gateway_events
         WHERE user_id = $1 AND provider = $2 ORDER BY received_at DESC LIMIT 1`,
        [req.user.id, provider]
      );
      lastEvent = eventRows[0] || null;
    }

    res.json({ connection, lastEvent });
  } catch (err) {
    console.error('GET /api/gateway/connections error:', err);
    res.status(500).json({ error: 'Failed to load gateway connection.' });
  }
});

settingsRouter.put('/connections/:provider', async (req, res) => {
  const { provider } = req.params;
  const { workspaceNumber, enabled } = req.body || {};

  if (!isNonEmptyString(workspaceNumber, MAX_WORKSPACE_NUMBER_LEN)) {
    return res.status(400).json({ error: 'Workspace Number is required.' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false.' });
  }

  try {
    await pool.query(
      `INSERT INTO gateway_connections (user_id, provider, workspace_number, enabled, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         workspace_number = EXCLUDED.workspace_number,
         enabled = EXCLUDED.enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, provider, workspaceNumber.trim(), enabled]
    );
    res.json({ ok: true });
  } catch (err) {
    // UNIQUE (provider, workspace_number) violation: someone else already
    // registered this workspace number. Never say "already taken by user
    // X" — just refuse, so this can't be used to enumerate other accounts.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This Workspace Number is already connected to a different account.' });
    }
    console.error('PUT /api/gateway/connections error:', err);
    res.status(500).json({ error: 'Failed to save gateway connection.' });
  }
});

settingsRouter.delete('/connections/:provider', async (req, res) => {
  const { provider } = req.params;
  try {
    await pool.query(
      'DELETE FROM gateway_connections WHERE user_id = $1 AND provider = $2',
      [req.user.id, provider]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/gateway/connections error:', err);
    res.status(500).json({ error: 'Failed to remove gateway connection.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Inbound webhook: V79Tiquet → FFPRO2. Server-to-server, no browser
// session — authenticated by a shared secret instead, mirroring the same
// pattern V79Tiquet itself already uses for its website2026 intake webhook
// (constant-time comparison of a header against a server-only env secret).
// ─────────────────────────────────────────────────────────────────────────

const webhookLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120, // generous — this is a trusted server-to-server call, not a public form
  standardHeaders: true,
  legacyHeaders: false,
});

function requireGatewaySecret(req, res, next) {
  const configuredSecret = process.env.TIQUET_GATEWAY_SECRET;
  if (!configuredSecret) {
    console.error('[Gateway] TIQUET_GATEWAY_SECRET is not configured — rejecting all inbound gateway events.');
    return res.status(503).json({ error: 'Gateway is not configured.' });
  }
  const provided = req.headers['x-gateway-secret'];
  if (
    typeof provided !== 'string' ||
    provided.length !== configuredSecret.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configuredSecret))
  ) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

function defaultAppState() {
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
    forecastSettings: { yearsToProject: 5, monthlyContribution: 500, expectedReturn: 8 },
    cashOpeningBalance: 0,
  };
}

router.post('/webhooks/tiquet/paid', webhookLimiter, requireGatewaySecret, async (req, res) => {
  const body = req.body || {};
  const { eventId, workspaceNumber, jobId, jobTitle, amount, currency, paidAt, paymentReference, customer } = body;

  // ── Validate every field server-side. Never trust client-supplied amount,
  // workspace, or identity — all of it is checked here regardless of what
  // the payload claims. ──────────────────────────────────────────────────
  if (!isNonEmptyString(eventId, 255)) return res.status(400).json({ error: 'eventId is required.' });
  if (!isNonEmptyString(workspaceNumber, MAX_WORKSPACE_NUMBER_LEN)) return res.status(400).json({ error: 'workspaceNumber is required.' });
  if (!isNonEmptyString(jobId, 255)) return res.status(400).json({ error: 'jobId is required.' });
  if (jobTitle !== undefined && jobTitle !== null && !isNonEmptyString(String(jobTitle), 300)) {
    return res.status(400).json({ error: 'jobTitle is invalid.' });
  }
  const amountNum = typeof amount === 'number' ? amount : NaN;
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 1_000_000_000) {
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }
  if (!isNonEmptyString(currency, 10) || !/^[A-Za-z]{3}$/.test(currency)) {
    return res.status(400).json({ error: 'currency must be a 3-letter code.' });
  }
  let paidAtIso;
  const paidAtDate = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(paidAtDate.getTime())) {
    return res.status(400).json({ error: 'paidAt is not a valid date.' });
  }
  paidAtIso = paidAtDate.toISOString();
  if (paymentReference !== undefined && paymentReference !== null && !isNonEmptyString(String(paymentReference), 255)) {
    return res.status(400).json({ error: 'paymentReference is invalid.' });
  }
  let customerName = null;
  if (customer && typeof customer === 'object') {
    if (typeof customer.name === 'string' && customer.name.trim()) {
      customerName = customer.name.trim().slice(0, 200);
    }
  }

  try {
    // Look up which FFPRO2 user (if any) has registered this exact workspace
    // number for Tiquet, and only proceed if that connection is enabled.
    // This lookup — not the shared secret — is what decides WHICH account
    // gets the income; the secret only proves the request came from a
    // trusted Tiquet server, not which workspace it's allowed to write to.
    const { rows: connRows } = await pool.query(
      'SELECT user_id FROM gateway_connections WHERE provider = $1 AND workspace_number = $2 AND enabled = true',
      [PROVIDER_TIQUET, workspaceNumber]
    );
    const connection = connRows[0];
    if (!connection) {
      return res.status(404).json({ error: 'Unknown or disabled workspace.' });
    }
    const userId = connection.user_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency: this INSERT is the single source of truth for "have we
      // already processed this event." ON CONFLICT DO NOTHING means a
      // duplicate delivery (Tiquet retry, at-least-once redelivery) simply
      // inserts nothing and we return "already processed" below — all
      // inside the same transaction as the actual income write, so a crash
      // partway through rolls BOTH back together. A genuine retry after a
      // real failure can therefore still succeed; a retry after a real
      // success cannot double-create the transaction.
      const { rows: dedupeRows } = await client.query(
        `INSERT INTO gateway_events (provider, workspace_number, external_id, user_id, amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, workspace_number, external_id) DO NOTHING
         RETURNING id`,
        [PROVIDER_TIQUET, workspaceNumber, `${jobId}:${eventId}`, userId, amountNum, currency.toUpperCase()]
      );

      if (dedupeRows.length === 0) {
        // Already processed by an earlier delivery of this same event.
        await client.query('ROLLBACK');
        return res.json({ ok: true, alreadyProcessed: true });
      }

      // Load, decrypt, and update this user's data — same row-lock +
      // version-increment pattern as the normal PUT /api/data save path,
      // so this can never race a concurrent save from the user's own
      // browser. mergeAppStates() on the client unions arrays by id, so
      // this new transaction survives even if the client's next autosave
      // hits a 409 conflict against the version bump below.
      const { rows: udRows } = await client.query(
        'SELECT ciphertext, iv, auth_tag, version FROM user_data WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      const currentVersion = udRows[0]?.version || 0;
      const state = udRows[0]
        ? decryptForUser(userId, { ciphertext: udRows[0].ciphertext, iv: udRows[0].iv, authTag: udRows[0].auth_tag })
        : defaultAppState();

      const transactionId = `tiquet-${crypto.randomUUID()}`;
      const noteParts = [
        'Auto-imported from V79Tiquet.',
        `Job ID: ${jobId}`,
        paymentReference ? `Payment ref: ${paymentReference}` : null,
        `Event ID: ${eventId}`,
      ].filter(Boolean);

      const newTransaction = {
        id: transactionId,
        date: paidAtIso,
        amount: amountNum,
        category: 'Client Payment',
        description: jobTitle
          ? `V79Tiquet payment — ${jobTitle}`
          : (customerName ? `V79Tiquet payment — ${customerName}` : 'V79Tiquet payment'),
        type: 'income',
        notes: noteParts.join(' | '),
        vendor: customerName || undefined,
        institution: TIQUET_BUSINESS_LABEL,
      };

      state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
      state.transactions.push(newTransaction);
      state.lastUpdated = new Date().toISOString();

      const { ciphertext, iv, authTag } = encryptForUser(userId, state);
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
        [userId, ciphertext, iv, authTag, newVersion]
      );

      await client.query(
        'UPDATE gateway_events SET transaction_id = $1 WHERE provider = $2 AND workspace_number = $3 AND external_id = $4',
        [transactionId, PROVIDER_TIQUET, workspaceNumber, `${jobId}:${eventId}`]
      );

      await client.query('COMMIT');

      realtimeHub.broadcastUserDataUpdate(userId, {
        version: newVersion,
        updatedAt: new Date().toISOString(),
        updatedBy: 'gateway:tiquet',
      });

      console.log(`[Gateway] Recorded V79Tiquet income for job ${jobId} (event ${eventId}) → user ${userId}, transaction ${transactionId}`);
      res.status(201).json({ ok: true, transactionId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Gateway] Failed to process Tiquet paid event:', err);
    res.status(500).json({ error: 'Failed to process event.' });
  }
});

router.use('/', settingsRouter);

export default router;
