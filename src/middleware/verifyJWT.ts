import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { JWTPayload } from '../types/index.js';

// Cache for Convex public key
let cachedPublicKey: string | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Convert JWK to PEM format
async function convertJWKToPEM(jwk: any): Promise<string> {
  const crypto = await import('crypto');
  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: 'jwk',
  });
  return publicKey.export({ format: 'pem', type: 'spki' }) as string;
}

// Fetch and cache Convex public key
async function getConvexPublicKey(): Promise<string> {
  const now = Date.now();

  // Return cached key if still valid
  if (cachedPublicKey && now - cacheTime < CACHE_DURATION) {
    return cachedPublicKey;
  }

  try {
    const response = await fetch(config.convex.jwksUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
    }

    const jwks = await response.json() as { keys: any[] };
    if (!jwks.keys || jwks.keys.length === 0) {
      throw new Error('No keys found in JWKS');
    }

    cachedPublicKey = await convertJWKToPEM(jwks.keys[0]);
    cacheTime = now;

    logger.info('Convex public key cached successfully');
    return cachedPublicKey;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Convex public key');
    throw error;
  }
}

// Middleware to verify JWT
export async function verifyConvexJWT(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);

    // Get Convex public key
    const publicKey = await getConvexPublicKey();

    // Verify token signature
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: config.convex.url,
    }) as JWTPayload;

    // Attach user info to request
    (req as any).user = {
      userId: decoded.sub,
      tokenId: decoded.tokenId,
    };

    logger.debug(`JWT verified for user: ${decoded.sub}`);
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional: Middleware for public endpoints (no JWT required)
export function publicEndpoint(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Just pass through - no JWT verification needed
  next();
}
