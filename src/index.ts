import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import logger from './utils/logger.js';
import { healthCheck, closePool } from './db/index.js';
import { verifyConvexJWT } from './middleware/verifyJWT.js';
import { verifyAdmin } from './middleware/verifyAdmin.js';
import scheduler from './services/scheduler.js';
import imageProcessor from './services/imageProcessor.js';

// Import routes
import priceRoutes from './routes/prices.js';
import skuRoutes from './routes/skus.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import authRoutes from './routes/auth.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"], // Allow fetch/XHR to same origin
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: null, // Explicitly disable for HTTP development
      },
    },
    crossOriginOpenerPolicy: false, // Disable COOP warning
  }),
);
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

// Static files for admin dashboard
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// Serve product images
const imagesPath = process.env.HOME + '/images';
app.use('/images', express.static(imagesPath));

// Auth routes (public - no JWT required)
app.use('/api/auth', authRoutes);

// Protected routes (require JWT)
app.use('/api/prices', verifyConvexJWT, priceRoutes);
app.use('/api/skus', verifyConvexJWT, skuRoutes);
app.use('/api', verifyConvexJWT, analyticsRoutes);

// Admin routes (require JWT + admin authorization)
app.use('/api/admin', verifyConvexJWT, verifyAdmin, adminRoutes);

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

    // Initialize image processor directories
    await imageProcessor.initialize();
    logger.info('✅ Image processor initialized');

    // Start scheduler
    scheduler.startAll();

    // Start server - listen on all interfaces (IPv4 and IPv6)
    app.listen(PORT, '::', () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API Base: ${config.apiBaseUrl}`);
      logger.info(`Listening on all interfaces (IPv4 and IPv6 dual-stack)`);
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
