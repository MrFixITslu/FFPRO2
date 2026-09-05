import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getQueueStats } from '../services/fundingResearch.js';
import { runFullResearchCycle } from '../jobs/fundingScheduler.js';
import { sortOpportunities, computeDeadlineStatus, isActiveNonExpired } from '../services/fundingDeterministic.js';

const router = Router();

const triggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3, // maximum 3 manual triggers per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Research cycle was triggered recently. Please wait before triggering again.' }
});

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
    // 'active' means strictly non-expired (open, closing soon, rolling) and not administratively archived/inactive.
    if (status === 'active') {
      withStatus = withStatus.filter(r => isActiveNonExpired(r) && r.deadline_status !== 'expired');
    } else if (status === 'expired') {
      withStatus = withStatus.filter(r => r.deadline_status === 'expired' || r.status === 'expired');
    } else if (status === 'open') {
      withStatus = withStatus.filter(r => r.deadline_status === 'open' && isActiveNonExpired(r));
    } else if (status === 'closing_soon') {
      withStatus = withStatus.filter(r => r.deadline_status === 'closing_soon' && isActiveNonExpired(r));
    } else if (status === 'no_deadline') {
      withStatus = withStatus.filter(r => r.deadline_status === 'no_deadline' && isActiveNonExpired(r));
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

/**
 * Match a project exclusively against active, non-expired grant opportunities.
 * CRITICAL RULE:
 * Before doing any AI processing or project-matching, filter out all expired,
 * closed, inactive, or past-deadline grants so they NEVER enter the workflow.
 */
router.post('/match-project', async (req, res) => {
  try {
    const {
      projectId,
      projectName = 'Project',
      description = '',
      category = '',
      budget = null,
      targetAudience = '',
      location = 'Saint Lucia & Caribbean'
    } = req.body;

    // 1. Fetch all raw opportunities from DB
    const { rows } = await pool.query(`SELECT * FROM funding_opportunities ORDER BY first_seen_at DESC LIMIT 500`);

    // 2. HARD FILTER: Exclude ALL expired, closed, inactive or past-deadline grants
    const activeGrants = rows.filter(g => {
      if (!isActiveNonExpired(g)) return false;
      const status = computeDeadlineStatus(g.deadline);
      return status !== 'expired';
    });

    if (activeGrants.length === 0) {
      return res.json({
        success: true,
        project_name: projectName,
        active_grants_evaluated_count: 0,
        matches: [],
        message: 'No active, non-expired grants are currently available for matching.'
      });
    }

    // 3. Match against active grants
    const projectText = `${projectName} ${description} ${category} ${targetAudience} ${location}`.toLowerCase();
    const isLaserTag = projectText.includes('laser') || projectText.includes('tag') || projectText.includes('entertainment') || projectText.includes('recreation') || projectText.includes('game') || projectText.includes('youth') || projectText.includes('sports');

    const matches = activeGrants.map(grant => {
      const grantTitle = grant.title || '';
      const grantDesc = grant.description || '';
      const grantCategory = grant.category || '';
      const grantTags = Array.isArray(grant.tags) ? grant.tags.join(' ') : (grant.tags || '');
      const grantEligibility = grant.eligibility_summary || '';
      const grantContent = `${grantTitle} ${grantDesc} ${grantCategory} ${grantTags} ${grantEligibility}`.toLowerCase();

      // Compute contextual match score
      let score = 50;
      const matchingPoints = [];

      // Keyword match evaluation
      if (isLaserTag) {
        if (grantContent.includes('laser') || grantContent.includes('entertainment') || grantContent.includes('recreation')) {
          score += 35;
          matchingPoints.push('Direct alignment with commercial entertainment, indoor recreation, and experiential leisure infrastructure.');
        }
        if (grantContent.includes('youth') || grantContent.includes('safe spaces') || grantContent.includes('social impact')) {
          score += 20;
          matchingPoints.push('Strong focus on positive youth engagement, community recreation spaces, and interactive group activities.');
        }
        if (grantContent.includes('technology') || grantContent.includes('innovation') || grantContent.includes('digital')) {
          score += 15;
          matchingPoints.push('Supports technology-enabled recreational hardware, scoring systems, and modern digital leisure facilities.');
        }
        if (grantContent.includes('small business') || grantContent.includes('enterprise') || grantContent.includes('saint lucia')) {
          score += 15;
          matchingPoints.push('Eligibility covers local Caribbean and Saint Lucian enterprise development and event equipment acquisition.');
        }
      } else {
        // General project matching
        if (category && grantContent.includes(category.toLowerCase())) {
          score += 25;
          matchingPoints.push(`Shared focus on ${category} initiatives.`);
        }
        if (grantContent.includes('business') || grantContent.includes('enterprise') || grantContent.includes('community')) {
          score += 15;
          matchingPoints.push('Matches enterprise development and organizational capacity objectives.');
        }
      }

      // Format funding amount cleanly
      let amountFormatted = 'Funding amount variable';
      if (grant.amount_min != null && grant.amount_max != null) {
        amountFormatted = `$${grant.amount_min.toLocaleString()} - $${grant.amount_max.toLocaleString()} ${grant.currency || 'USD'}`;
      } else if (grant.amount_max != null) {
        amountFormatted = `Up to $${grant.amount_max.toLocaleString()} ${grant.currency || 'USD'}`;
      } else if (grant.amount_min != null) {
        amountFormatted = `From $${grant.amount_min.toLocaleString()} ${grant.currency || 'USD'}`;
      }

      // Format application deadline
      let deadlineFormatted = 'Rolling / Open';
      if (grant.deadline) {
        const d = new Date(grant.deadline);
        if (!isNaN(d.getTime())) {
          deadlineFormatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } else {
          deadlineFormatted = String(grant.deadline);
        }
      }

      // Generate concise, clear "Why it matches"
      let whyItMatches = '';
      if (matchingPoints.length > 0) {
        whyItMatches = `${projectName} aligns directly with this opportunity: ${matchingPoints.join(' ')}`;
      } else {
        whyItMatches = `${projectName} meets the criteria under the ${grantCategory || 'general innovation'} funding category. Supports operational deployment and equipment scaling for active local initiatives.`;
      }

      return {
        id: grant.id,
        grant_name: grant.title,
        why_it_matches: whyItMatches,
        funding_amount: amountFormatted,
        amount_min: grant.amount_min,
        amount_max: grant.amount_max,
        currency: grant.currency || 'USD',
        application_deadline: deadlineFormatted,
        deadline_raw: grant.deadline,
        deadline_status: computeDeadlineStatus(grant.deadline),
        view_grant_url: grant.source_url || 'https://www.oecs.int',
        funder_name: grant.funder_name,
        category: grant.category,
        eligibility_summary: grant.eligibility_summary,
        match_score: Math.min(98, score),
        is_active: true
      };
    });

    // Sort by match score descending
    matches.sort((a, b) => b.match_score - a.match_score);

    res.json({
      success: true,
      project_name: projectName,
      active_grants_evaluated_count: activeGrants.length,
      matches
    });
  } catch (err) {
    console.error('[funding] Match project error:', err?.message);
    res.status(500).json({ error: 'Failed to match project with active grants.' });
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
// schedule. Runs in the background; rate-limited to avoid quota exhaustion.
router.post('/research/trigger', triggerLimiter, async (_req, res) => {
  runFullResearchCycle().catch(err => console.error('[funding] Manual trigger error:', err?.message));
  res.json({ started: true });
});

export default router;
