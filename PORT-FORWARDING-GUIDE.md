# Complete Port Forwarding Guide

Detailed explanation and step-by-step instructions for exposing your home server to the internet.

---

## 🎯 What Is Port Forwarding?

### The Problem
```
Your Home Machine (192.168.1.73)
    ↑
    | Data on port 3000
    |
Your Router (88.97.222.2)
    ↑
    ❌ WHERE DOES THE DATA GO?
    |
Internet (88.97.222.2:3000)
```

Without port forwarding, internet traffic to your router doesn't know where to send it!

### The Solution: Port Forwarding
```
Internet traffic arrives at: 88.97.222.2:3000
    ↓
Router receives it
    ↓
Router sees: "Port 3000 traffic → send to 192.168.1.73:3000"
    ↓
Your Home Machine (192.168.1.73:3000) receives it
    ↓
Your API processes request
    ↓
Response sent back through router to internet
```

---

## 📊 Visual Explanation

### Without Port Forwarding (Blocked)
```
┌─────────────────────────────────────────┐
│          INTERNET                        │
│    Someone visiting 88.97.222.2:3000   │
└────────────────┬────────────────────────┘
                 │
                 ↓ (Where does this go?)
         ┌───────────────┐
         │    ROUTER     │
         │ 88.97.222.2   │
         └───────┬───────┘
                 │
      ❌ BLOCKED - Router doesn't know!
                 │
         ┌───────┴─────────┐
         │                 │
    Your Computer      Other Devices
    192.168.1.73       192.168.1.50
    (Port 3000)          (WiFi)
```

### With Port Forwarding (Connected)
```
┌─────────────────────────────────────────┐
│          INTERNET                        │
│    Someone visiting 88.97.222.2:3000   │
└────────────────┬────────────────────────┘
                 │
                 ↓ Port 3000 traffic
         ┌───────────────────────┐
         │    ROUTER             │
         │ 88.97.222.2           │
         │ Port Forwarding:      │
         │ 3000 → 192.168.1.73:3000
         └───────┬───────────────┘
                 │
                 ↓ Forwards to 192.168.1.73
         ┌───────────────┐
         │ Your Computer │ ✅ API receives request!
         │ 192.168.1.73  │
         │ Port 3000     │
         └───────────────┘
```

---

## 🔢 Your Specific Setup

### Your Network Details
```
Internet IP (Static):    88.97.222.2  ← People see this
Router IP:               192.168.1.1  ← You access router via this
Your Computer IP:        192.168.1.73 ← Where your app runs
Your App Port:           3000         ← What your app listens on
```

### Port Forwarding Rule
```
External Port:  3000
  ↓ (Routes to)
Internal IP:    192.168.1.73
Internal Port:  3000
Protocol:       TCP
Status:         Enabled
```

### Internet Access Path
```
Internet: 88.97.222.2:3000
    ↓
Router Port Forward: 3000 → 192.168.1.73:3000
    ↓
Your Computer: 192.168.1.73:3000 (Your API)
    ↓
Response sent back: 88.97.222.2:3000
```

---

## 🔐 Important: Find Your Internal IP

### Windows
```powershell
# Open Command Prompt
ipconfig

# Look for:
IPv4 Address . . . . . . . . . . . : 192.168.1.73

# That's your internal IP
```

### Mac/Linux
```bash
# Terminal
ifconfig | grep "inet "

# Look for 192.168.x.x (NOT 127.0.0.1)
```

### Or Use Easy Method
```bash
# On your computer
# Windows: ping %COMPUTERNAME%
# Mac/Linux: hostname -I

# Or just remember: 192.168.1.73 from earlier
```

---

## 📍 Finding Your Router's Admin Page

### Step 1: Find Router IP

**Windows:**
```powershell
ipconfig
# Look for "Default Gateway"
# Usually: 192.168.1.1 or 192.168.0.1
```

**Mac/Linux:**
```bash
route -n | grep "default"
# Usually: 192.168.1.1
```

### Step 2: Access Router

Open browser:
```
http://192.168.1.1
```

Or try these if above doesn't work:
```
http://192.168.0.1
http://192.168.1.254
http://192.168.100.1
http://10.0.0.1
```

### Step 3: Login

**Default Credentials (Check your router or back sticker):**
```
Username: admin
Password: admin

OR

Username: admin
Password: password

OR

Username: (blank)
Password: admin
```

If default doesn't work:
- Check router sticker on bottom/back
- Check router manual
- Check ISP documentation

---

## 🎮 Router-Specific Instructions

### NETGEAR Router

**1. Open http://192.168.1.1**

**2. Login** (admin/password)

**3. Find "Advanced Settings" or "Advanced"**

**4. Look for "Port Forwarding" or "Virtual Server"**

**5. Click "Add Custom Service" or "Add Service"**

**6. Fill in:**
```
Service Name: SneakerAPI
External Port: 3000
Internal Port: 3000
Internal IP: 192.168.1.73
Protocol: TCP
```

**7. Click "Apply"**

**8. Restart router (optional)**

---

### TP-Link Router

**1. Open http://192.168.0.1 or http://tplinkwifi.net**

**2. Login** (admin/admin)

**3. Go to "Advanced Settings"**

**4. Click "NAT Forwarding" → "Port Forwarding"**

**5. Click "Add New"**

**6. Fill in:**
```
Service Port: 3000
Internal Port: 3000
Internal IP Address: 192.168.1.73
Protocol: TCP
Status: Enabled
```

**7. Click "Save"**

---

### ASUS Router

**1. Open http://192.168.1.1 or http://router.asus.com**

**2. Login** (admin/admin)

**3. Go to "Advanced Settings"**

**4. Click "NAT" → "Port Forwarding"**

**5. Fill in:**
```
Port Range: 3000
Local IP: 192.168.1.73
Local Port: 3000
Protocol: TCP
```

**6. Click "Apply"**

---

### D-Link Router

**1. Open http://192.168.0.1**

**2. Login** (admin/admin)

**3. Go to "Advanced" tab**

**4. Click "Port Forwarding"**

**5. Click "Add"**

**6. Fill in:**
```
Private IP: 192.168.1.73
Private Port: 3000
Public Port: 3000
Protocol: TCP
Enable: ✓
```

**7. Click "Apply"**

---

### Linksys/Cisco Router

**1. Open https://192.168.1.1 or myrouter.local**

**2. Login** (admin/admin or check sticker)

**3. Find "Advanced" settings**

**4. Look for "Port Forwarding" or "Port Range Forwarding"**

**5. Fill in:**
```
Application Name: SneakerAPI
External Port Start: 3000
External Port End: 3000
Protocol: TCP/UDP
To IP Address: 192.168.1.73
To Port: 3000
Enable: ✓
```

**6. Click "Save"**

---

### Can't Find Port Forwarding?

**Search for these menu items:**
- "Port Forwarding"
- "Virtual Server"
- "NAT"
- "Port Mapping"
- "Port Range Forwarding"
- "Advanced Settings" → "Network"

**Or check router manual:**
```bash
# Google: "[Your Router Model] port forwarding"
# Example: "NETGEAR WNDR3700 port forwarding"
```

---

## ⚙️ Settings Reference

### Basic Port Forward (Your Setup)
```
External Port:   3000
↓ Routes to
Internal IP:     192.168.1.73
Internal Port:   3000
Protocol:        TCP
Status:          Enabled
```

### For Images (Optional 2nd Port Forward)
```
External Port:   8888
↓ Routes to
Internal IP:     192.168.1.73
Internal Port:   8888
Protocol:        TCP
Status:          Enabled
```

### Important: Why These Settings?

| Setting | Your Value | Why |
|---------|-----------|-----|
| External Port | 3000 | Internet uses this port |
| Internal IP | 192.168.1.73 | Your computer's local IP |
| Internal Port | 3000 | Your app listens on this |
| Protocol | TCP | HTTP uses TCP |
| Status | Enabled | Must be turned on |

---

## ✅ After Configuring Port Forward

### Step 1: Verify Locally

```bash
# On your computer
curl http://localhost:3000/health

# Should work
{"status":"healthy"...}
```

### Step 2: Verify From Router IP

```bash
# From another device on same WiFi
curl http://192.168.1.73:3000/health

# Should work
```

### Step 3: Verify From Internet

**Use your phone on 4G (NOT WiFi):**

```bash
# Turn off WiFi on phone
# Use cellular data

# Test
curl http://88.97.222.2:3000/health

# Should work!
```

### Step 4: Verify Specific Endpoints

```bash
# API catalog
http://88.97.222.2:3000/api/skus/catalog

# Health check
http://88.97.222.2:3000/health

# Images
http://88.97.222.2:8888/sneakers/555088-001.webp
```

---

## 🔍 How to Verify Port Forwarding is Working

### Method 1: Online Port Check (Easiest)

**Visit:** https://www.canyouseeme.org/

```
Enter Port: 3000
Click "Check Port"

If successful: "Success! I can see your service..."
If failed: "I could not see your service on port 3000"
```

### Method 2: From Your Phone

**On 4G (not WiFi):**
```bash
# Open browser
http://88.97.222.2:3000/health

# Should show your API response
```

### Method 3: Command Line Check

**From outside network:**
```bash
# Check if port responds
telnet 88.97.222.2 3000

# If port opens: "Connected"
# If times out: "Connection refused"
```

**Or using curl:**
```bash
curl -v http://88.97.222.2:3000/health
# Look for "Connected to 88.97.222.2"
```

---

## 🐛 Troubleshooting

### Problem: "I can't access from outside"

**Check 1: API Running?**
```bash
# On your computer
curl http://localhost:3000/health
# Must work locally first
```

**Check 2: Port Forward Configured?**
```bash
# Open router admin page
http://192.168.1.1

# Verify port 3000 forwarding exists
# Verify it's enabled
# Verify internal IP is 192.168.1.73
```

**Check 3: Router Restarted?**
```bash
# Some routers need restart after config change
# Power off router for 30 seconds
# Power on
# Wait 2 minutes for boot
```

**Check 4: Firewall Not Blocking?**
```bash
# Windows: Check Windows Defender Firewall
# Mac: Check System Preferences → Security
# Linux: sudo ufw status

# Port 3000 should be allowed
```

**Check 5: Testing Correctly?**
```bash
# MUST test on 4G, not home WiFi
# Connect via cellular data only

# Or from completely different network
# (Different computer, different ISP)
```

---

### Problem: "Port seems closed"

**Check if port number is correct:**
```bash
# Your ISP might have blocked 3000
# Try different port:

# Change your app port to 5000
npm start -- --port 5000

# Then port forward 5000 → 192.168.1.73:5000

# Test: http://88.97.222.2:5000/health
```

**Check if ISP blocks that port:**
```bash
# Test port availability online
https://www.canyouseeme.org/
# Try ports: 3000, 5000, 8000, 9000, 9999

# Use whichever works
```

---

### Problem: "Works on WiFi, not from 4G"

This usually means port forwarding ISN'T working.

**Check:**
1. Is port forward rule created?
2. Is it enabled (not disabled)?
3. Is internal IP correct (192.168.1.73)?
4. Did you restart router?
5. Is external port correct (3000)?

---

## 📱 Using Your API from Mobile App

### Update App Configuration

```typescript
// OLD (Local WiFi)
const API_URL = "http://192.168.1.73:3000"

// NEW (From anywhere)
const API_URL = "http://88.97.222.2:3000"

// BEST (Conditional)
const API_URL = isOnHomeNetwork()
  ? "http://192.168.1.73:3000"      // Fast local
  : "http://88.97.222.2:3000"        // From outside
```

### Example in React Native

```typescript
import axios from 'axios'

// Detect if on home network
const isOnHomeNetwork = async () => {
  try {
    const response = await axios.get('http://192.168.1.73:3000/health',
      { timeout: 2000 }
    )
    return true
  } catch {
    return false
  }
}

// Use correct URL
const getApiUrl = async () => {
  return (await isOnHomeNetwork())
    ? "http://192.168.1.73:3000"
    : "http://88.97.222.2:3000"
}

// Then use in your app
export const apiClient = axios.create({
  baseURL: getApiUrl()
})
```

---

## 🎯 Quick Checklist

```
Port Forwarding Setup Checklist:

☐ Find your computer's internal IP: 192.168.1.73
☐ Find your router admin page: http://192.168.1.1
☐ Login to router (admin/admin)
☐ Find "Port Forwarding" or "Virtual Server" menu
☐ Create new port forward rule:
  - External Port: 3000
  - Internal IP: 192.168.1.73
  - Internal Port: 3000
  - Protocol: TCP
  - Status: Enabled
☐ Click "Save" or "Apply"
☐ Router restarts (may take 2-3 minutes)
☐ Test locally: curl http://localhost:3000/health
☐ Test from phone 4G: http://88.97.222.2:3000/health
☐ Update mobile app with: http://88.97.222.2:3000
```

---

## 📞 Support Summary

**If it's not working:**

1. **API running locally?**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Port forwarding configured?**
   ```
   Router admin → Check port forward rule exists
   ```

3. **Testing on 4G not WiFi?**
   ```
   Disable WiFi on phone, use cellular
   ```

4. **Try different port?**
   ```
   ISP might block 3000, try 5000 or 8888
   ```

5. **Restart router?**
   ```
   Power off 30 seconds, power on, wait 2 min
   ```

---

That's port forwarding! 🎯

**Ready to set it up? Tell me:**
1. Your router brand/model
2. Whether you've logged in to it
3. If you can find the port forwarding menu

I'll help you through the exact steps!
