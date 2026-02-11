# IPv6 Troubleshooting Guide

Your public IPv6 address is confirmed: **`2a0e:1d47:8685:5500::3d`**

If you're unable to access it from your phone, here are the solutions:

---

## Issue: Can't Access from Phone (4G)

### Most Common Cause: Carrier Doesn't Support IPv6

Many cellular carriers don't support IPv6 natively. Check if yours does:

**Option 1: Test IPv6 Support**

From your phone on cellular data:
```
https://test-ipv6.com
```

If you get a failing score → Your carrier doesn't support IPv6

### Solutions if Carrier Doesn't Support IPv6

#### Solution A: Use VPN with IPv6 Support
1. Download VPN app that supports IPv6 (Mullvad, ProtonVPN)
2. Connect to VPN
3. Visit: `http://[2a0e:1d47:8685:5500::3d]:3000/health`

#### Solution B: Ask Carrier to Enable IPv6
Contact your carrier and request IPv6 activation:
- Most carriers will enable it
- Often free activation
- Takes 24-48 hours

#### Solution C: Use Different Network
- Borrow a phone from friend with different carrier
- Try WiFi from different ISP
- Test from home WiFi (different from your home ISP)

---

## Issue: "Connection Timed Out"

### Check 1: URL Format

**❌ WRONG:**
```
http://2a0e:1d47:8685:5500::3d:3000/health
http://2a0e1d4786855500::3d:3000/health
```

**✅ CORRECT:**
```
http://[2a0e:1d47:8685:5500::3d]:3000/health
```

The brackets `[ ]` are **essential** - they tell browsers to separate the IPv6 address from the port number.

### Check 2: WiFi is OFF

Your phone must be on **cellular data ONLY**:

1. Open Settings
2. Go to WiFi → Turn it OFF
3. Make sure mobile data is ON
4. Wait 5 seconds
5. Try the URL again

### Check 3: Using HTTP, Not HTTPS

**Make sure:** You're using `http://` NOT `https://`

```
✓ http://[2a0e:1d47:8685:5500::3d]:3000/health
✗ https://[2a0e:1d47:8685:5500::3d]:3000/health
```

---

## Issue: Page Says "Can't Reach Server"

### Likely Cause: ISP/Firewall Blocking

Even with IPv6, some ISPs have firewall rules. Try these:

#### Option 1: Different Port
If port 3000 is blocked, try:
```
http://[2a0e:1d47:8685:5500::3d]:8000/health
http://[2a0e:1d47:8685:5500::3d]:9000/health
```

To set up different port, update .env:
```bash
PORT=8000
npm start
```

Then access: `http://[2a0e:1d47:8685:5500::3d]:8000/health`

#### Option 2: Test from Desktop

From a laptop on the same cellular network:
```bash
curl http://[2a0e:1d47:8685:5500::3d]:3000/health
```

If this works, issue is phone-specific. If not, carrier doesn't support IPv6.

---

## Alternative: IPv4 Access for Mobile App

If IPv6 absolutely doesn't work, you have options:

### Option A: Use Domain with Fallback

1. Register domain (e.g., `api.example.com`)
2. Add both IPv4 and IPv6 DNS records:
   ```
   api.example.com A 88.97.222.2 (won't work due to CGNAT, skip this)
   api.example.com AAAA 2a0e:1d47:8685:5500::3d
   ```
3. Access: `http://api.example.com:3000/health`

### Option B: Use Cloud Relay (if needed)

If carrier truly doesn't support IPv6:
1. Deploy tiny API on cloud server with IPv4
2. Cloud server proxies to your home via IPv6
3. App talks to cloud server

Example cloud relay options:
- Heroku (free tier, limited)
- Railway.app
- Render.com
- Replit

Cost: Usually free tier or $5-10/month

### Option C: Tunneling Service

Use service like Ngrok or Cloudflare Tunnel:
```bash
# Cloudflare Tunnel (free)
npm install -g @cloudflare/wrangler
wrangler tunnel run http://localhost:3000
```

---

## Detailed Testing Procedure

### Step-by-Step IPv6 Test

1. **Confirm IPv6 Support:**
   - From phone on cellular: Visit `https://test-ipv6.com`
   - Look for "IPv6 Connectivity" section
   - Should see: "Yes, you have IPv6"

2. **Test DNS Resolution:**
   - If you have domain setup, ping it from phone
   - Should resolve to your IPv6 address

3. **Test Connectivity:**
   - First: `http://[2a0e:1d47:8685:5500::3d]:3000/health`
   - Check response time
   - If takes >10 seconds, likely connectivity issue

4. **Test API Response:**
   - If health check works, try:
   - `http://[2a0e:1d47:8685:5500::3d]:3000/api/skus/catalog?limit=1`

---

## Mobile App Integration

Once you confirm IPv6 works, update your app:

```typescript
// For phones with IPv6 support
const API_URL = "http://[2a0e:1d47:8685:5500::3d]:3000";

// For fallback (if IPv6 fails)
const API_URL_FALLBACK = "https://your-cloud-relay.com";

// Auto-detect and use best option
export const getAPIUrl = async () => {
  try {
    // Try IPv6 first
    const response = await fetch(`${API_URL}/health`, {
      timeout: 3000
    });
    if (response.ok) return API_URL;
  } catch (e) {}

  // Fall back to cloud relay if IPv6 fails
  return API_URL_FALLBACK;
};
```

---

## Quick Checklist

If IPv6 isn't working:

- [ ] Phone has IPv6 support (test-ipv6.com shows "Yes")
- [ ] WiFi is OFF (using cellular only)
- [ ] Using correct URL: `http://[ADDRESS]:3000`
- [ ] Using HTTP not HTTPS
- [ ] Not behind corporate firewall/proxy
- [ ] Carrier hasn't blocked port 3000
- [ ] Server API is running: `curl localhost:3000/health` works

If all above check out → **IPv6 should work!**

If none work → **Carrier likely doesn't support IPv6** → Use cloud relay or VPN

---

## Get Help

### Check Server Status

```bash
# SSH into server and run:
bash scripts/diagnose-ipv6.sh

# Check if API is running:
ps aux | grep node | grep dist

# Check API logs:
tail -f logs/app.log
```

### Test from Command Line

```bash
# From your laptop on cellular tethering:
curl -v http://[2a0e:1d47:8685:5500::3d]:3000/health

# With diagnostic info:
curl -v -6 http://[2a0e:1d47:8685:5500::3d]:3000/health
```

### Contact ISP

If nothing works, contact your carrier:
- "Does your network support IPv6?"
- "Can you enable IPv6 on my account?"
- "Is port 3000 blocked?"

Most carriers will enable IPv6 for free.

---

## Summary

| Issue | Solution |
|-------|----------|
| IPv6 not accessible | Check if carrier supports IPv6 at test-ipv6.com |
| Connection timeout | WiFi is ON - turn it OFF |
| Can't reach server | Try different port (8000, 9000) |
| URL not working | Check brackets: `[ADDRESS]:3000` |
| Need fallback | Setup cloud relay or domain |

---

**The API is live and working. The issue is likely with your carrier's IPv6 support, not your server.**

Feel free to tell me what error message you see and I'll help diagnose!
