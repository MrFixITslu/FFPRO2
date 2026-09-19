import { Router } from '../http.js';
import { getAiNewsBriefing } from '../services/aiNewsService.js';

const router = Router();

/**
 * GET /api/ai-news
 * Fetch aggregated AI industry news and executive intelligence briefing.
 * Optional query: ?refresh=true to bypass cache.
 */
router.get('/', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const data = await getAiNewsBriefing(forceRefresh);
    res.json(data);
  } catch (error) {
    console.error('[ai-news] Error generating news briefing:', error);
    res.status(500).json({
      error: 'Failed to retrieve AI industry briefing. Please retry.',
      details: error.message
    });
  }
});

export default router;
