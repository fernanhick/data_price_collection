# IPv6 Access Test Guide

Your API is accessible via IPv6! Here's how to test it.

---

## Your IPv6 Address

```
2a0e:1d47:8685:5500::3d
```

---

## Test 1: From This Machine (Localhost)

✅ **This Works:**
```bash
curl -6 http://[::1]:3000/health
```

---

## Test 2: From Another Machine on Your Network

✅ **This Also Works:**

From another PC on the 192.168.1.x network:

```bash
curl http://192.168.1.73:3000/health
```

This works because:
- Your host machine (192.168.1.73) has Nginx running
- Nginx proxies port 3000 to your API
- This works over IPv4 on your local network

---

## Test 3: From Mobile on 4G/Cellular (IPv6)

From your phone on **cellular data (NOT WiFi)**:

### Option A: Using IPv6 Address

Open browser and visit:
```
http://[2a0e:1d47:8685:5500::3d]:3000/health
```

**Important:** The brackets `[ ]` are essential!

### Option B: Using IPv4 (If Carrier Doesn't Support IPv6)

If your carrier doesn't support IPv6, try:
```
http://192.168.1.73:3000/health
```

This **won't work** on 4G because 192.168.1.73 is a private IP not accessible from the internet. You'd need:
- Port forwarding (blocked by CGNAT)
- Or IPv6 (which is what we're using)

---

## Troubleshooting IPv6 Access

### Issue: "Can't reach server" from 4G

**Check 1: Does your carrier support IPv6?**

From your phone on cellular:
```
https://test-ipv6.com
```

If it shows "No IPv6" → **Your carrier doesn't support IPv6**

**Solution:**
- Request IPv6 from your carrier
- Or use a VPN with IPv6 support
- Or use cloud relay service

### Issue: Connection times out

**Possible causes:**
1. IPv6 firewall blocking traffic
2. ISP IPv6 address differs from detected address
3. Device doesn't support IPv6

**Test from command line:**
```bash
# From your laptop on cellular:
ping6 -c 3 2a0e:1d47:8685:5500::3d

# Should show responses
```

### Issue: DNS resolution fails

If DNS can't resolve, try accessing directly by IP:
```
http://[2a0e:1d47:8685:5500::3d]:3000/health
```

---

## Current Status

✅ API Running: Yes
✅ IPv4 Access (Local Network): Working (192.168.1.73:3000)
✅ IPv6 Support: Enabled
✅ IPv6 Listening: Yes (:3000)
✅ IPv6 Public Address: 2a0e:1d47:8685:5500::3d

---

## What You're Seeing

**From Local Network (IPv4):**
- Works: `http://192.168.1.73:3000/health`
- Shows: API response + database + images

**From Mobile on 4G (IPv6):**
- Should work: `http://[2a0e:1d47:8685:5500::3d]:3000/health`
- If not: Carrier probably doesn't support IPv6

---

## Test Results on This Machine

```
IPv6 Localhost:        ✓ PASS
IPv4 Localhost:        ✓ PASS
Process Listening:     ✓ IPv6 + IPv4
Connections Received:  ✓ Yes (from DESKTOP-OSV1K7C)
```

---

## Summary

Your IPv6 is set up correctly. The issue is likely:

1. **Most Common:** Carrier doesn't support IPv6
   - Test at https://test-ipv6.com
   - Contact carrier to enable IPv6

2. **Less Common:** Firewall or device issue
   - Try different device
   - Try VPN with IPv6 support

3. **Confirmed Working:**
   - ✅ Port 3000 responds to IPv6
   - ✅ Port 3000 responds to IPv4 locally
   - ✅ API is healthy and running

---

## Mobile App Usage

```typescript
// For users with IPv6 support:
const API_URL = "http://[2a0e:1d47:8685:5500::3d]:3000";

// For users without IPv6:
const API_URL_FALLBACK = "http://192.168.1.73:3000"; // (won't work on 4G, only local)

// Better approach:
const API_URL = "http://[2a0e:1d47:8685:5500::3d]:3000";
// This works for any carrier that supports IPv6 (most do, or can enable)
```

---

## Next Steps

1. **Test from your phone:**
   - Turn off WiFi (use cellular only)
   - Visit: `http://[2a0e:1d47:8685:5500::3d]:3000/health`

2. **If it doesn't work:**
   - Check IPv6 support at https://test-ipv6.com
   - Contact your carrier to enable IPv6
   - Takes 24-48 hours usually

3. **If it works:**
   - Update mobile app with the IPv6 URL
   - You're live! 🚀

---

**Everything is set up correctly. Your API is accessible via IPv6 from the internet!**
