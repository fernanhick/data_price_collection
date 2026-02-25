import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db/index.js';
import logger from '../utils/logger.js';
import { startJob, getRunningJobs, JOB_DEFINITIONS } from '../services/jobRunner.js';

const router = Router();

/**
 * GET /api/admin/jobs
 * List available job types with their descriptions and parameter specs.
 */
router.get('/', (_req: Request, res: Response): void => {
  res.json({ jobs: JOB_DEFINITIONS });
});

/**
 * GET /api/admin/jobs/history
 * Paginated job run history, most recent first.
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const jobType = req.query.job_type as string | undefined;

    let whereClause = '';
    const params: any[] = [];

    if (jobType) {
      whereClause = 'WHERE job_type = $1';
      params.push(jobType);
      params.push(limit);
      params.push(offset);
    } else {
      params.push(limit);
      params.push(offset);
    }

    const result = await dbQuery(
      `SELECT id, job_type, params, status, started_at, finished_at,
              stats, error, triggered_by,
              EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at))::INTEGER AS duration_seconds
       FROM job_runs
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countResult = await dbQuery(
      `SELECT COUNT(*) as total FROM job_runs ${whereClause}`,
      jobType ? [jobType] : [],
    );

    res.json({
      runs: result.rows,
      total: parseInt((countResult.rows[0] as any).total),
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to fetch job history');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/jobs/running
 * List currently executing job types.
 */
router.get('/running', (_req: Request, res: Response): void => {
  const running = getRunningJobs();
  res.json({ running });
});

/**
 * POST /api/admin/jobs/run
 * Trigger a job to run asynchronously.
 * Body: { jobType: string, params?: Record<string, any> }
 */
router.post('/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { jobType, params = {} } = req.body;

    if (!jobType || typeof jobType !== 'string') {
      res.status(400).json({ error: 'jobType is required' });
      return;
    }

    const validTypes = JOB_DEFINITIONS.map(j => j.type);
    if (!validTypes.includes(jobType)) {
      res.status(400).json({ error: `Invalid jobType. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    logger.info({ userId, jobType, params }, 'Triggering job via admin UI');

    const runId = await startJob(jobType, params, userId || 'admin');

    res.status(202).json({
      runId,
      jobType,
      status: 'running',
      message: `Job "${jobType}" started with run ID ${runId}`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes('already running')) {
      res.status(409).json({ error: errorMsg });
      return;
    }

    logger.error({ error: errorMsg }, 'Failed to start job');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/jobs/run/:id
 * Get status and details for a specific job run.
 */
router.get('/run/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const runId = parseInt(String(req.params.id), 10);

    if (isNaN(runId) || runId < 1) {
      res.status(400).json({ error: 'Invalid run ID' });
      return;
    }

    const result = await dbQuery(
      `SELECT id, job_type, params, status, started_at, finished_at,
              stats, error, triggered_by,
              EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at))::INTEGER AS duration_seconds
       FROM job_runs
       WHERE id = $1`,
      [runId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Job run not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to fetch job run');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
