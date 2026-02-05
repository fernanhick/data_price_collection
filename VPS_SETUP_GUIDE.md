# VPS Setup Guide - Sneaker Price API

## Current Status ✅

Your VPS is already configured with:
- ✅ Node.js v22.22.0
- ✅ PostgreSQL 15.15 (running)
- ✅ Redis 7.0.15 (running)
- ✅ Database created with all tables
- ✅ Dependencies installed
- ✅ Project built
- ✅ API running on port 3000

## Quick Start

### 1. Test the API

```bash
# Health check
curl http://localhost:3000/health

# Access admin dashboard
# Open in browser: http://YOUR_VPS_IP:3000/admin
```

## Production Setup Checklist

### Step 1: Install PM2 for Process Management

PM2 will keep your API running, restart on crashes, and start on server reboot.

```bash
# Install PM2 globally
npm install -g pm2

# Stop current running process first
pkill -f "node.*src/index"

# Start API with PM2
pm2 start dist/src/index.js --name sneaker-api

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions it provides (will give you a command to run with sudo)

# Monitor your app
pm2 status
pm2 logs sneaker-api
pm2 monit
```

### Step 2: Configure Firewall

```bash
# Allow SSH (IMPORTANT: Don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow API port
sudo ufw allow 3000/tcp

# If you'll use nginx (recommended for production)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### Step 3: Set Up Nginx Reverse Proxy (Optional but Recommended)

This allows you to:
- Serve on port 80/443 (standard HTTP/HTTPS)
- Add SSL/HTTPS support
- Better security and performance

```bash
# Install nginx
sudo apt update
sudo apt install -y nginx

# Create nginx configuration
sudo nano /etc/nginx/sites-available/sneaker-api
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # Increase body size for file uploads
    client_max_body_size 10M;

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Admin dashboard
    location /admin {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

Enable and start nginx:

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/sneaker-api /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Enable nginx to start on boot
sudo systemctl enable nginx
```

Now your API will be accessible at `http://YOUR_VPS_IP/` instead of `:3000`.

### Step 4: Add SSL/HTTPS with Let's Encrypt (Recommended)

If you have a domain name:

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will automatically configure nginx for HTTPS
# Certificates auto-renew every 90 days
```

### Step 5: Environment Configuration for Production

Update your `.env` file for production:

```bash
nano .env
```

Change these values:

```bash
NODE_ENV=production
API_BASE_URL=https://yourdomain.com  # or http://your-vps-ip

# Update CORS to restrict origins in production
CORS_ORIGIN=https://your-mobile-app-domain.com

# Disable detailed error messages in production (already handled by NODE_ENV)

# Keep your existing database and Redis configs
```

After changing `.env`, restart the API:

```bash
pm2 restart sneaker-api
```

### Step 6: Set Up Automated Backups

#### Database Backups

Create a backup script:

```bash
mkdir -p ~/backups
nano ~/backups/backup-db.sh
```

Add this content:

```bash
#!/bin/bash
BACKUP_DIR="$HOME/backups/db"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
PGPASSWORD=fErchO99 pg_dump -h localhost -U postgres sneaker_prices > "$BACKUP_DIR/sneaker_prices_$DATE.sql"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

echo "Backup completed: sneaker_prices_$DATE.sql"
```

Make it executable and set up cron:

```bash
chmod +x ~/backups/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
```

Add this line:

```
0 2 * * * /home/gorhick/backups/backup-db.sh >> /home/gorhick/backups/backup.log 2>&1
```

### Step 7: Set Up Monitoring and Logs

```bash
# View PM2 logs
pm2 logs sneaker-api

# View PM2 logs in real-time
pm2 logs sneaker-api --lines 100

# View nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Set up log rotation for PM2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Testing the Setup

### 1. Test Local API

```bash
# Health check
curl http://localhost:3000/health

# Should return: {"status":"healthy",...}
```

### 2. Test Through Nginx (if configured)

```bash
# Health check through nginx
curl http://YOUR_VPS_IP/health

# Or with domain
curl http://yourdomain.com/health
```

### 3. Test Admin Dashboard

Open in browser:
- Direct: `http://YOUR_VPS_IP:3000/admin`
- Through nginx: `http://YOUR_VPS_IP/admin`
- With domain: `https://yourdomain.com/admin`

### 4. Generate JWT Token for Testing

```bash
# Generate development JWT token
npm run dev:generate-jwt

# Copy the token and use it in the admin dashboard
```

### 5. Test API Endpoints

```bash
# Get token
TOKEN=$(cat scripts/.dev-keys/test-token.txt 2>/dev/null || echo "GENERATE_TOKEN_FIRST")

# Test SKU listing
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/skus?limit=5

# Test analytics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/analytics/summary
```

## Common PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs sneaker-api

# Restart app
pm2 restart sneaker-api

# Stop app
pm2 stop sneaker-api

# Start app
pm2 start sneaker-api

# Delete app from PM2
pm2 delete sneaker-api

# Monitor CPU/Memory
pm2 monit

# Save current process list
pm2 save

# Resurrect saved processes
pm2 resurrect
```

## Troubleshooting

### API Not Starting

```bash
# Check PM2 logs
pm2 logs sneaker-api --lines 50

# Check if port 3000 is in use
ss -tlnp | grep 3000

# Check database connection
PGPASSWORD=fErchO99 psql -h localhost -U postgres -d sneaker_prices -c "SELECT 1;"

# Check Redis
redis-cli ping
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
systemctl status postgresql

# Start if not running
sudo systemctl start postgresql

# Test connection
PGPASSWORD=fErchO99 psql -h localhost -U postgres -d sneaker_prices
```

### Port Already in Use

```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill the process (use PID from above)
kill -9 PID_NUMBER

# Or kill all node processes (careful!)
pkill -f node
```

### Nginx Issues

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx status
systemctl status nginx

# Restart nginx
sudo systemctl restart nginx

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## Security Hardening

### 1. Change PostgreSQL Password

```bash
sudo -u postgres psql
```

In PostgreSQL:

```sql
ALTER USER postgres WITH PASSWORD 'new_secure_password';
\q
```

Update `.env` with new password.

### 2. Restrict Database Access

Edit PostgreSQL config:

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Ensure it only allows local connections.

### 3. Enable Fail2Ban (Prevent Brute Force)

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 4. Keep System Updated

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update npm packages
cd ~/data_price_collection
npm audit fix
npm update
```

## Performance Optimization

### 1. Enable Redis Persistence

```bash
sudo nano /etc/redis/redis.conf
```

Ensure these lines are set:

```
save 900 1
save 300 10
save 60 10000
```

Restart Redis:

```bash
sudo systemctl restart redis-server
```

### 2. Optimize PostgreSQL

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

Adjust based on your VPS RAM:

```
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 1GB      # 50-75% of RAM
work_mem = 16MB
maintenance_work_mem = 128MB
```

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

### 3. PM2 Cluster Mode (For Multi-Core CPUs)

```bash
# Stop current instance
pm2 delete sneaker-api

# Start in cluster mode (uses all CPU cores)
pm2 start dist/src/index.js --name sneaker-api -i max

# Save
pm2 save
```

## Next Steps

1. **Set up production JWT**: Update `CONVEX_URL` and `CONVEX_JWKS_URL` in `.env` with your actual Convex deployment
2. **Configure domain**: Point your domain's A record to your VPS IP
3. **Set up SSL**: Use Let's Encrypt as shown above
4. **Monitor**: Set up monitoring (Datadog, New Relic, or simple alerting scripts)
5. **Document API**: Consider adding Swagger/OpenAPI documentation

## Useful Resources

- PM2 Documentation: https://pm2.keymetrics.io/
- Nginx Configuration: https://nginx.org/en/docs/
- Let's Encrypt: https://letsencrypt.org/
- PostgreSQL Tuning: https://pgtune.leopard.in.ua/

## Quick Reference Commands

```bash
# Start everything
pm2 start sneaker-api
sudo systemctl start nginx
sudo systemctl start postgresql
sudo systemctl start redis-server

# Stop everything
pm2 stop sneaker-api
sudo systemctl stop nginx

# Restart API after code changes
npm run build
pm2 restart sneaker-api

# View all logs
pm2 logs sneaker-api
sudo tail -f /var/log/nginx/error.log

# Check system resources
htop
pm2 monit
df -h

# Database backup NOW
~/backups/backup-db.sh
```
