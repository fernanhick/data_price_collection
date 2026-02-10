# VPS Migration Guide

Complete guide for migrating your sneaker price collection API to a new VPS.

---

## What Gets Migrated

| Component | Size | Location |
|-----------|------|----------|
| **Database** | 3 MB | PostgreSQL backup |
| **Images** | 32 MB | ~/images/ |
| **Code** | 500 KB | Git repository |
| **Config** | 1 KB | .env file |
| **TOTAL** | ~36 MB | Single backup file |

---

## Step 1: Create Backup on Current VPS

### Quick One-Command Backup
```bash
cd /home/gorhick/data_price_collection
npm run migrate:backup /tmp/backups
```

This creates:
```
/tmp/backups/sneaker-api-backup-20260210_225900/
├── database.sql                    # PostgreSQL dump
├── images/                         # All 1,082 product images
├── code.tar.gz                     # Application source
├── .env.backup                     # Environment variables
└── RESTORE-INSTRUCTIONS.md         # Restore guide
```

### Manual Backup (if needed)
```bash
# 1. Database backup
mkdir -p ~/vps-migration
PGPASSWORD="fErchO99" pg_dump -h localhost -U postgres sneaker_prices \
  > ~/vps-migration/database.sql

# 2. Images backup
cp -r ~/images ~/vps-migration/

# 3. Code backup
cd /home/gorhick/data_price_collection
git archive --format tar.gz -o ~/vps-migration/code.tar.gz HEAD

# 4. Config backup
cp /home/gorhick/data_price_collection/.env ~/vps-migration/.env.backup

# Total size
du -sh ~/vps-migration/
```

---

## Step 2: Transfer Backup to New VPS

### Option A: Using SCP (Secure Copy)
```bash
# From your laptop/current machine:
scp -r ~/vps-migration root@NEW_VPS_IP:/root/backup/

# Or from new VPS:
scp -r root@OLD_VPS_IP:/root/vps-migration ./backup/
```

### Option B: Using rsync (Better for large files)
```bash
rsync -avz --progress ~/vps-migration/ root@NEW_VPS_IP:/root/backup/
```

### Option C: AWS S3 / Cloud Storage (Secure)
```bash
# Compress backup
tar -czf backup.tar.gz ~/vps-migration/

# Upload to S3
aws s3 cp backup.tar.gz s3://your-bucket/backups/

# Download on new VPS
aws s3 cp s3://your-bucket/backups/backup.tar.gz ./
tar -xzf backup.tar.gz
```

---

## Step 3: Prepare New VPS

### Install System Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs npm

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install other useful tools
sudo apt install -y git curl wget htop
```

### Create Database User & Database
```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create superuser 'postgres' if not exists (usually exists)
# Change postgres password
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'fErchO99';"

# Create empty database
sudo -u postgres createdb sneaker_prices
```

### Verify PostgreSQL
```bash
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -c "SELECT version();"
```

---

## Step 4: Restore from Backup

### Restore Database
```bash
cd ~/backup/vps-migration/

# Restore PostgreSQL
PGPASSWORD="fErchO99" psql -h localhost -U postgres sneaker_prices < database.sql

# Verify restoration
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -c "
  SELECT COUNT(*) as total_skus FROM skus;
  SELECT COUNT(*) FILTER (WHERE image_local_path IS NOT NULL) as with_images FROM skus;
"
```

Expected output:
```
 total_skus | with_images
------------+-------------
       1116 |        1082
```

### Restore Images
```bash
# Create image directories
mkdir -p ~/images/sneakers/thumbs

# Copy images
cp -r ~/backup/vps-migration/images/* ~/images/

# Verify images
ls ~/images/sneakers | wc -l  # Should show ~1,082
du -sh ~/images/               # Should show ~32 MB
```

### Restore Application Code
```bash
# Create app directory
mkdir -p ~/data_price_collection
cd ~/data_price_collection

# Extract code
tar -xzf ~/backup/vps-migration/code.tar.gz

# Restore environment file
cp ~/backup/vps-migration/.env.backup .env

# Edit .env if needed (check database credentials)
nano .env
```

### Install Application Dependencies
```bash
cd ~/data_price_collection

# Install npm packages
npm install

# Build TypeScript
npm run build

# Verify build succeeded
ls -la dist/
```

---

## Step 5: Start Application

### Method A: Direct Start (Testing)
```bash
cd ~/data_price_collection
npm start
```

Should see:
```
✅ Database connection established
✅ Image processor initialized
🚀 Server running on http://localhost:3000
```

### Method B: Using PM2 (Production)
```bash
# Install PM2
npm install -g pm2

# Start with PM2
cd ~/data_price_collection
pm2 start "npm start" --name "sneaker-api"

# Monitor
pm2 logs sneaker-api
pm2 status

# Auto-restart on server reboot
pm2 startup
pm2 save
```

### Method C: Using Systemd Service (Production)
```bash
# Create systemd service
sudo tee /etc/systemd/system/sneaker-api.service > /dev/null <<EOF
[Unit]
Description=Sneaker Price API
After=network.target postgresql.service

[Service]
Type=simple
User=gorhick
WorkingDirectory=/home/gorhick/data_price_collection
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable sneaker-api.service
sudo systemctl start sneaker-api.service
sudo systemctl status sneaker-api.service
```

---

## Step 6: Verify Everything

### Test API Endpoints
```bash
# Health check
curl http://localhost:3000/health

# Test SKU endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/skus/catalog?limit=3 | jq '.catalog[] | {brand, model, image_url}'

# Test image serving
curl -I http://localhost:3000/images/sneakers/555088-001.webp
# Should return: HTTP/1.1 200 OK
```

### Database Verification
```bash
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices << EOF
-- Check tables
SELECT tablename FROM pg_tables WHERE schemaname='public';

-- Check data counts
SELECT COUNT(*) as total_skus FROM skus;
SELECT COUNT(*) FILTER (WHERE image_local_path IS NOT NULL) as images_cached FROM skus;
SELECT COUNT(*) FROM prices;
SELECT COUNT(*) FROM price_history;

-- Check latest price update
SELECT MAX(timestamp) as latest_price FROM prices;
EOF
```

### Image Verification
```bash
# Check image count
ls ~/images/sneakers | wc -l

# Check image types
file ~/images/sneakers/555088-001.webp  # Should be WebP image

# Check storage
du -sh ~/images/

# Verify thumbnails
ls ~/images/sneakers/thumbs | wc -l
```

---

## Step 7: Configure Network & DNS

### Update Firewall
```bash
# Allow ports
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Setup Reverse Proxy (Nginx)
```bash
# Install Nginx
sudo apt install -y nginx

# Create config
sudo tee /etc/nginx/sites-available/sneaker-api > /dev/null <<EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /images/ {
        alias /home/gorhick/images/;
        expires 7d;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/sneaker-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Update DNS
Point your domain's DNS A record to new VPS IP:
```
your-domain.com  A  NEW_VPS_IP_ADDRESS
```

### SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

---

## Step 8: Post-Migration

### Backup Database Regularly
```bash
# Create backup script
cat > ~/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="$HOME/backups/db"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/sneaker_prices_$(date +%Y%m%d_%H%M%S).sql"
PGPASSWORD="fErchO99" pg_dump -h localhost -U postgres sneaker_prices > "$BACKUP_FILE"
gzip "$BACKUP_FILE"
echo "Database backed up to $BACKUP_FILE.gz"

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
EOF

chmod +x ~/backup-db.sh

# Schedule daily backups
(crontab -l 2>/dev/null; echo "0 2 * * * $HOME/backup-db.sh") | crontab -
```

### Monitor Performance
```bash
# CPU & Memory
htop

# Disk space
df -h

# Database size
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -c "
  SELECT pg_size_pretty(pg_database_size('sneaker_prices'));"

# Image directory size
du -sh ~/images/
```

### Enable Logging
```bash
# Ensure logs are being written
tail -f ~/data_price_collection/logs/app.log

# Rotate logs
sudo tee /etc/logrotate.d/sneaker-api > /dev/null <<EOF
/home/gorhick/data_price_collection/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 gorhick gorhick
}
EOF
```

---

## Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check credentials
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -c "SELECT 1;"

# Check pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

### Images Not Loading
```bash
# Check permissions
ls -la ~/images/sneakers/
sudo chmod -R 755 ~/images/

# Check image_local_path in database
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices \
  -c "SELECT COUNT(*) FROM skus WHERE image_local_path IS NOT NULL;"

# Verify Nginx serving images
curl -I http://localhost/images/sneakers/555088-001.webp
```

### Port Already in Use
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill process if needed
sudo kill -9 <PID>

# Or use different port in .env
PORT=8000 npm start
```

---

## Summary Checklist

- [ ] Create backup on current VPS
- [ ] Transfer backup to new VPS
- [ ] Install system dependencies (Node, PostgreSQL)
- [ ] Restore database from backup
- [ ] Restore images from backup
- [ ] Extract and setup application code
- [ ] Install npm dependencies
- [ ] Build TypeScript
- [ ] Start application
- [ ] Verify API endpoints
- [ ] Verify images are serving
- [ ] Setup reverse proxy (Nginx)
- [ ] Update DNS records
- [ ] Setup SSL certificate
- [ ] Configure backups
- [ ] Test all functionality

**Estimated time: 30-45 minutes**

---

## Rollback Plan

If something goes wrong:

```bash
# Stop application
sudo systemctl stop sneaker-api

# Restore from backup
# (Repeat Step 4: Restore from Backup)

# Restart
sudo systemctl start sneaker-api
```

---

That's it! Your complete API with database and 32 MB of images is now on the new VPS! 🚀
