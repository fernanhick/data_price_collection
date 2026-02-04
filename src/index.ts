import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/index.js';
import logger from './utils/logger.js';
import { healthCheck, closePool } from './db/index.js';
import { verifyConvexJWT } from './middleware/verifyJWT.js';
import scheduler from './services/scheduler.js';

// Import routes
import priceRoutes from './routes/prices.js';
import skuRoutes from './routes/skus.js';

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
  }),
);
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
      },
      'HTTP request completed',
    );
  });
  next();
});

// Health check endpoint (public)
app.get('/health', async (_req, res) => {
  try {
    const dbHealthy = await healthCheck();
    const schedulerStatus = scheduler.getStatus();

    res.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      scheduler: schedulerStatus,
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database check failed',
    });
  }
});

// Protected routes (require JWT)
app.use('/api/prices', verifyConvexJWT, priceRoutes);
app.use('/api/skus', verifyConvexJWT, skuRoutes);

// Error handling middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    _error: any,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ): void => {
    logger.error({ error: _error }, 'Unhandled error');
    res.status(500).json({
      error: 'Internal server error',
      message: config.nodeEnv === 'development' ? _error.message : undefined,
    });
  },
);

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = config.port;

async function start() {
  try {
    // Test database connection
    const dbHealthy = await healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    logger.info('✅ Database connection established');

    // Start scheduler
    scheduler.startAll();

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API Base: ${config.apiBaseUrl}`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  scheduler.stopAll();
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  scheduler.stopAll();
  await closePool();
  process.exit(0);
});

start();
