# VM Port Forwarding Setup Guide

For exposing your VM-hosted API to the internet through your home router.

## Your Current Setup

```
Internet
    ↓
ISP Router (88.97.222.2)
    ↓
Home Network (192.168.1.x)
    ├── Host Machine (192.168.1.??)  ← NEED TO FIND THIS
    │       ↓
    │   VM (192.168.1.73)
    │       ↓
    │   API (port 3000)
    │
    └── Other PCs (192.168.1.50, 192.168.1.60, etc.)
```

## Step 1: Find Your Host Machine's Local IP

### On Your Host Machine (Windows/Mac/Linux):

**Windows (Command Prompt):**
```cmd
ipconfig
```
Look for "IPv4 Address" in the output. Should be something like `192.168.1.10` or `192.168.1.50`.

**Mac (Terminal):**
```bash
ifconfig | grep "inet " | grep -v "127.0.0.1"
```
Look for `inet 192.168.x.x`

**Linux (Terminal):**
```bash
ip addr show | grep "inet " | grep -v "127.0.0.1"
```

**Alternative (Any OS):**
```bash
# Access router admin page and look for connected devices
# See "Connected Devices" or "DHCP Clients" section
# Find your host machine in the list
```

### Example Output:
```
Host Machine IP: 192.168.1.42
VM IP: 192.168.1.73
```

Once you have this, replace `[HOST_MACHINE_IP]` in the steps below.

---

## Step 2: Access Your Router

Visit: `http://192.168.1.1`

Or try these if above doesn't work:
- `http://192.168.0.1`
- `http://192.168.1.254`

Login with default credentials (check your router or back sticker):
- Username: `admin`
- Password: `admin` or `password`

---

## Step 3: Configure Port Forwarding

### For NETGEAR Router:

1. Login to `http://192.168.1.1`
2. Go to: **Advanced Settings** → **Advanced** → **Port Forwarding** (or **Virtual Server**)
3. Click **Add Custom Service** or **Add Service**
4. Fill in:
   ```
   Service Name: SneakerAPI
   External Port: 3000
   Internal Port: 3000
   Internal IP: [HOST_MACHINE_IP]  ← Use the IP you found in Step 1
   Protocol: TCP
   ```
5. Click **Apply**
6. Router will restart (wait 2-3 minutes)

### For TP-Link Router:

1. Login to `http://192.168.0.1` or `http://tplinkwifi.net`
2. Go to: **Advanced Settings** → **NAT Forwarding** → **Port Forwarding**
3. Click **Add New**
4. Fill in:
   ```
   Service Port: 3000
   Internal Port: 3000
   Internal IP Address: [HOST_MACHINE_IP]
   Protocol: TCP
   Status: Enabled
   ```
5. Click **Save**

### For ASUS Router:

1. Login to `http://192.168.1.1` or `http://router.asus.com`
2. Go to: **Advanced Settings** → **NAT** → **Port Forwarding**
3. Fill in:
   ```
   Port Range: 3000
   Local IP: [HOST_MACHINE_IP]
   Local Port: 3000
   Protocol: TCP
   ```
4. Click **Apply**

---

## Step 4: Configure Host Machine Networking

After router port forwarding is set, the host machine needs to forward traffic to the VM.

### On Your Host Machine:

This step depends on your virtualization platform:

**If using VirtualBox:**
1. Open VirtualBox
2. Select your VM
3. Go to **Settings** → **Network**
4. If adapter is set to "NAT":
   ```
   Configure port forwarding:
   Host Port: 3000 → Guest Port: 3000
   ```
5. If adapter is set to "Bridged":
   - Traffic should pass through automatically
   - No additional configuration needed

**If using Hyper-V:**
1. Open Hyper-V Manager
2. Select your VM
3. VM should already be accessible at 192.168.1.73
4. No additional port forwarding needed if using NAT networking

**If using Proxmox/KVM:**
```bash
# Check current VM network setup
sudo virsh net-dumpxml default

# If needed, configure port forwarding
sudo iptables -t nat -A PREROUTING -p tcp --dport 3000 -j DNAT --to-destination 192.168.1.73:3000
sudo iptables -t nat -A POSTROUTING -p tcp -d 192.168.1.73 --dport 3000 -j MASQUERADE
```

---

## Step 5: Verify Everything Works

### Test 1: Local Access (On Host Machine)

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2026-02-10T...","environment":"production"}
```

### Test 2: Network Access (From Another PC)

```bash
curl http://192.168.1.73:3000/health
```

Should work - same response as above.

### Test 3: Internet Access (Critical Test)

**Option A: Using Your Phone on 4G/LTE**

1. Turn OFF WiFi on your phone
2. Use cellular data only
3. Open browser and visit:
   ```
   http://88.97.222.2:3000/health
   ```
4. Should see the same healthy response

**Option B: Using Online Port Checker**

Visit: https://www.canyouseeme.org/
```
Enter Port: 3000
Click "Check Port"
```

Expected response: **"Success! I can see your service..."**

**Option C: From Another Network**

Use a computer on a completely different network (different ISP) and try:
```bash
curl http://88.97.222.2:3000/health
```

---

## Step 6: Troubleshooting

### Problem: "Connection refused" when testing from 4G

**Check 1: Is API running on VM?**
```bash
# SSH into VM or access VM directly
curl http://localhost:3000/health
```

**Check 2: Is port forwarding configured?**
```bash
# Check router admin page
# Verify:
# - Rule exists for port 3000
# - Internal IP is correct: [HOST_MACHINE_IP]
# - Status is "Enabled" not "Disabled"
```

**Check 3: Did router restart after config?**
```bash
# Restart router manually:
# 1. Unplug power for 30 seconds
# 2. Plug back in
# 3. Wait 3 minutes for full boot
# 4. Test again
```

**Check 4: Is host machine firewall blocking?**

Windows:
```cmd
# Open Windows Defender Firewall → Inbound Rules
# Find port 3000 or create allow rule
```

Mac:
```bash
# System Preferences → Security & Privacy → Firewall
# Check if port 3000 is allowed
```

Linux:
```bash
sudo ufw status
# Should show: 3000/tcp ALLOW
```

**Check 5: Did you test from 4G, not home WiFi?**
```
❌ WRONG: Test from WiFi on same network (always works)
✅ RIGHT: Test from 4G/cellular data (real internet test)
```

### Problem: ISP blocked port 3000

Try alternative ports:

```bash
# Update VM API port in .env or systemd service
PORT=5000 npm start

# Update router port forwarding:
# External Port: 5000 → Internal Port: 5000

# Test
curl http://88.97.222.2:5000/health
```

Try ports: **5000, 8000, 9000, 9999** (avoid 80, 8080, 443)

### Problem: Get "Address already in use" error

```bash
# Check what's using port 3000
lsof -i :3000

# Or from VM/host
netstat -tuln | grep 3000

# Kill if needed
sudo kill -9 <PID>
```

---

## Step 7: Optional - Configure Image Server on Port 8888

If you want to serve images on a separate port:

### Update Router Port Forwarding

Add another rule:
```
Service Name: SneakerAPI-Images
External Port: 8888
Internal Port: 8888
Internal IP: [HOST_MACHINE_IP]
Protocol: TCP
```

### Update API Configuration

In your `src/index.ts`, add:
```typescript
app.use('/images', express.static('/home/gorhick/images'));
```

### Update Mobile App

```typescript
const API_URL = "http://88.97.222.2:3000";
const IMAGE_URL = "http://88.97.222.2:8888";

// Fetch images from separate port
<Image source={{ uri: `${IMAGE_URL}/sneakers/555088-001.webp` }} />
```

---

## Quick Reference

| Item | Value |
|------|-------|
| **Public IP** | `88.97.222.2` |
| **Host Machine IP** | `192.168.1.??` (Find this!) |
| **VM IP** | `192.168.1.73` |
| **API Port** | `3000` |
| **Router IP** | `192.168.1.1` |
| **Test URL (4G)** | `http://88.97.222.2:3000/health` |
| **Test URL (Network)** | `http://192.168.1.73:3000/health` |

---

## Summary Checklist

- [ ] Found host machine IP address (Step 1)
- [ ] Accessed router admin page (Step 2)
- [ ] Created port forwarding rule: External 3000 → [HOST_MACHINE_IP]:3000 (Step 3)
- [ ] Router restarted (Step 3)
- [ ] Verified API is running on VM (Step 5, Test 1)
- [ ] Tested from network (Step 5, Test 2)
- [ ] Tested from 4G/cellular (Step 5, Test 3)
- [ ] Port forwarding working ✅ (Step 5, Test 3 succeeds)
- [ ] Updated mobile app with public IP (Step 7)

---

## What's Next?

Once port forwarding is working:

1. **Update Mobile App**
   ```typescript
   const API_BASE_URL = "http://88.97.222.2:3000";
   ```

2. **Set Up Auto-Start** (so API stays running)
   ```bash
   # In VM, use PM2 or systemd
   pm2 start "npm start" --name sneaker-api
   pm2 startup
   ```

3. **Monitor Uptime**
   ```bash
   # Periodic health check
   curl http://88.97.222.2:3000/health
   ```

4. **Optional: SSL/TLS** (for production security)
   ```bash
   # Self-signed certificate for development
   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365
   ```

---

That's your complete port forwarding setup for VM architecture! 🚀
