# Development JWT Token Setup

This guide explains how to use local JWT tokens for testing the admin dashboard without requiring a Convex deployment.

## Quick Start

### 1. Generate a Test JWT Token

```bash
npm run dev:generate-jwt
```

This will:
- Generate an RSA key pair (first time only, then reused)
- Create a test JWT token valid for 24 hours
- Display the token in the terminal
- Save the token to `scripts/.dev-keys/test-token.txt`

### 2. Configure Environment

Make sure your `.env` file has:

```bash
NODE_ENV=development
ADMIN_USER_IDS=dev-user-123
```

The `dev-user-123` user ID matches the default token. If you generate a token with a different user ID, update `ADMIN_USER_IDS` accordingly.

### 3. Start the Server

```bash
npm run dev
```

### 4. Login to Admin Dashboard

1. Open http://localhost:3000/admin
2. Paste the JWT token from step 1
3. Click "Login"

You should now have full access to the admin dashboard!

## Custom User IDs

Generate a token with a custom user ID:

```bash
npm run dev:generate-jwt your-custom-user-id
```

Then update `.env`:

```bash
ADMIN_USER_IDS=your-custom-user-id
```

## Custom Expiration

Generate a token with custom expiration:

```bash
npm run dev:generate-jwt my-user 7d  # Expires in 7 days
npm run dev:generate-jwt my-user 1h  # Expires in 1 hour
npm run dev:generate-jwt my-user 30m # Expires in 30 minutes
```

## How It Works

### Development Mode

When `NODE_ENV=development`, the JWT verification middleware:
- Uses the local public key from `scripts/.dev-keys/public.pem`
- Skips Convex issuer validation
- Allows locally-generated tokens

### Production Mode

When `NODE_ENV=production`:
- Fetches the public key from your Convex deployment JWKS endpoint
- Validates the issuer matches your Convex URL
- Only accepts tokens signed by Convex

## Security Notes

### Development Keys

The generated RSA keys are stored in:
```
scripts/.dev-keys/
  ├── private.pem  # DO NOT COMMIT - Used to sign tokens
  ├── public.pem   # Used to verify tokens
  └── test-token.txt # The latest generated token
```

These are already added to `.gitignore` to prevent accidental commits.

### Important Warnings

- **NEVER use development tokens in production**
- **NEVER commit the `.dev-keys/` directory**
- **Development tokens only work when `NODE_ENV=development`**
- For production, always use real Convex JWT tokens

## Testing API Endpoints

Once you have a token, test API endpoints:

```bash
# Save token to variable
TOKEN=$(cat scripts/.dev-keys/test-token.txt)

# Test SKU listing
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/skus?limit=5 | jq

# Test admin endpoint (create sneaker)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sku_code": "test-shoe-123",
    "brand": "Nike",
    "model": "Test Shoe",
    "colorway": "Black/White",
    "tier": 1,
    "retail_price": 150
  }' \
  http://localhost:3000/api/admin/skus | jq
```

## Troubleshooting

### "Invalid or expired token" Error

**Check 1**: Verify `NODE_ENV=development`
```bash
echo $NODE_ENV
# Should output: development
```

**Check 2**: Regenerate the token
```bash
npm run dev:generate-jwt
```

**Check 3**: Ensure user ID matches
```bash
# Token uses "dev-user-123" by default
grep ADMIN_USER_IDS .env
# Should include: ADMIN_USER_IDS=dev-user-123
```

### "Forbidden" Error

Your user ID is not in the admin list. Update `.env`:

```bash
ADMIN_USER_IDS=dev-user-123,another-user-id
```

Restart the server after changing `.env`.

### "Development public key not found" Error

Generate the keys:
```bash
npm run dev:generate-jwt
```

This will create the key pair automatically.

## Switching to Production

When deploying to production:

1. **Set environment to production**:
   ```bash
   NODE_ENV=production
   ```

2. **Configure Convex**:
   ```bash
   CONVEX_URL=https://your-actual-deployment.convex.cloud
   CONVEX_JWKS_URL=https://your-actual-deployment.convex.cloud/.well-known/jwks.json
   ```

3. **Update admin user IDs** with real Convex user IDs:
   ```bash
   ADMIN_USER_IDS=user_abc123,user_def456
   ```

4. Get JWT tokens from your Convex-authenticated mobile app:
   ```typescript
   const { getToken } = useAuth();
   const token = await getToken();
   ```

## Files Modified

- `scripts/generate-test-jwt.ts` - Token generation script
- `src/middleware/verifyJWT.ts` - Added development mode support
- `package.json` - Added `dev:generate-jwt` script
- `.gitignore` - Added `scripts/.dev-keys/` to prevent commits

## Next Steps

- For production setup, see `CONVEX_JWT_INTEGRATION.md`
- For API testing, see `API_TESTING.md`
- For deployment, see `README.md`
