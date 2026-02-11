# IPv6 Setup for CGNAT Bypass

Since you have CGNAT from your ISP, port forwarding won't work. However, your public IPv6 address bypasses this entirely!

## Your IPv6 Address

```
2a0e:1d47:8685:5500::3d
```

This address is **publicly accessible from the internet**. No port forwarding needed!

---

## Step 1: Update API to Listen on IPv6

Edit your `.env` file:

```bash
nano /home/gorhick/data_price_collection/.env
```

Add or update:
```env
# Listen on all interfaces (both IPv4 and IPv6)
HOST=::
PORT=3000
```

The `HOST=::` tells Node.js to listen on IPv6 (and IPv4 via dual-stack).

---

## Step 2: Restart API

Restart your API for changes to take effect:

```bash
# If using npm directly
pkill -f "node dist/src/index.js"
npm start

# Or if using PM2
pm2 restart sneaker-api
```

---

## Step 3: Test IPv6 Access

From your phone on 4G/cellular:

```bash
# Access via IPv6 (use brackets for IPv6)
curl http://[2a0e:1d47:8685:5500::3d]:3000/health

# Or in browser
http://[2a0e:1d47:8685:5500::3d]:3000/health
```

You should see:
```json
{"status":"healthy","timestamp":"...","environment":"production"}
```

---

## Step 4: Create IPv6 DNS Record (Optional but Recommended)

If you have a domain, add a DNS AAAA record:

```
Domain: api.yourdomain.com
Record Type: AAAA
Value: 2a0e:1d47:8685:5500::3d
```

Then access via: `http://api.yourdomain.com:3000/health`

---

## Step 5: Update Mobile App

### Option A: Direct IPv6 Address

```typescript
// React Native or JavaScript
const API_URL = "http://[2a0e:1d47:8685:5500::3d]:3000";

// Make API calls
const response = await fetch(`${API_URL}/api/skus/catalog`);
const data = await response.json();
```

**Note:** The brackets `[` and `]` are **required** in URLs to distinguish from port numbers.

### Option B: Using Domain (if you set up DNS)

```typescript
const API_URL = "http://api.yourdomain.com:3000";

const response = await fetch(`${API_URL}/api/skus/catalog`);
```

### Option C: Auto-Detect Network

```typescript
const getAPIUrl = async () => {
  // Try local first (faster)
  try {
    const response = await fetch('http://192.168.1.73:3000/health', {
      timeout: 2000
    });
    if (response.ok) return "http://192.168.1.73:3000";
  } catch (e) {}

  // Fallback to IPv6 (from anywhere)
  return "http://[2a0e:1d47:8685:5500::3d]:3000";
};

export const API_URL = await getAPIUrl();
```

---

## Step 6: Optional - Add IPv6 to Your Documentation

Update your project notes:
- **Public IPv6**: `2a0e:1d47:8685:5500::3d`
- **Access URL**: `http://[2a0e:1d47:8685:5500::3d]:3000`
- **Bypass**: CGNAT with direct IPv6 connectivity

---

## Accessing from Different Locations

Your API is now accessible from **anywhere in the world** via IPv6:

### From Desktop (4G/Cellular)
```bash
curl http://[2a0e:1d47:8685:5500::3d]:3000/health
```

### From Mobile App
```javascript
fetch("http://[2a0e:1d47:8685:5500::3d]:3000/api/skus/catalog")
```

### From Browser
```
http://[2a0e:1d47:8685:5500::3d]:3000/health
```

### From Public Server
```bash
# Access your API from any cloud server
curl http://[2a0e:1d47:8685:5500::3d]:3000/api/skus/catalog
```

---

## Advantages of IPv6

✅ **No Port Forwarding Needed** - Direct access
✅ **No NAT/CGNAT Issues** - Transparent connectivity
✅ **Global Routing** - Accessible from anywhere
✅ **Future-Proof** - IPv6 is the internet standard
✅ **Same Port 3000** - ISP doesn't block it

---

## How It Works

```
Internet (IPv6)
    ↓
Your IPv6 Address: 2a0e:1d47:8685:5500::3d
    ↓
Port 3000 (API Server)
    ↓
Request reaches your API directly
No ISP NAT layer blocking!
```

---

## Security Considerations

Since your API is now publicly accessible via IPv6:

### 1. JWT Authentication (Recommended)

Require authentication tokens for API access:

```bash
# Generate JWT token for testing
npm run dev:generate-jwt

# Add Bearer token to requests
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://[2a0e:1d47:8685:5500::3d]:3000/api/skus/catalog
```

### 2. Rate Limiting

Your API should already have rate limiting. Check:

```bash
# View current rate limit config
cat /home/gorhick/data_price_collection/.env | grep RATE
```

### 3. CORS Configuration

Update CORS to allow your mobile app domain:

```bash
# In .env
CORS_ORIGIN=*
# OR be specific:
CORS_ORIGIN=http://yourmobileapp.com
```

### 4. HTTPS/SSL (Recommended for Production)

Even with IPv6, consider adding SSL:

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365

# Update API to use HTTPS
# Then access via:
https://[2a0e:1d47:8685:5500::3d]:3000/health
```

---

## Monitoring IPv6 Access

Check your logs for connections:

```bash
# View recent requests
tail -f /home/gorhick/data_price_collection/logs/app.log | grep "IPv6\|::"

# Or check via curl with verbose
curl -6 -v http://[2a0e:1d47:8685:5500::3d]:3000/health
```

---

## Troubleshooting

### Issue: "Connection refused" over IPv6

**Check 1:** Is API listening on IPv6?
```bash
netstat -tuln | grep ":3000"
# Should show both IPv4 and IPv6 entries
```

**Check 2:** Check .env configuration
```bash
cat .env | grep HOST
# Should show: HOST=::
```

**Check 3:** Restart API
```bash
pm2 restart sneaker-api
# or
pkill -f "node dist/src/index.js"
npm start
```

### Issue: Can access locally but not from 4G

**Check:** Is IPv6 enabled on your network?
```bash
# Test IPv6 connectivity
ping6 2001:4860:4860::8888  # Google's IPv6 DNS

# Or use IPv6 test
curl -6 https://www.ipv6-test.com/
```

### Issue: Mobile app can't connect

**Check:** Are you using brackets in the URL?
```
❌ WRONG: http://2a0e:1d47:8685:5500::3d:3000
✅ RIGHT: http://[2a0e:1d47:8685:5500::3d]:3000
```

The brackets `[]` are essential for IPv6 in URLs!

---

## Quick Reference

| Item | Value |
|------|-------|
| IPv6 Address | `2a0e:1d47:8685:5500::3d` |
| Port | `3000` |
| API URL | `http://[2a0e:1d47:8685:5500::3d]:3000` |
| Health Check | `http://[2a0e:1d47:8685:5500::3d]:3000/health` |
| Environment Config | `HOST=::` in .env |
| NAT Type | CGNAT (bypassed with IPv6) |
| Port Forwarding | Not needed! |

---

## Setup Checklist

- [ ] Update `.env` with `HOST=::`
- [ ] Restart API
- [ ] Test from 4G/cellular
- [ ] Confirm `{"status":"healthy"}` response
- [ ] Update mobile app with IPv6 URL
- [ ] Add to project documentation
- [ ] Set up SSL (optional)
- [ ] Configure JWT auth (optional)
- [ ] Test from external network

---

## Summary

You're all set! Your API is now accessible via IPv6 from anywhere in the world:

```
http://[2a0e:1d47:8685:5500::3d]:3000
```

No port forwarding needed. No ISP blocking your ports. Pure IPv6 connectivity! 🚀

---

If you have questions or issues, see the troubleshooting section above or check your API logs:

```bash
tail -f /home/gorhick/data_price_collection/logs/app.log
```
