import { Router } from '../http.js';
import rateLimit from 'express-rate-limit';
import { getAiNewsBriefing } from '../services/aiNewsService.js';

const router = Router();

const aiNewsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many news briefing requests. Please wait a minute.' }
});

/**
 * GET /api/ai-news
 * Fetch aggregated industry news and executive intelligence briefing.
 * Optional query:
 *   ?refresh=true to bypass cache
 *   ?topic=ai|ict|weather|sports|finance|energy|<custom>
 */
router.get('/', aiNewsLimiter, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const topic = (req.query.topic || 'ai').toString().trim().slice(0, 50);
    const data = await getAiNewsBriefing(forceRefresh, topic);
    res.json(data);
  } catch (error) {
    console.error('[ai-news] Error generating news briefing:', error);
    res.status(500).json({
      error: 'Failed to retrieve industry intelligence briefing. Please retry.',
      details: error.message
    });
  }
});

export default router;
