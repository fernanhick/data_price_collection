# Security & Deployment Configuration

## Overview

This document explains security configuration changes made for local development and what needs to be adjusted for production deployment.

---

## Content Security Policy (CSP)

### Current Configuration (Local Development)

**Location:** `src/index.ts`

The CSP is currently configured for **HTTP development** on local network (192.168.1.x):

```typescript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allows onclick handlers
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: null, // ⚠️ DISABLED for HTTP development
    },
  },
  crossOriginOpenerPolicy: false, // ⚠️ DISABLED for HTTP development
})
```

### Why These Settings?

**Problem Solved:**
- `upgrade-insecure-requests` was forcing HTTP → HTTPS upgrade
- Mobile browsers got `ERR_SSL_PROTOCOL_ERROR` when accessing admin panel
- API calls failed with "Failed to fetch" errors

**Current State:**
- ✅ Works on local network over HTTP
- ✅ Accessible from mobile devices
- ⚠️ **NOT suitable for production**

---

## Production Deployment Changes

### 🔐 When deploying to VPS with HTTPS (REQUIRED)

**Step 1: Enable SSL/TLS**

Set up HTTPS using:
- Let's Encrypt SSL certificate
- Nginx reverse proxy with SSL
- Or Cloudflare SSL

**Step 2: Update CSP Configuration**

In `src/index.ts`, change to:

```typescript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // ⚠️ Remove 'unsafe-inline' if possible
      scriptSrcAttr: null, // ⚠️ Remove unsafe-inline, use addEventListener
      styleSrc: ["'self'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://your-api-domain.com'], // Update to production domain
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [], // ✅ ENABLE for HTTPS - forces HTTP → HTTPS
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' }, // ✅ ENABLE for security
})
```

**Step 3: Remove Inline Event Handlers**

If you enabled strict CSP (removed `'unsafe-inline'`), update `public/admin/test-simple.html`:

```html
<!-- Before (unsafe) -->
<button onclick="testWithFetch()">Test</button>

<!-- After (secure) -->
<button id="testBtn">Test</button>
<script>
  document.getElementById('testBtn').addEventListener('click', testWithFetch);
</script>
```

**Step 4: Update CORS for Production**

In `src/index.ts`:

```typescript
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'https://your-mobile-app-domain.com',
    credentials: true,
  }),
);
```

---

## Environment-Based Configuration

### Recommended Approach

Use environment variables to toggle security settings:

```typescript
// src/index.ts
const isProduction = process.env.NODE_ENV === 'production';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...(isProduction ? [] : ["'unsafe-inline'"])],
        scriptSrcAttr: isProduction ? null : ["'unsafe-inline'"],
        upgradeInsecureRequests: isProduction ? [] : null,
        connectSrc: [
          "'self'",
          ...(isProduction ? [process.env.API_BASE_URL] : []),
        ],
      },
    },
    crossOriginOpenerPolicy: isProduction ? { policy: 'same-origin' } : false,
  }),
);
```

### Environment Variables

**Development (`.env.development`):**
```bash
NODE_ENV=development
CORS_ORIGIN=*
API_BASE_URL=http://192.168.1.73:3000
```

**Production (`.env.production`):**
```bash
NODE_ENV=production
CORS_ORIGIN=https://your-mobile-app.com
API_BASE_URL=https://api.yourdomain.com
```

---

## Security Checklist for Production

### Before Deploying to VPS:

- [ ] **SSL Certificate installed** (Let's Encrypt, Cloudflare, etc.)
- [ ] **Enable `upgrade-insecure-requests`** in CSP
- [ ] **Remove `'unsafe-inline'`** from scriptSrc (if possible)
- [ ] **Remove `'unsafe-inline'`** from scriptSrcAttr
- [ ] **Enable `crossOriginOpenerPolicy`**
- [ ] **Update CORS origin** to specific domain (not `*`)
- [ ] **Update `connectSrc`** to production API domain
- [ ] **Set strong `ADMIN_JWT_SECRET`** (not the default)
- [ ] **Enable firewall** on VPS (ufw/iptables)
- [ ] **Restrict database access** to localhost only
- [ ] **Review all environment variables**

### Testing Production Security

```bash
# Test HTTPS is working
curl -I https://your-domain.com

# Test HTTP redirects to HTTPS
curl -I http://your-domain.com

# Test CSP headers
curl -I https://your-domain.com/admin | grep -i "content-security"

# Verify upgrade-insecure-requests is enabled
curl -I https://your-domain.com | grep "upgrade-insecure-requests"
```

---

## Current vs Production Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| **Protocol** | HTTP | HTTPS ✅ |
| **upgrade-insecure-requests** | Disabled | **Enabled ✅** |
| **scriptSrc 'unsafe-inline'** | Enabled | **Disabled ✅** |
| **scriptSrcAttr** | 'unsafe-inline' | **null ✅** |
| **CORS origin** | `*` (all) | **Specific domain ✅** |
| **crossOriginOpenerPolicy** | Disabled | **Enabled ✅** |
| **connectSrc** | 'self' | **'self' + API domain ✅** |

---

## Troubleshooting Production

### Issue: Mobile app can't connect to API

**Solution:**
```typescript
// Add your mobile app domain to connectSrc
connectSrc: ["'self'", 'https://api.yourdomain.com', 'https://app.yourdomain.com']
```

### Issue: Admin panel JavaScript not working

**Check:**
1. Remove inline `onclick` handlers
2. Use `addEventListener` instead
3. Verify CSP allows scripts from 'self'

### Issue: ERR_SSL_PROTOCOL_ERROR in production

**This means:**
- SSL certificate not properly configured
- Nginx not proxying correctly
- Certificate expired

**Fix:**
```bash
# Check SSL certificate
sudo certbot certificates

# Renew if needed
sudo certbot renew

# Restart nginx
sudo systemctl restart nginx
```

---

## Additional Security Hardening

### 1. Rate Limiting

Add rate limiting for API endpoints:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
});

app.use('/api/', limiter);
```

### 2. Helmet Full Configuration (Production)

```typescript
app.use(
  helmet({
    contentSecurityPolicy: { /* as above */ },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'no-referrer' },
    xssFilter: true,
  }),
);
```

### 3. Environment Variables Security

```bash
# Never commit these to git!
ADMIN_JWT_SECRET=<generate-strong-secret>
DATABASE_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>

# Generate strong secrets
openssl rand -base64 32
```

---

## References

- [Helmet.js Documentation](https://helmetjs.github.io/)
- [CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Let's Encrypt](https://letsencrypt.org/)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-06 | Disabled `upgrade-insecure-requests` | Fix mobile access over HTTP for local development |
| 2026-02-06 | Added `scriptSrcAttr: 'unsafe-inline'` | Allow onclick handlers in admin UI |
| 2026-02-06 | Disabled `crossOriginOpenerPolicy` | Remove COOP warning for HTTP |

---

**⚠️ IMPORTANT:** Before deploying to production VPS with a public domain, review and implement ALL production security settings above.
