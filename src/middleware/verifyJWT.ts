import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { JWTPayload } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Cache for JWT public key (supports Clerk, Convex, and other JWKS providers)
let cachedPublicKey: string | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Development mode - use local keys instead of Convex
const isDevelopment = process.env.NODE_ENV === 'development';
const DEV_PUBLIC_KEY_PATH = path.join(process.cwd(), 'scripts', '.dev-keys', 'public.pem');

// Convert JWK to PEM format
async function convertJWKToPEM(jwk: any): Promise<string> {
  const crypto = await import('crypto');
  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: 'jwk',
  });
  return publicKey.export({ format: 'pem', type: 'spki' }) as string;
}

// Get development public key from local file
function getDevPublicKey(): string {
  if (!fs.existsSync(DEV_PUBLIC_KEY_PATH)) {
    throw new Error(
      'Development public key not found. Run: npm run dev:generate-jwt',
    );
  }
  return fs.readFileSync(DEV_PUBLIC_KEY_PATH, 'utf8');
}

// Fetch and cache JWT public key from JWKS endpoint (Clerk, Convex, etc.)
async function getConvexPublicKey(): Promise<string> {
  // In development mode, use local keys
  if (isDevelopment) {
    try {
      const devKey = getDevPublicKey();
      logger.info('Using development public key for JWT verification');
      return devKey;
    } catch (error) {
      logger.warn(
        { error },
        'Development key not found, falling back to Convex (will likely fail)',
      );
      // Fall through to Convex key fetch
    }
  }

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

    const jwks = (await response.json()) as { keys: any[] };
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

// Middleware to verify JWT (supports both Admin and Clerk tokens)
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

    // Decode token without verification to check type
    const decoded = jwt.decode(token) as any;

    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // Check if it's an admin token (signed with ADMIN_JWT_SECRET)
    if (decoded.type === 'admin') {
      // Verify admin token with ADMIN_JWT_SECRET
      const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'your-secret-key-change-in-production';
      const verified = jwt.verify(token, ADMIN_JWT_SECRET) as any;

      // Attach user info to request
      (req as any).user = {
        userId: verified.sub,
        email: verified.email,
        name: verified.name,
        isAdmin: true,
      };

      logger.debug(`Admin JWT verified for user: ${verified.email}`);
      next();
      return;
    }

    // Otherwise, it's a Clerk token - verify with Clerk JWKS
    const publicKey = await getConvexPublicKey();

    // Verify token signature
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['RS256'],
    };

    if (!isDevelopment) {
      verifyOptions.issuer = config.convex.url;
    }

    const verifiedClerk = jwt.verify(token, publicKey, verifyOptions) as JWTPayload;

    // Attach user info to request
    (req as any).user = {
      userId: verifiedClerk.sub,
      tokenId: verifiedClerk.tokenId,
    };

    logger.debug(`Clerk JWT verified for user: ${verifiedClerk.sub}`);
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional: Middleware for public endpoints (no JWT required)
export function publicEndpoint(_req: Request, _res: Response, next: NextFunction): void {
  // Just pass through - no JWT verification needed
  next();
}
