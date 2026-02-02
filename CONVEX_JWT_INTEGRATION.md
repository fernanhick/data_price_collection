# Convex JWT Integration with VPS Backend

Complete guide to using Convex authentication tokens to secure your price API.

---

## 🎯 Perfect Architecture!

You already have:
- ✅ Expo mobile app
- ✅ Convex for authentication
- ✅ User accounts with JWT tokens
- ✅ VPS for price API

**Solution**: Use Convex JWT tokens to authenticate requests to your VPS! 🎉

---

## 🏗️ Complete Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   EXPO MOBILE APP                       │
│                  (Built with Convex)                    │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ↓                                 ↓
┌─────────────────────┐        ┌──────────────────────┐
│   CONVEX BACKEND    │        │   VPS BACKEND        │
│  (User Auth + Data) │        │  (Price Data API)    │
│                     │        │                      │
│ - User accounts     │        │ - Scrapes prices     │
│ - Issue JWT         │        │ - Validates JWT      │
│ - User data         │        │ - Returns prices     │
│ - Collections       │        │ - CORS enabled       │
└─────────────────────┘        └──────────────────────┘
        ↑                                 ↑
        └─────────────────┬──────────────┘
                          │
                    User authenticated
                    Uses JWT for both
```

---

## 🔐 Complete Flow

### Step 1: User Login in Expo App

```typescript
// app/(auth)/login.tsx
import { useAuth } from "@convex-dev/react";

export default function LoginScreen() {
  const { signInGoogle } = useAuth(); // or signInPassword

  return (
    <Button
      onPress={() => signInGoogle()}
      title="Login with Google"
    />
  );
}
```

**After login**: User has Convex JWT token ✅

---

### Step 2: Get JWT from Convex in Expo

```typescript
// hooks/useConvexJWT.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@convex-dev/react";

export function useConvexJWT() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const getJWTToken = async (): Promise<string | null> => {
    if (!isSignedIn || !isLoaded) return null;

    try {
      // Get JWT from Convex
      const token = await getToken();
      return token;
    } catch (err) {
      console.error("Failed to get token:", err);
      return null;
    }
  };

  return { getJWTToken };
}
```

---

### Step 3: Call VPS API with JWT

```typescript
// api/priceAPI.ts
import { useConvexJWT } from "@/hooks/useConvexJWT";

const VPS_API_BASE = "https://api.yourdomain.com";

export function usePriceAPI() {
  const { getJWTToken } = useConvexJWT();

  const getPrice = async (sku_code: string) => {
    // Get JWT token from Convex
    const token = await getJWTToken();
    if (!token) throw new Error("Not authenticated");

    // Call VPS API with JWT
    const response = await fetch(
      `${VPS_API_BASE}/api/prices/${sku_code}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.status === 401) {
      throw new Error("Unauthorized - JWT invalid");
    }

    return response.json();
  };

  const searchSneakers = async (query: string) => {
    const token = await getJWTToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(
      `${VPS_API_BASE}/api/skus?search=${encodeURIComponent(query)}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
        }
      }
    );

    return response.json();
  };

  return { getPrice, searchSneakers };
}
```

---

### Step 4: Use in React Component

```typescript
// screens/PriceScreen.tsx
import { usePriceAPI } from "@/api/priceAPI";

export default function PriceScreen() {
  const { getPrice } = usePriceAPI();
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPrice = async (sku_code: string) => {
    setLoading(true);
    try {
      const data = await getPrice(sku_code);
      setPrice(data);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Button
        onPress={() => fetchPrice("nike-jordan-1-bred")}
        title="Get Price"
      />
      {price && (
        <Text>
          {price.brand} {price.model}: ${price.ecmv}
          (Confidence: {price.confidence})
        </Text>
      )}
    </View>
  );
}
```

---

## 🔑 Validate JWT on VPS Backend

### Step 1: Get Convex Public Key

```typescript
// File: src/utils/convexJWT.ts

import fetch from "node-fetch";

let convexPublicKey: string | null = null;

export async function getConvexPublicKey(): Promise<string> {
  if (convexPublicKey) return convexPublicKey;

  // Fetch Convex public key
  // (Replace with your Convex deployment URL)
  const response = await fetch(
    "https://your-convex-deployment.convex.cloud/.well-known/jwks.json"
  );

  const jwks = await response.json();
  const key = jwks.keys[0]; // Get first key

  // Convert JWK to PEM format
  convexPublicKey = convertJWKToPEM(key);
  return convexPublicKey;
}

function convertJWKToPEM(jwk: any): string {
  // Convert JSON Web Key to PEM format
  // Use 'jwk-to-pem' library
  const pem = require("jwk-to-pem")(jwk);
  return pem;
}
```

### Step 2: Verify JWT Middleware

```typescript
// File: src/middleware/verifyConvexJWT.ts

import jwt from "jsonwebtoken";
import { getConvexPublicKey } from "@/utils/convexJWT";

export async function verifyConvexJWT(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // Get Convex public key
    const publicKey = await getConvexPublicKey();

    // Verify token signature
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://your-convex-url.convex.cloud",
    });

    // Attach user info to request
    req.user = {
      userId: decoded.sub,
      tokenId: decoded.tokenId,
      issuedAt: decoded.iat,
    };

    console.log(`✅ JWT verified for user: ${decoded.sub}`);
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

### Step 3: Apply Middleware to Routes

```typescript
// File: src/routes/prices.ts

import { verifyConvexJWT } from "@/middleware/verifyConvexJWT";

// Apply JWT verification to all price routes
router.use(verifyConvexJWT);

// Get price for sneaker
router.get("/api/prices/:sku_code", async (req, res) => {
  const { sku_code } = req.params;
  const userId = req.user.userId; // From JWT

  console.log(`User ${userId} requested: ${sku_code}`);

  // Fetch price from database
  const price = await db.query(
    `SELECT * FROM price_history
     WHERE sku_code = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [sku_code]
  );

  if (!price.rows.length) {
    return res.status(404).json({ error: "Sneaker not found" });
  }

  res.json({
    sku_code: price.rows[0].sku_code,
    ecmv: price.rows[0].ecmv,
    confidence: price.rows[0].confidence,
    last_updated: price.rows[0].timestamp,
    user_id: userId, // Track who requested it
  });
});

// Search sneakers
router.get("/api/skus", verifyConvexJWT, async (req, res) => {
  const { search } = req.query;
  const userId = req.user.userId;

  console.log(`User ${userId} searched: ${search}`);

  const results = await db.query(
    `SELECT * FROM skus
     WHERE sku_code ILIKE $1 OR model ILIKE $1
     LIMIT 20`,
    [`%${search}%`]
  );

  res.json(results.rows);
});

// Health check (no auth required)
router.get("/api/health", async (req, res) => {
  res.json({ status: "ok" });
});
```

---

## 📦 Required Dependencies

### Expo/React Native Side

```bash
npm install @convex-dev/react @clerk/clerk-react
# or use Convex's built-in auth
```

### VPS Backend Side

```bash
npm install jsonwebtoken jwk-to-pem express cors dotenv
```

### package.json

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "jwk-to-pem": "^2.1.0",
    "cors": "^2.8.5"
  }
}
```

---

## 🔐 Full Backend Setup

```typescript
// File: src/index.ts

import express from "express";
import cors from "cors";
import { verifyConvexJWT } from "./middleware/verifyConvexJWT";
import priceRoutes from "./routes/prices";
import healthRoutes from "./routes/health";

const app = express();

// Middleware
app.use(cors({
  origin: ["https://your-mobile-app.com", "http://localhost:19000"],
  credentials: true
}));
app.use(express.json());

// Health check (no auth)
app.use(healthRoutes);

// Protected routes (require JWT)
app.use(verifyConvexJWT);
app.use(priceRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

---

## 📊 Architecture Benefits

### Before (API Keys)
```
Mobile App (no auth)
  ↓
VPS API (validate API key)
  ↓
Database query (1 per request)
```

### After (Convex JWT)
```
Mobile App (authenticated via Convex)
  ↓
Get JWT from Convex (already have it!)
  ↓
VPS API (verify JWT signature, no DB!)
  ↓
Return prices
```

**Result**:
- ✅ User authentication already exists
- ✅ JWT provided by Convex
- ✅ VPS only verifies signature (no DB lookup)
- ✅ Scales infinitely
- ✅ Can track which user requested what

---

## 🎯 Key Advantages

### 1. User Context
```typescript
// Know exactly which user is requesting
const userId = req.user.userId;
console.log(`User ${userId} requested price`);

// Can add per-user features later:
// - User watchlists
// - Personalized prices
// - User analytics
```

### 2. Stateless Authentication
```
No database query for JWT verification
JWT signature verification: ~1ms
Scales to unlimited users ✅
```

### 3. Integrated with Convex
```
Users authenticate in app via Convex
Same token works for:
- Convex queries
- VPS API calls
- Future services
```

### 4. Better Security
```
Convex manages token generation
Convex manages token rotation
VPS only verifies (doesn't generate)
Convex public key can be cached
```

---

## 🔄 Complete User Flow

```
1. User opens Expo app
   └─ Not authenticated

2. User taps "Login"
   └─ Redirected to Convex auth

3. User logs in with Google/Password
   └─ Convex issues JWT token

4. User navigates to price screen
   └─ App has JWT token ✅

5. User searches "Jordan 1"
   ├─ Expo gets JWT from Convex
   ├─ Calls: GET /api/skus?search=jordan
   ├─ Header: Authorization: Bearer {JWT}
   ├─ VPS verifies JWT signature
   ├─ Returns matching sneakers
   └─ ✅ User sees results

6. User taps on sneaker
   ├─ Calls: GET /api/prices/nike-jordan-1-bred
   ├─ VPS verifies JWT
   ├─ Returns price data
   └─ ✅ User sees: "Jordan 1 Bred - $152.30"

7. User logs out
   ├─ JWT token destroyed in Convex
   ├─ VPS rejects any future requests
   └─ ✅ User is logged out
```

---

## 🛡️ Security Considerations

### Verify Convex Public Key

```typescript
// Cache the public key to avoid repeated fetches
const CACHE_TIME = 24 * 60 * 60 * 1000; // 24 hours
let cachedKey = null;
let cacheTime = 0;

export async function getConvexPublicKey(): Promise<string> {
  const now = Date.now();

  if (cachedKey && (now - cacheTime) < CACHE_TIME) {
    return cachedKey;
  }

  // Fetch fresh key
  const response = await fetch(
    "https://your-convex-url.convex.cloud/.well-known/jwks.json"
  );
  const jwks = await response.json();
  cachedKey = convertJWKToPEM(jwks.keys[0]);
  cacheTime = now;

  return cachedKey;
}
```

### Set Correct Issuer

```typescript
// Verify the token issuer matches Convex
const decoded = jwt.verify(token, publicKey, {
  algorithms: ["RS256"],
  issuer: "https://your-convex-deployment.convex.cloud",
  audience: "your-app-name",
});
```

### Handle Token Expiry

```typescript
// Convex tokens expire - handle gracefully
try {
  jwt.verify(token, publicKey);
} catch (err) {
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Token expired",
      code: "TOKEN_EXPIRED"
    });
  }
  // App will refresh token and retry
}
```

---

## 📝 Environment Variables

```bash
# .env (VPS backend)

# Convex configuration
CONVEX_URL=https://your-convex-url.convex.cloud
CONVEX_DEPLOYMENT=your-deployment-name

# JWT verification
JWT_ALGORITHM=RS256

# CORS
CORS_ORIGINS=https://your-mobile-app.com,http://localhost:19000

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/prices
REDIS_URL=redis://redis:6379

# Server
PORT=3000
NODE_ENV=production
```

---

## 🚀 Deployment

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Docker Compose Update

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CONVEX_URL=${CONVEX_URL}
      - DATABASE_URL=postgresql://user:pass@postgres:5432/prices
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: always

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: prices
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    restart: always

volumes:
  postgres_data:
```

---

## ✅ Testing

### Test JWT Verification

```bash
# Get a JWT from Convex
# (Copy from your app's local storage or debug)

# Test the endpoint
curl -H "Authorization: Bearer {JWT_HERE}" \
  https://api.yourdomain.com/api/prices/nike-jordan-1-bred
```

### Expected Response

```json
{
  "sku_code": "nike-jordan-1-retro-bred-2023",
  "ecmv": 152.30,
  "confidence": "High",
  "last_updated": "2024-01-15T14:00:00Z",
  "user_id": "user_123abc"
}
```

---

## 📊 Comparison: API Key vs Convex JWT

| Aspect | API Key | Convex JWT |
|--------|---------|------------|
| **Your situation** | ❌ Not ideal | ✅ Perfect! |
| **User context** | None | ✅ Know which user |
| **Token management** | Manual | ✅ Convex handles |
| **Expiry handling** | None | ✅ Built-in |
| **Per-request DB lookup** | Yes | No ✅ |
| **Implementation** | Simple | Moderate ✅ |
| **Scalability** | Good | Excellent ✅ |
| **Future features** | Difficult | Easy ✅ |

---

## 🎯 Recommendation

**YES - Use Convex JWT for VPS authentication!** ✅✅✅

**Why**:
1. ✅ You already have Convex auth
2. ✅ JWT tokens already exist
3. ✅ No separate API key system needed
4. ✅ Perfect for scalability
5. ✅ Can track user requests
6. ✅ Simpler than managing API keys

**Implementation**:
1. Get JWT from Convex in Expo
2. Send JWT to VPS with requests
3. VPS verifies JWT signature
4. Return price data

**Timeline**: 4-6 hours to implement ✅

---

## 📁 Files to Update

Update your documentation:

1. Remove API Key sections
2. Add Convex JWT sections
3. Update PLAN.md with this approach
4. Update USER_TASKS.md to remove API key generation

This is actually the **best possible architecture** for your system! 🚀
