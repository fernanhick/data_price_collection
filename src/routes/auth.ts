import crypto from 'crypto';
import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import logger from '../utils/logger.js';
import { storeTokens } from '../services/stockx/tokenManager.js';

const router = express.Router();

// JWT secret for admin tokens (different from Clerk tokens)
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d'; // Token expires in 7 days

// Login endpoint
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user by email
    const result = await query(
      'SELECT id, email, password_hash, name FROM admin_users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login time
    await query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: user.id.toString(),
        email: user.email,
        name: user.name,
        type: 'admin',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    logger.info({ email: user.email }, 'Admin user logged in');

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Login failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info (requires valid token)
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Get user from database
    const result = await query(
      'SELECT id, email, name, created_at, last_login FROM admin_users WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error({ error }, 'Failed to get user info');
    res.status(401).json({ error: 'Invalid token' });
  }
});

// In-memory state store for OAuth CSRF protection (one-time setup flow)
const pendingStates = new Set<string>();

// Initiate StockX OAuth flow — visit this URL in a browser to authorize
router.get('/stockx', (_req: Request, res: Response): void => {
  const clientId = process.env.STOCKX_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: 'STOCKX_CLIENT_ID not configured' });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);
  // Clean up state after 10 minutes
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

  const redirectUri = `${process.env.API_BASE_URL}/api/auth/stockx/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'offline_access openid',
    audience: 'gateway.stockx.com',
    state,
  });

  res.redirect(`https://accounts.stockx.com/authorize?${params}`);
});

// StockX OAuth callback — StockX redirects here after user authorization
router.get('/stockx/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      logger.error({ error, error_description }, 'StockX OAuth error');
      res.status(400).json({ error, error_description });
      return;
    }

    if (!state || !pendingStates.has(state as string)) {
      res.status(400).json({ error: 'Invalid or expired OAuth state' });
      return;
    }
    pendingStates.delete(state as string);

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    const clientId = process.env.STOCKX_CLIENT_ID || '';
    const clientSecret = process.env.STOCKX_CLIENT_SECRET || '';
    const redirectUri = `${process.env.API_BASE_URL}/api/auth/stockx/callback`;

    const tokenResp = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      const body = await tokenResp.text();
      logger.error({ status: tokenResp.status, body }, 'StockX token exchange failed');
      res.status(502).json({ error: 'Token exchange failed', detail: body });
      return;
    }

    const data = (await tokenResp.json()) as any;
    await storeTokens(data.access_token, data.refresh_token, data.expires_in || 43200);

    logger.info('StockX OAuth completed — tokens stored');
    res.json({ success: true, message: 'StockX authenticated successfully' });
  } catch (err) {
    logger.error({ error: err }, 'StockX callback error');
    res.status(500).json({ error: 'Authentication failed' });
  }
});

export default router;
