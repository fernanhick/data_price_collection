import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Middleware to verify that the authenticated user is an admin
 * Must be used after verifyConvexJWT middleware
 */
export function verifyAdmin(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = (req as any).user;

    if (!user || !user.userId) {
      logger.warn('Admin check failed: No user found in request');
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { userId } = user;
    const adminUserIds = config.admin.userIds;

    if (!adminUserIds || adminUserIds.length === 0) {
      logger.error('ADMIN_USER_IDS not configured in environment');
      res.status(500).json({ error: 'Admin authorization not configured' });
      return;
    }

    if (!adminUserIds.includes(userId)) {
      logger.warn({ userId }, 'Admin access denied: User not in admin list');
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    logger.debug({ userId }, 'Admin access granted');
    next();
  } catch (error) {
    logger.error({ error }, 'Error in admin verification');
    res.status(500).json({ error: 'Internal server error' });
  }
}
