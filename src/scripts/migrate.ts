import { query, closePool } from '../db/index.ts';
import { schema } from '../db/schema.ts';
import logger from '../utils/logger.ts';

async function migrate() {
  try {
    logger.info('Starting database migration...');

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      logger.debug(`Executing: ${statement.substring(0, 50)}...`);
      await query(statement);
    }

    logger.info('✅ Database migration completed successfully');
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    process.exit(1);
  } finally {
    await closePool();
  }
}

migrate();
