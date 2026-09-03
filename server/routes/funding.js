import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getQueueStats } from '../services/fundingResearch.js';
import { runFullResearchCycle } from '../jobs/fundingScheduler.js';
import { sortOpportunities, computeDeadlineStatus } from '../services/fundingDeterministic.js';

const router = Router();

// All funding endpoints require a logged-in FFPRO user — this is
// organizational business data, not public.
router.use(requireAuth);

/**
 * List verified funding opportunities. All filtering/sorting/pagination
 * here is plain deterministic SQL/JS — never AI — per the requirement to
 * keep the model scoped to content interpretation only.
 */
router.get('/opportunities', async (req, res) => {
  try {
    const { status = 'active', category, sortBy = 'deadline', page = '1', pageSize = '25' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
    const offset = (pageNum - 1) * size;

    const conditions = [];
    const params = [];
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM funding_opportunities ${whereClause} ORDER BY first_seen_at DESC LIMIT 500`,
      params
    );

    // Deadline status is computed here (deterministic), not stored or
    // inferred by the model — it changes with the calendar, not the data.
    let withStatus = rows.map(r => ({ ...r, deadline_status: computeDeadlineStatus(r.deadline) }));

    // Filter by active status or specific deadline status:
    // 'active' means non-expired (open, closing soon, rolling) and not administratively archived/inactive.
    if (status === 'active') {
      withStatus = withStatus.filter(r => r.deadline_status !== 'expired' && r.status !== 'archived' && r.status !== 'inactive');
    } else if (status === 'expired') {
      withStatus = withStatus.filter(r => r.deadline_status === 'expired');
    } else if (status === 'open') {
      withStatus = withStatus.filter(r => r.deadline_status === 'open');
    } else if (status === 'closing_soon') {
      withStatus = withStatus.filter(r => r.deadline_status === 'closing_soon');
    } else if (status === 'no_deadline') {
      withStatus = withStatus.filter(r => r.deadline_status === 'no_deadline');
    }

    const sorted = sortOpportunities(withStatus, sortBy);
    const paged = sorted.slice(offset, offset + size);

    res.json({
      opportunities: paged,
      total: sorted.length,
      page: pageNum,
      pageSize: size,
    });
  } catch (err) {
    console.error('[funding] List error:', err?.message);
    res.status(500).json({ error: 'Failed to load funding opportunities.' });
  }
});

router.get('/opportunities/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM funding_opportunities WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json({ opportunity: { ...rows[0], deadline_status: computeDeadlineStatus(rows[0].deadline) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load opportunity.' });
  }
});

router.get('/research/status', async (_req, res) => {
  try {
    const stats = await getQueueStats();
    res.json({ queue: stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load research status.' });
  }
});

// Manual trigger — useful for testing/ops without waiting for the nightly
// schedule. Runs in the background; the request returns immediately.
router.post('/research/trigger', async (_req, res) => {
  runFullResearchCycle().catch(err => console.error('[funding] Manual trigger error:', err?.message));
  res.json({ started: true });
});

export default router;
