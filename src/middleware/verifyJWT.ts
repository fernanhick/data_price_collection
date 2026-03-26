import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { JWTPayload } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Cache per JWKS URL
const keyCache = new Map<string, { pem: string; fetchedAt: number }>();

// Local dev key mode: only when no Clerk JWKS URLs are configured at all
const DEV_PUBLIC_KEY_PATH = path.join(process.cwd(), 'scripts', '.dev-keys', 'public.pem');
const devJwksUrl = process.env.CONVEX_JWKS_URL_DEV;
const prodJwksUrl = process.env.CONVEX_JWKS_URL_PROD;
const fallbackJwksUrl = process.env.CONVEX_JWKS_URL;
const useLocalDevKey = !devJwksUrl && !prodJwksUrl && !fallbackJwksUrl && process.env.NODE_ENV === 'development';

// Collect all configured JWKS URLs (dev + prod, deduplicated)
function getJwksUrls(): string[] {
  const urls = new Set<string>();
  if (devJwksUrl)      urls.add(devJwksUrl);
  if (prodJwksUrl)     urls.add(prodJwksUrl);
  if (fallbackJwksUrl) urls.add(fallbackJwksUrl);
  return [...urls];
}

// Convert JWK to PEM format
async function convertJWKToPEM(jwk: any): Promise<string> {
  const crypto = await import('crypto');
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return publicKey.export({ format: 'pem', type: 'spki' }) as string;
}

// Fetch and cache public key from a single JWKS URL
async function fetchPublicKey(url: string): Promise<string> {
  const cached = keyCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_DURATION) {
    return cached.pem;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`JWKS fetch failed for ${url}: ${response.statusText}`);

  const jwks = (await response.json()) as { keys: any[] };
  if (!jwks.keys?.length) throw new Error(`No keys in JWKS at ${url}`);

  const pem = await convertJWKToPEM(jwks.keys[0]);
  keyCache.set(url, { pem, fetchedAt: Date.now() });
  return pem;
}

// Try verifying a token against all configured JWKS endpoints — first success wins
async function verifyClerkToken(token: string): Promise<JWTPayload> {
  // Offline local dev mode (no Clerk configured)
  if (useLocalDevKey) {
    if (!fs.existsSync(DEV_PUBLIC_KEY_PATH)) {
      throw new Error('Dev public key not found. Run: npm run dev:generate-jwt');
    }
    const pem = fs.readFileSync(DEV_PUBLIC_KEY_PATH, 'utf8');
    return jwt.verify(token, pem, { algorithms: ['RS256'] }) as JWTPayload;
  }

  const urls = getJwksUrls();
  if (urls.length === 0) throw new Error('No JWKS URLs configured');

  const errors: string[] = [];
  for (const url of urls) {
    try {
      const pem = await fetchPublicKey(url);
      const verified = jwt.verify(token, pem, { algorithms: ['RS256'] }) as JWTPayload;
      logger.debug({ url }, 'Clerk JWT verified');
      return verified;
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`);
    }
  }

  throw new Error(`Token rejected by all Clerk instances — ${errors.join(' | ')}`);
}

// Middleware to verify JWT (supports Admin and Clerk tokens)
export async function verifyConvexJWT(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token) as any;
    if (!decoded) throw new Error('Invalid token format');

    // Admin token — verified with ADMIN_JWT_SECRET
    if (decoded.type === 'admin') {
      const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'your-secret-key-change-in-production';
      const verified = jwt.verify(token, ADMIN_JWT_SECRET) as any;
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

    // Clerk token — try all configured JWKS endpoints
    const verifiedClerk = await verifyClerkToken(token);
    (req as any).user = {
      userId: verifiedClerk.sub,
      tokenId: verifiedClerk.tokenId,
    };
    logger.debug(`Clerk JWT verified for user: ${verifiedClerk.sub}`);
    next();
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional: Middleware for public endpoints (no JWT required)
export function publicEndpoint(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
