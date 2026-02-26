import { Request, Response, NextFunction } from 'express';
import { verifyConvexJWT } from './verifyJWT.js';

/**
 * Accepts either:
 *  - Bearer <CATALOG_API_SECRET>  (server-to-server / Convex actions)
 *  - Bearer <JWT>                 (Convex/Clerk user tokens)
 */
export async function verifySecretOrJWT(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.CATALOG_API_SECRET;

  // If the token matches the secret, pass through immediately
  if (secret && token === secret) {
    next();
    return;
  }

  // Otherwise fall back to JWT verification
  return verifyConvexJWT(req, res, next);
}
