import { Request, Response, NextFunction } from 'express';

export function verifySecret(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const expected = process.env.CATALOG_API_SECRET;

  if (!expected) {
    console.error('[CatalogAuth] CATALOG_API_SECRET not set on server');
    res.status(500).json({ error: 'Server misconfigured' });
    return;
  }

  if (token !== expected) {
    res.status(403).json({ error: 'Invalid secret' });
    return;
  }

  next();
}
