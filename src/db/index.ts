import pkg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pkg;

// Use SSL with self-signed cert support for remote (non-localhost) connections
const sslForUrl = (url: string | undefined) =>
  url && !url.includes('localhost') && !url.includes('127.0.0.1')
    ? { rejectUnauthorized: false }
    : undefined;

// Primary pool (DB_TARGET determines local vs ec2)
const pool = new Pool({
  connectionString: config.database.url,
  ssl: sslForUrl(config.database.url),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle client');
});

// Secondary pool for dual-write sync (only created when DB_SYNC=true)
const syncEnabled = process.env.DB_SYNC === 'true';
const primaryIsEc2 = (process.env.DB_TARGET || 'local') === 'ec2';
const secondaryUrl = syncEnabled
  ? (primaryIsEc2 ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL_EC2)
  : null;

const secondaryPool = secondaryUrl
  ? new Pool({
      connectionString: secondaryUrl,
      ssl: sslForUrl(secondaryUrl),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : null;

if (secondaryPool) {
  secondaryPool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on secondary (sync) client');
  });
  logger.info(
    { primary: primaryIsEc2 ? 'ec2' : 'local', secondary: primaryIsEc2 ? 'local' : 'ec2' },
    '🔄 DB dual-write sync enabled',
  );
}

// Detect write queries that should be synced to secondary
const isWriteQuery = (text: string) =>
  /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\s/i.test(text);

// Query wrapper with logging and optional dual-write
export async function query<T = any>(
  text: string,
  params?: any[],
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, params, duration }, 'Database query executed');

    // Dual-write: fire secondary asynchronously for write queries
    if (secondaryPool && isWriteQuery(text)) {
      secondaryPool.query(text, params).catch((err) => {
        logger.warn({ err, text }, '⚠️  Secondary DB sync write failed');
      });
    }

    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
  } catch (error) {
    logger.error({ error, text, params }, 'Database query failed');
    throw error;
  }
}

// Transaction wrapper (primary only — transactions are not dual-written)
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error }, 'Transaction failed, rolled back');
    throw error;
  } finally {
    client.release();
  }
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}

// Close pool
export async function closePool(): Promise<void> {
  await pool.end();
  if (secondaryPool) await secondaryPool.end();
  logger.info('Database pool(s) closed');
}

export { pool };
