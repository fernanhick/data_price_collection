# Complete QEMU Virtual Machine Setup Guide

Comprehensive guide to run the Sneaker Price Collector 24/7 in a QEMU virtual machine.

## Table of Contents

1. [VM Creation & Configuration](#vm-creation--configuration)
2. [Operating System Setup](#operating-system-setup)
3. [Dependency Installation](#dependency-installation)
4. [Project Setup](#project-setup)
5. [Data Collection Configuration](#data-collection-configuration)
6. [Systemd Service Setup](#systemd-service-setup)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)
9. [Backup & Data Export](#backup--data-export)

---

## VM Creation & Configuration

### Create QEMU VM

```bash
# Create a 50GB disk image
qemu-img create -f qcow2 sneaker-collector.qcow2 50G

# Create VM with appropriate resources
qemu-system-x86_64 \
  -m 4096 \
  -smp 4 \
  -enable-kvm \
  -drive file=sneaker-collector.qcow2,format=qcow2 \
  -cdrom ubuntu-22.04-live-server-amd64.iso \
  -net nic,model=virtio \
  -net user,hostfwd=tcp::2222-:22 \
  -name sneaker-collector \
  -display gtk
```

Or use `virt-manager` GUI (easier):
```bash
sudo apt install virt-manager  # Ubuntu/Debian
# Then open virt-manager and create VM graphically
```

### Recommended VM Specs

| Resource | Recommended | Minimum |
|----------|------------|---------|
| RAM | 4 GB | 2 GB |
| CPUs | 4 cores | 2 cores |
| Disk | 50 GB | 30 GB |
| Network | Bridged or NAT | NAT (simplest) |

### VM Network Configuration

For easy SSH access, configure port forwarding:

```bash
# When creating VM, add to QEMU command:
-net user,hostfwd=tcp::2222-:22

# Or edit libvirt XML:
<forward mode='nat'>
  <port start='2222' end='2222'/>
</forward>
```

Then SSH in from host:
```bash
ssh -p 2222 ubuntu@localhost
```

---

## Operating System Setup

### Install Ubuntu Server

1. **Boot from ISO** in QEMU
2. **Choose**: Ubuntu Server 22.04 LTS (long-term support)
3. **Installation Steps**:
   - Language: English
   - Keyboard: Your locale
   - Network: Auto-configure (DHCP)
   - Storage: Use entire disk
   - User account: Create with your name
   - SSH: Enable OpenSSH server
   - Packages: None needed (we'll install manually)

### Initial System Configuration

After first boot, connect via SSH and update system:

```bash
# SSH into VM
ssh -p 2222 ubuntu@localhost

# Update system packages
sudo apt update && sudo apt upgrade -y

# Install basic utilities
sudo apt install -y \
  curl \
  wget \
  git \
  build-essential \
  nano \
  htop \
  unzip

# Check system info
uname -a
free -h
df -h
```

---

## Dependency Installation

### 1. Install Node.js 18+

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js and npm
sudo apt install -y nodejs

# Verify installation
node --version   # Should be v18.x.x or higher
npm --version    # Should be 9.x.x or higher
```

### 2. Install PostgreSQL 15

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib-15

# Verify installation
psql --version

# Start and enable service
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl status postgresql
```

### 3. Install Redis Server

```bash
# Install Redis
sudo apt install -y redis-server

# Verify installation
redis-cli --version

# Start and enable service
sudo systemctl start redis-server
sudo systemctl enable redis-server
sudo systemctl status redis-server

# Test Redis
redis-cli ping  # Should respond PONG
```

### 4. Verify All Installations

```bash
# Test Node.js
node -e "console.log('Node.js works!')"

# Test npm
npm -v

# Test PostgreSQL
sudo -u postgres psql -c "SELECT version();"

# Test Redis
redis-cli -c "INFO" | head -5
```

---

## Project Setup

### 1. Clone or Copy Project

#### Option A: Clone from Git (if repo is on GitHub)

```bash
cd ~
git clone https://github.com/your-username/sneaker-api.git
cd sneaker-api
```

#### Option B: Copy Project Files

From your host machine:
```bash
scp -P 2222 -r /path/to/sneaker-api ubuntu@localhost:/home/ubuntu/
```

Then in VM:
```bash
cd ~/sneaker-api
```

### 2. Install Project Dependencies

```bash
# Install npm packages
npm install

# Verify critical packages installed
npm list express pg redis node-cron cheerio
```

### 3. Setup Environment Variables

Create `.env` file:

```bash
cp .env.example .env
nano .env
```

Configure for QEMU/local development:

```env
# Server Configuration
NODE_ENV=production
PORT=3000
API_BASE_URL=http://localhost:3000

# Database Configuration (PostgreSQL running locally)
DATABASE_URL=postgresql://sneaker:sneaker_password@localhost:5432/sneaker_prices
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sneaker_prices
DB_USER=sneaker
DB_PASSWORD=sneaker_password

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Convex Configuration (for API only, not needed for scraper)
CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_JWKS_URL=https://your-convex-deployment.convex.cloud/.well-known/jwks.json

# API Configuration
MAX_REQUESTS_PER_MINUTE=100
CACHE_TTL_SECONDS=7200

# Scraper Configuration
REQUEST_TIMEOUT_MS=10000
RETRY_ATTEMPTS=3

# Logging
LOG_LEVEL=info

# Scheduler (24/7 data collection)
ENABLE_SCHEDULER=true
TIER_1_CRON=0 6,12,18,0 * * *
TIER_2_CRON=0 14 * * *
TIER_3_CRON=0 10 * * 1,4
```

### 4. Create PostgreSQL Database & User

```bash
# Connect to PostgreSQL as postgres user
sudo -u postgres psql

# In PostgreSQL shell, create user and database:
CREATE USER sneaker WITH PASSWORD 'sneaker_password';
CREATE DATABASE sneaker_prices OWNER sneaker;
GRANT ALL PRIVILEGES ON DATABASE sneaker_prices TO sneaker;
\q
```

### 5. Initialize Database Schema

```bash
# Run migrations
npm run db:migrate

# Verify tables created
psql -U sneaker -d sneaker_prices -c "\dt"
```

### 6. Seed Initial Sneaker Data

```bash
# Add 15 popular sneakers
npm run db:seed

# Verify data
psql -U sneaker -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"
```

---

## Data Collection Configuration

### Configure Update Schedule

Edit `src/services/scheduler.ts` to adjust update frequency if needed:

```typescript
// Default schedule (in UTC):
// Tier 1: 6am, 12pm, 6pm, 12am  (4x daily)
// Tier 2: 2pm (1x daily)
// Tier 3: Monday & Thursday 10am (2x weekly)

// To change, edit .env:
TIER_1_CRON=0 6,12,18,0 * * *    # 4x daily
TIER_2_CRON=0 14 * * *            # 1x daily at 2pm
TIER_3_CRON=0 10 * * 1,4          # Mon & Thu at 10am
```

### Expand Sneaker Catalog (Optional)

Add more sneakers to track:

```bash
# Connect to database
psql -U sneaker -d sneaker_prices

# Add more sneakers manually:
INSERT INTO skus (sku_code, brand, model, colorway, tier) VALUES
  ('nike-dunk-low-vintage-green-2023', 'Nike', 'Dunk Low', 'Vintage Green', 2),
  ('adidas-yeezy-500-blush-2023', 'Adidas', 'Yeezy 500', 'Blush', 2),
  ('jordan-4-retro-military-black-2023', 'Nike', 'Air Jordan 4 Retro', 'Military Black', 1);

# Verify
SELECT COUNT(*) FROM skus;
\q
```

---

## Systemd Service Setup

### Create Systemd Service File

Create service to run scraper automatically on boot and handle restarts:

```bash
sudo nano /etc/systemd/system/sneaker-collector.service
```

Add this content:

```ini
[Unit]
Description=Sneaker Price Data Collector
Documentation=https://github.com/your-username/sneaker-api
After=postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/sneaker-api
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sneaker-collector

# Resource limits
MemoryMax=1G
CPUQuota=75%

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=yes

[Install]
WantedBy=multi-user.target
```

### Enable & Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (auto-start on boot)
sudo systemctl enable sneaker-collector

# Start service
sudo systemctl start sneaker-collector

# Verify service is running
sudo systemctl status sneaker-collector

# Watch logs in real-time
sudo journalctl -u sneaker-collector -f

# View logs for specific time period
sudo journalctl -u sneaker-collector --since "2 hours ago"
sudo journalctl -u sneaker-collector --since "today"
```

### Service Management Commands

```bash
# Check status
sudo systemctl status sneaker-collector

# Restart service
sudo systemctl restart sneaker-collector

# Stop service
sudo systemctl stop sneaker-collector

# View logs
sudo journalctl -u sneaker-collector -n 100  # Last 100 lines
sudo journalctl -u sneaker-collector -f      # Follow mode (tail -f)

# Check for errors
sudo journalctl -u sneaker-collector | grep ERROR
```

---

## Monitoring & Maintenance

### Monitor Data Collection Progress

Connect to database and check metrics:

```bash
# Connect to database
psql -U sneaker -d sneaker_prices

# View summary
SELECT
  (SELECT COUNT(*) FROM skus) as total_sneakers,
  (SELECT COUNT(*) FROM prices) as price_points,
  (SELECT COUNT(DISTINCT sku_id) FROM prices) as sneakers_with_data,
  (SELECT MAX(timestamp) FROM prices) as last_price_update;

# View prices by tier
SELECT
  s.tier,
  COUNT(DISTINCT s.id) as sneaker_count,
  COUNT(p.id) as price_points,
  MAX(p.timestamp) as last_update
FROM skus s
LEFT JOIN prices p ON s.id = p.sku_id
GROUP BY s.tier
ORDER BY s.tier;

# View data collection per source
SELECT
  source,
  COUNT(*) as price_points,
  MIN(timestamp) as first_record,
  MAX(timestamp) as last_record,
  AVG(price) as avg_price,
  MIN(price) as min_price,
  MAX(price) as max_price
FROM prices
GROUP BY source;

# Exit
\q
```

### Monitor System Resources

```bash
# Real-time monitoring
htop

# Disk usage
df -h

# Memory usage
free -h

# PostgreSQL size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('sneaker_prices'));"

# PostgreSQL connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'sneaker_prices';"
```

### Database Maintenance

```bash
# Optimize database (weekly)
sudo -u postgres psql -d sneaker_prices -c "VACUUM ANALYZE;"

# Rebuild indexes (monthly)
sudo -u postgres psql -d sneaker_prices -c "REINDEX DATABASE sneaker_prices;"

# Check database size
sudo -u postgres psql -d sneaker_prices -c "\l+ sneaker_prices"
```

### Automated Backup

Create backup script:

```bash
nano ~/backup-prices.sh
```

Add:

```bash
#!/bin/bash

BACKUP_DIR="/home/ubuntu/backups"
BACKUP_FILE="$BACKUP_DIR/sneaker_prices_$(date +%Y%m%d_%H%M%S).sql.gz"

mkdir -p $BACKUP_DIR

# Backup database
sudo -u postgres pg_dump sneaker_prices | gzip > $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "sneaker_prices_*.sql.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE"
```

Make executable and schedule:

```bash
chmod +x ~/backup-prices.sh

# Run daily at 2am
sudo crontab -e
# Add line: 0 2 * * * /home/ubuntu/backup-prices.sh
```

---

## Troubleshooting

### Service Won't Start

**Error**: `systemctl status sneaker-collector` shows failed

```bash
# Check logs for errors
sudo journalctl -u sneaker-collector -n 50

# Verify dependencies are running
sudo systemctl status postgresql
sudo systemctl status redis-server

# Check permissions
ls -la ~/sneaker-api/

# Try running manually
cd ~/sneaker-api
npm run dev
```

### Database Connection Refused

**Error**: `ECONNREFUSED 127.0.0.1:5432`

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Start it if not running
sudo systemctl start postgresql

# Test connection
psql -U sneaker -d sneaker_prices -c "SELECT 1"
```

### High Memory Usage

**Symptoms**: VM becomes slow or unresponsive

```bash
# Check process memory
ps aux | grep node

# Restart service
sudo systemctl restart sneaker-collector

# Check database size
du -sh /var/lib/postgresql/15/

# Archive old data if needed
psql -U sneaker -d sneaker_prices -c \
  "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '90 days';"
```

### Scraper Not Collecting Data

**Check**:
```bash
# View recent logs
sudo journalctl -u sneaker-collector | grep -i ebay

# Verify scheduler is enabled
grep "ENABLE_SCHEDULER" ~/sneaker-api/.env

# Check if update is scheduled to run
date  # Check current time
# Should be near 6am, 12pm, 6pm, or 12am for Tier 1
# Should be near 2pm for Tier 2

# Force manual test
cd ~/sneaker-api
npm run scraper:test
```

### Slow Queries

```bash
# Find slow queries
sudo -u postgres psql -d sneaker_prices -c \
  "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# If not available, enable:
sudo -u postgres psql -d postgres -c \
  "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

---

## Backup & Data Export

### Export Price Data

```bash
# Export as CSV
psql -U sneaker -d sneaker_prices -c \
  "COPY (SELECT * FROM prices) TO STDOUT WITH CSV HEADER" > prices.csv

# Export with joins (prices + SKU info)
psql -U sneaker -d sneaker_prices -c \
  "COPY (
    SELECT s.sku_code, s.brand, s.model, p.source, p.price, p.timestamp
    FROM prices p
    JOIN skus s ON p.sku_id = s.id
    ORDER BY p.timestamp DESC
  ) TO STDOUT WITH CSV HEADER" > prices_full.csv
```

### Export Full Database

```bash
# Full database backup
sudo -u postgres pg_dump sneaker_prices > sneaker_prices_full.sql

# Compressed backup
sudo -u postgres pg_dump sneaker_prices | gzip > sneaker_prices_full.sql.gz

# With custom format (faster for large databases)
sudo -u postgres pg_dump -Fc sneaker_prices > sneaker_prices.dump
```

### Copy Data to Host Machine

```bash
# From host machine:
scp -P 2222 ubuntu@localhost:/home/ubuntu/prices.csv ./
scp -P 2222 ubuntu@localhost:/home/ubuntu/sneaker_prices_full.sql.gz ./
```

### Import Backup

```bash
# Restore database
sudo -u postgres psql sneaker_prices < sneaker_prices_full.sql

# Or from compressed backup
sudo -u postgres psql sneaker_prices < <(gunzip -c sneaker_prices_full.sql.gz)

# Or from custom format
sudo -u postgres pg_restore -d sneaker_prices sneaker_prices.dump
```

---

## Expected Data Collection Timeline

### Week 1
- **Price Points**: ~13,600
- **Sneakers with Data**: 190+ of 200
- **Disk Used**: ~50 MB
- **Status**: Collecting initial data

### Month 1
- **Price Points**: ~54,400
- **Database Size**: ~200 MB
- **Confidence**: Medium (enough for trends)
- **Status**: Building price history

### Month 3
- **Price Points**: ~163,200
- **Database Size**: ~600 MB
- **Confidence**: High (3-month history)
- **Data Quality**: Excellent for analysis

### Month 6+
- **Price Points**: ~326,400+
- **Database Size**: ~1+ GB
- **Confidence**: Very High
- **Data Quality**: Professional-grade dataset

---

## Performance Optimization

### For Larger Datasets (3+ months)

```bash
# Add database indexes
psql -U sneaker -d sneaker_prices << EOF
CREATE INDEX idx_prices_sku_source_date ON prices(sku_id, source, timestamp DESC);
CREATE INDEX idx_price_history_sku_date ON price_history(sku_id, timestamp DESC);
VACUUM ANALYZE;
EOF

# Archive old prices (older than 6 months)
psql -U sneaker -d sneaker_prices -c \
  "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '180 days';"
```

### Limit VM Disk Growth

```bash
# Check disk usage
df -h

# If running low on space, archive to external drive
sudo -u postgres pg_dump sneaker_prices | gzip > /mnt/external/backup_$(date +%Y%m%d).sql.gz

# Then trim database
psql -U sneaker -d sneaker_prices -c \
  "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '60 days';"
```

---

## Running 24/7 Checklist

- [x] VM created with 4 GB RAM, 4 CPUs, 50 GB disk
- [x] Ubuntu Server 22.04 LTS installed
- [x] Node.js 18+ installed
- [x] PostgreSQL 15 installed and running
- [x] Redis installed and running
- [x] Project cloned/copied
- [x] Dependencies installed (`npm install`)
- [x] `.env` file configured
- [x] Database created and seeded
- [x] Systemd service created
- [x] Service enabled for auto-start
- [x] Service verified running
- [x] Data collection started
- [x] Monitoring dashboard setup
- [x] Backup script scheduled

---

## Quick Reference Commands

```bash
# Start everything
sudo systemctl start postgresql redis-server sneaker-collector

# Check status
sudo systemctl status sneaker-collector
sudo journalctl -u sneaker-collector -f

# View collected data
psql -U sneaker -d sneaker_prices

# Stop everything
sudo systemctl stop sneaker-collector redis-server postgresql

# Update code
cd ~/sneaker-api && git pull && npm install && sudo systemctl restart sneaker-collector

# Backup data
sudo -u postgres pg_dump sneaker_prices | gzip > sneaker_prices_$(date +%Y%m%d).sql.gz
```

---

## Next Steps After Data Collection

1. **Export Data** (after 1-2 months of collection):
   ```bash
   psql -U sneaker -d sneaker_prices -c \
     "COPY (SELECT * FROM prices) TO STDOUT WITH CSV HEADER" > prices.csv
   ```

2. **Analyze Data** in Python/Excel:
   - Price trends
   - Market volatility
   - Source accuracy (eBay vs GOAT)

3. **Deploy API Layer** to production when ready:
   - Copy database to production VPS
   - Enable Convex JWT authentication
   - Deploy REST API

4. **Connect Mobile App**:
   - Point Expo app to production API
   - Users can access live price data

---

## Support

For issues, check:
1. Service logs: `sudo journalctl -u sneaker-collector`
2. Database: `psql -U sneaker -d sneaker_prices`
3. System resources: `htop`
4. Network: `ping google.com` (from VM)

Questions? Check README.md and API_DOCUMENTATION.md in the project directory.
