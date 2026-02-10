# Next Steps: Internet Exposure for Sneaker API

## Current Status ✅

Your system is **fully operational**:
- ✅ API running on port 3000 (healthy)
- ✅ Database: 1,116 SKUs + 1,082 cached images (96% coverage)
- ✅ Image storage: 32 MB total, 1,083 files
- ✅ Public static IP: **88.97.222.2**
- ✅ VM accessible locally: **192.168.1.73:3000**

---

## What You Need to Do Now

To make your API accessible from the internet at `http://88.97.222.2:3000`, you need to configure port forwarding on your home router. But first, you need to know your **HOST MACHINE's local IP address**.

### Find Your Host Machine IP (Critical!)

Your VM (192.168.1.73) is running inside a host machine. The host machine also has a local IP on your home network (192.168.1.x).

**From your HOST computer (the one running the VM):**

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" - should be something like `192.168.1.10`

**Mac:**
```bash
ifconfig | grep "inet " | grep -v "127.0.0.1"
```

**Linux:**
```bash
ip addr show | grep "inet " | grep -v "127.0.0.1"
```

**Alternative (Any OS):**
1. Go to: `http://192.168.1.1` (your router)
2. Login with admin/admin
3. Look for "Connected Devices" or "DHCP Clients"
4. Find your host computer name in the list - note its IP

---

## Quick Example Setup

Let's say you discover your HOST machine IP is `192.168.1.42`:

### Step 1: Access Router Admin

```
URL: http://192.168.1.1
Username: admin
Password: admin (or check your router)
```

### Step 2: Add Port Forwarding Rule

In your router settings, create this rule:

| Setting | Value |
|---------|-------|
| Service Name | SneakerAPI |
| External Port | 3000 |
| Internal Port | 3000 |
| Internal IP | **192.168.1.42** (your host machine IP) |
| Protocol | TCP |
| Status | Enabled |

### Step 3: Router Restarts

Wait 2-3 minutes for router to restart and apply changes.

### Step 4: Test from 4G

**Most Important:** Turn OFF your home WiFi and use cellular data:

```bash
# On your phone, on 4G/LTE:
http://88.97.222.2:3000/health
```

Should see: `{"status":"healthy",...}`

---

## Detailed Instructions

For **router-specific instructions** with screenshots and video guides, see:

📖 **[VM-PORT-FORWARDING-SETUP.md](./VM-PORT-FORWARDING-SETUP.md)**

This document has:
- Step-by-step instructions for NETGEAR, TP-Link, ASUS, D-Link, Linksys routers
- Detailed troubleshooting section
- Network diagrams
- Testing procedures
- Common issues and fixes

---

## After Port Forwarding is Working

Once `http://88.97.222.2:3000/health` works from 4G:

### 1. Update Mobile App

```typescript
// In your mobile app code:
const API_URL = "http://88.97.222.2:3000";

// Example API call:
const response = await fetch(`${API_URL}/api/skus/catalog`);
const data = await response.json();
```

### 2. Keep API Running 24/7

Option A: **Using PM2** (recommended)
```bash
pm2 start "npm start" --name sneaker-api
pm2 startup
pm2 save
```

Option B: **Using Systemd Service**
```bash
sudo tee /etc/systemd/system/sneaker-api.service > /dev/null <<EOF
[Unit]
Description=Sneaker Price API
After=network.target

[Service]
Type=simple
User=gorhick
WorkingDirectory=/home/gorhick/data_price_collection
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable sneaker-api
sudo systemctl start sneaker-api
```

### 3. Monitor API Health

```bash
# Check if still running
curl http://88.97.222.2:3000/health

# View logs
pm2 logs sneaker-api
# OR
sudo journalctl -u sneaker-api -f
```

---

## Verification Checklist

Before you start, run this verification:

```bash
bash scripts/verify-setup.sh
```

This confirms:
- ✅ Database connected
- ✅ API running
- ✅ Images cached
- ✅ Port 3000 listening

---

## Architecture Diagram

Your setup once port forwarding is configured:

```
                    INTERNET
                        ↓
            ISP Router: 88.97.222.2
                        ↓
        (Port Forwarding Rule: 3000 → 192.168.1.42:3000)
                        ↓
         ┌─────────────────────────┐
         │   YOUR HOST COMPUTER    │
         │    192.168.1.42         │
         │   (Runs the VM)         │
         │                         │
         │  ┌───────────────────┐  │
         │  │      VM           │  │
         │  │   192.168.1.73    │  │
         │  │   (Port 3000)     │  │
         │  │   ↓               │  │
         │  │  API Server       │  │
         │  │  Healthy ✅       │  │
         │  └───────────────────┘  │
         └─────────────────────────┘
                        ↓
         Mobile App (anywhere in world)
         GET http://88.97.222.2:3000/api/skus/catalog
```

---

## Common Issues & Solutions

### "Connection refused" from 4G?
- Router port forwarding not configured correctly
- Check: Is the rule pointing to your HOST machine IP (192.168.1.42)?
- Try: Restart router (unplug 30 seconds, plug back in)

### "Works on WiFi, not from 4G?"
- ❌ You're testing from WiFi when you should test from 4G
- ✅ TURN OFF WiFi and use cellular data to test

### "Port might be blocked by ISP?"
- Try alternative port: 5000, 8000, 9000, 9999
- Update router rule to use different port
- Update API to run on different port

### Still can't find host machine IP?
- Look at router's connected devices list
- Ask in router logs which device is accessing VM
- Check what IP can reach VM at 192.168.1.73

---

## Next: Mobile App Integration

Once you confirm internet access is working, you'll want to:

1. **Update your mobile app** to use the public IP
2. **Add SSL/TLS** (optional, for production)
3. **Monitor uptime** with health checks
4. **Set up backups** for database and images

See other documentation files for these topics:
- `INTERNET-SETUP.md` - All internet exposure options
- `MIGRATION-GUIDE.md` - If moving to different server
- `VPS-SPECS.md` - If scaling beyond current setup

---

## Quick Reference

| Item | Value |
|------|-------|
| API Health | http://88.97.222.2:3000/health |
| API Catalog | http://88.97.222.2:3000/api/skus/catalog |
| VM Local IP | 192.168.1.73 |
| Host Machine IP | 192.168.1.?? (You need to find this!) |
| Router Admin | http://192.168.1.1 |
| Public IP | 88.97.222.2 |
| Test URL | http://88.97.222.2:3000/health (from 4G) |

---

## Summary

1. ✅ **System is ready** (API running, database connected, images cached)
2. 🔧 **Find your HOST machine IP** (192.168.1.??)
3. 🔌 **Configure router port forwarding** (3000 → [HOST_IP]:3000)
4. 📱 **Test from cellular** (turn off WiFi, use 4G)
5. 🚀 **Update mobile app** and you're live!

**Start with:** Find your host machine IP, then follow VM-PORT-FORWARDING-SETUP.md

Good luck! 🎉
