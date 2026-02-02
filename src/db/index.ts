import pkg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pkg;

// Create connection pool
const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Error handling
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle client');
});

// Query wrapper with logging
export async function query<T = any>(
  text: string,
  params?: any[],
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, params, duration }, 'Database query executed');
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
  } catch (error) {
    logger.error({ error, text, params }, 'Database query failed');
    throw error;
  }
}

// Transaction wrapper
export async function transaction<T>(
  callback: (client: any) => Promise<T>,
): Promise<T> {
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
  logger.info('Database pool closed');
}

export { pool };
