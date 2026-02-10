# Internet Exposure Setup Guide

Complete guide for exposing your Sneaker API to the internet on custom ports.

---

## Current Situation

- ✅ VPS is ready (your own server)
- ✅ API runs on port 3000 locally
- ✅ Images served from `~/images/`
- ❌ ISP blocks ports 80, 8080
- ❌ Need custom ports for internet access

---

## Solution: Use Custom Port

Since you have your own VPS, you can use **any port above 1024**.

### Available Custom Ports
```
Port 3000  (already using for API)
Port 8443  (HTTPS alternative)
Port 9000  (alternative)
Port 5000  (alternative)
Port 8888  (alternative)
Port 3443  (alternative)
Port 9999  (alternative)
```

---

## Option A: Direct Exposure (Simplest) ⭐

Run API directly on custom port, no reverse proxy needed.

### Step 1: Configure Environment
```bash
cd /home/gorhick/data_price_collection
nano .env
```

Edit `.env`:
```env
PORT=3000
NODE_ENV=production
# ... other variables
```

### Step 2: Update Firewall
```bash
# Allow custom port through firewall
sudo ufw allow 3000/tcp
sudo ufw allow 3000/udp

# Verify
sudo ufw status
```

### Step 3: Start API
```bash
# Test directly
npm start

# Or use PM2 for production
pm2 start "npm start" --name "sneaker-api"
pm2 save
pm2 startup
```

### Step 4: Access from Internet
```
http://YOUR_VPS_IP:3000/health
http://YOUR_VPS_IP:3000/api/skus/catalog
http://YOUR_VPS_IP:3000/images/sneakers/555088-001.webp
```

### Complete Example
```bash
# 1. Get your VPS IP
curl ifconfig.me

# 2. Test from another machine
curl http://YOUR_VPS_IP:3000/health

# Output should show:
# {"status":"healthy","timestamp":"2026-02-10T...","environment":"production"}
```

---

## Option B: Multiple Custom Ports (Better)

Expose API and images on separate ports for flexibility.

### Step 1: Configure Nginx Multi-Port

```bash
sudo nano /etc/nginx/sites-available/sneaker-api
```

**Create config with multiple ports:**
```nginx
# API on port 3000
upstream api_backend {
    server localhost:3000;
}

server {
    listen 3000;
    listen [::]:3000;
    server_name _;

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Images on port 8888
server {
    listen 8888;
    listen [::]:8888;
    server_name _;

    location / {
        alias /home/gorhick/images/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

### Step 2: Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/sneaker-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 3: Open Ports
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8888/tcp
sudo ufw allow 9000/tcp    # Optional backup port
sudo ufw status
```

### Step 4: Access Both
```bash
# API
curl http://YOUR_VPS_IP:3000/api/skus/catalog

# Images
curl http://YOUR_VPS_IP:8888/sneakers/555088-001.webp
```

---

## Option C: Custom Port with SSL (Recommended for Production)

Use SSL even on custom ports for security.

### Step 1: Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Step 2: Add DNS Record (Optional but better)
```
api.yourdomain.com  A  YOUR_VPS_IP
images.yourdomain.com A YOUR_VPS_IP
```

### Step 3: Get SSL Certificate
```bash
# Without domain (self-signed)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/sneaker-api.key \
  -out /etc/ssl/certs/sneaker-api.crt

# With domain
sudo certbot certonly --standalone -d api.yourdomain.com
```

### Step 4: Configure Nginx with SSL
```bash
sudo nano /etc/nginx/sites-available/sneaker-api-ssl
```

**Create HTTPS config:**
```nginx
server {
    listen 3443 ssl;
    listen [::]:3443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/sneaker-api.crt;
    ssl_certificate_key /etc/ssl/private/sneaker-api.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /images/ {
        alias /home/gorhick/images/;
        expires 7d;
    }
}
```

### Step 5: Enable & Start
```bash
sudo ln -s /etc/nginx/sites-available/sneaker-api-ssl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo ufw allow 3443/tcp
```

### Step 6: Access Securely
```bash
# HTTPS on custom port
curl https://api.yourdomain.com:3443/health
curl https://YOUR_VPS_IP:3443/api/skus/catalog

# Ignore self-signed cert warning (dev)
curl -k https://YOUR_VPS_IP:3443/health
```

---

## Option D: SSH Tunnel (If VPS Access Only)

If you want to keep API completely private, use SSH tunnel.

### Step 1: SSH into VPS
```bash
ssh -L 3000:localhost:3000 user@YOUR_VPS_IP
```

### Step 2: Access Locally
```bash
# On your local machine (same as production)
curl http://localhost:3000/health
```

### Step 3: For Mobile App
```bash
# Use VPS IP directly (insecure)
http://YOUR_VPS_IP:3000

# Or use VPN to VPS
# (Set up WireGuard/OpenVPN for secure tunnel)
```

---

## Recommended Setup for Your Needs

### Best Option: Custom Port + Domain

**If you have a domain:**

```bash
# 1. Point domain to VPS
api.yourdomain.com → YOUR_VPS_IP
images.yourdomain.com → YOUR_VPS_IP

# 2. Use ports
API: 3000 (http://api.yourdomain.com:3000)
Images: 8888 (http://images.yourdomain.com:8888)

# 3. Optional SSL on custom ports (secure)
API: 3443 (https://api.yourdomain.com:3443)
Images: 8443 (https://images.yourdomain.com:8443)
```

**If you don't have a domain:**

```bash
# Use VPS IP directly
API: 3000 (http://YOUR_VPS_IP:3000)
Images: 8888 (http://YOUR_VPS_IP:8888)
```

---

## Complete Setup Script

Create automated setup:

```bash
#!/bin/bash

# 1. Create config directory
mkdir -p ~/sneaker-api-config

# 2. Update .env
cat > ~/data_price_collection/.env << 'EOF'
PORT=3000
NODE_ENV=production
CORS_ORIGIN=*
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=fErchO99
DB_NAME=sneaker_prices
DB_PORT=5432
EOF

# 3. Setup firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 3000/tcp   # API
sudo ufw allow 8888/tcp   # Images
sudo ufw allow 9000/tcp   # Backup port
sudo ufw enable

# 4. Create Nginx config
sudo tee /etc/nginx/sites-available/sneaker-api > /dev/null <<'NGINX'
upstream api_backend {
    server localhost:3000;
}

server {
    listen 3000;
    listen [::]:3000;
    server_name _;

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 8888;
    listen [::]:8888;
    server_name _;

    location / {
        alias /home/gorhick/images/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
NGINX

# 5. Enable Nginx
sudo ln -s /etc/nginx/sites-available/sneaker-api /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t
sudo systemctl restart nginx

# 6. Start API with PM2
cd ~/data_price_collection
npm install
npm run build
pm2 start "npm start" --name "sneaker-api"
pm2 save
pm2 startup

echo "✅ Setup complete!"
echo "API: http://YOUR_VPS_IP:3000"
echo "Images: http://YOUR_VPS_IP:8888"
```

---

## Testing Your Setup

### From Another Computer

```bash
# Get your VPS public IP
YOUR_VPS_IP=your_actual_ip_here

# Test API
curl http://$YOUR_VPS_IP:3000/health

# Test catalog
curl http://$YOUR_VPS_IP:3000/api/skus/catalog?limit=3

# Test images
curl -I http://$YOUR_VPS_IP:8888/sneakers/555088-001.webp
# Should return: HTTP/1.1 200 OK
```

### From Mobile App

```typescript
// Update API base URL
const API_BASE_URL = "http://YOUR_VPS_IP:3000";
const IMAGE_BASE_URL = "http://YOUR_VPS_IP:8888";

// Example request
const response = await fetch(`${API_BASE_URL}/api/skus/catalog`);
const data = await response.json();

// Display image
const imageUrl = `${IMAGE_BASE_URL}${data.catalog[0].image_url}`;
```

---

## Port Reference

| Port | Service | Purpose | Status |
|------|---------|---------|--------|
| 22 | SSH | Server access | Required |
| 80 | HTTP | Web (ISP blocked) | ❌ Closed |
| 443 | HTTPS | Secure web (ISP blocked) | ❌ Closed |
| 3000 | Node.js | API server | ✅ Available |
| 3443 | HTTPS Node | Secure API | ✅ Available |
| 8080 | Alt HTTP | ISP blocked | ❌ Closed |
| 8888 | Image server | CDN/Images | ✅ Available |
| 9000 | Backup | Fallback | ✅ Available |
| 9999 | Alt backup | Fallback | ✅ Available |

---

## Security Considerations

### 1. Firewall (Essential)
```bash
# Only allow needed ports
sudo ufw default deny incoming
sudo ufw allow 22/tcp    # SSH (management)
sudo ufw allow 3000/tcp  # API (public)
sudo ufw allow 8888/tcp  # Images (public)
sudo ufw status verbose
```

### 2. Rate Limiting (Recommended)
Add to Nginx config:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://api_backend;
    }
}
```

### 3. SSL/TLS (Highly Recommended)
```bash
# Generate self-signed cert (dev)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/server.key \
  -out /etc/ssl/certs/server.crt

# Get free cert with Let's Encrypt (production)
sudo certbot certonly --standalone -d yourdomain.com
```

### 4. CORS Settings
```bash
# Allow only your domain
cat >> /home/gorhick/data_price_collection/.env << 'EOF'
CORS_ORIGIN=http://yourdomain.com:3000,https://yourdomain.com:3443
EOF
```

### 5. JWT Validation
```bash
# Verify JWT tokens for API access
# All requests to /api/* require valid JWT
# Public endpoints: /health, /images/*
```

---

## Troubleshooting

### Port Not Accessible
```bash
# Check if port is listening
sudo lsof -i :3000
sudo netstat -tuln | grep 3000

# Check firewall
sudo ufw status
sudo iptables -L -n

# Test locally
curl localhost:3000/health

# Test from another machine
curl http://YOUR_VPS_IP:3000/health
```

### Nginx Not Forwarding
```bash
# Check config
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Restart
sudo systemctl restart nginx
```

### Images Not Serving
```bash
# Check permissions
ls -la /home/gorhick/images/
sudo chmod -R 755 /home/gorhick/images/

# Check Nginx alias path
curl http://YOUR_VPS_IP:8888/sneakers/555088-001.webp

# Check file exists
file /home/gorhick/images/sneakers/555088-001.webp
```

---

## Quick Commands Cheat Sheet

```bash
# Get your VPS public IP
curl ifconfig.me
dig +short myip.opendns.com @resolver1.opendns.com

# Test connectivity
ping YOUR_VPS_IP
telnet YOUR_VPS_IP 3000
nc -zv YOUR_VPS_IP 3000

# Check services
sudo systemctl status nginx
sudo systemctl status postgresql
pm2 status

# View logs
pm2 logs sneaker-api
sudo tail -f /var/log/nginx/error.log

# Open port
sudo ufw allow 3000/tcp

# Close port
sudo ufw delete allow 3000/tcp

# Reload Nginx
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx
```

---

## Example: Full Internet Setup

### Your Setup
```
Your Machine (Local Network)
         ↓
    ISP Router (Blocks 80, 8080)
         ↓
Your VPS (Remote Server)
    ├── Port 3000 (API)
    ├── Port 8888 (Images)
    └── Port 22 (SSH Management)
         ↓
    Mobile App / Web Client
```

### Access
```
API: http://YOUR_VPS_IP:3000
Images: http://YOUR_VPS_IP:8888

Example calls:
curl http://YOUR_VPS_IP:3000/api/skus/catalog
curl http://YOUR_VPS_IP:8888/sneakers/555088-001.webp
```

---

## Summary

1. **Choose port:** 3000 (API), 8888 (Images)
2. **Open firewall:** `sudo ufw allow 3000/tcp`
3. **Start API:** `npm start`
4. **Test:** `curl http://YOUR_VPS_IP:3000/health`
5. **Access from internet:** Use your VPS IP + port
6. **Optional:** Add SSL on custom ports
7. **Optional:** Use domain name instead of IP

**That's it! Your API is now accessible from the internet!** 🚀
