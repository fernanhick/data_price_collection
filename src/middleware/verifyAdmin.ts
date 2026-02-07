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

    // Check if user has isAdmin flag (set by admin JWT authentication)
    if (user.isAdmin === true) {
      logger.debug({ userId: user.userId, email: user.email }, 'Admin access granted via admin JWT');
      next();
      return;
    }

    // Fallback: Check against ADMIN_USER_IDS for Clerk/Convex users
    const { userId } = user;
    const adminUserIds = config.admin.userIds;

    if (!adminUserIds || adminUserIds.length === 0) {
      logger.warn({ userId }, 'Admin access denied: Not an admin user and ADMIN_USER_IDS not configured');
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    if (!adminUserIds.includes(userId)) {
      logger.warn({ userId }, 'Admin access denied: User not in admin list');
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    logger.debug({ userId }, 'Admin access granted via ADMIN_USER_IDS');
    next();
  } catch (error) {
    logger.error({ error }, 'Error in admin verification');
    res.status(500).json({ error: 'Internal server error' });
  }
}
