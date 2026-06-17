import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { getUpcomingReleases } from '../services/releases/upcomingReleases.js';

const router = Router();

/**
 * GET /api/releases/upcoming
 * Public read of the upcoming-release calendar for the mobile app.
 *
 * Query params:
 *   brand        optional brand filter (case-insensitive)
 *   limit        max items (1–250, default 100)
 *   includePast  "true" to include already-released items (default false)
 */
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const includePast = req.query.includePast === 'true';

    const releases = await getUpcomingReleases({ brand, limit, includePast });
    res.json({ count: releases.length, releases });
  } catch (error) {
    logger.error({ error }, 'Failed to get upcoming releases');
    res.status(500).json({ error: 'Failed to get upcoming releases' });
  }
});

export default router;
