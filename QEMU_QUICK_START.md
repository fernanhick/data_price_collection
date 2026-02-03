# QEMU Quick Start (TL;DR)

**Total time**: ~1 hour from blank VM to data collection

## 1. Create QEMU VM (10 min)

```bash
# Create 50GB disk
qemu-img create -f qcow2 sneaker.qcow2 50G

# Launch VM
qemu-system-x86_64 \
  -m 4096 -smp 4 -enable-kvm \
  -drive file=sneaker.qcow2,format=qcow2 \
  -cdrom ubuntu-22.04-live-server-amd64.iso \
  -net nic,model=virtio \
  -net user,hostfwd=tcp::2222-:22 \
  -name sneaker
```

Or use `virt-manager` GUI if preferred.

Install Ubuntu Server 22.04 LTS (enable SSH during install).

## 2. SSH In & Update System (5 min)

```bash
ssh -p 2222 ubuntu@localhost

sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential nano
```

## 3. Install Dependencies (15 min)

```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
  sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-15

# Redis
sudo apt install -y redis-server

# Verify
node --version && psql --version && redis-cli ping
```

## 4. Setup Project (15 min)

```bash
# Copy project (from host: scp -P 2222 -r ./sneaker-api ubuntu@localhost:~/)
cd ~/sneaker-api && npm install

# Create .env
cp .env.example .env
nano .env
# Update: DATABASE_URL, enable SCHEDULER
```

**Minimal .env**:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://sneaker:password@localhost:5432/sneaker_prices
DB_USER=sneaker
DB_PASSWORD=password
ENABLE_SCHEDULER=true
CONVEX_URL=http://localhost  # Dummy for scraper-only
CONVEX_JWKS_URL=http://localhost
```

## 5. Initialize Database (5 min)

```bash
# Create user & database
sudo -u postgres psql << EOF
CREATE USER sneaker WITH PASSWORD 'password';
CREATE DATABASE sneaker_prices OWNER sneaker;
GRANT ALL PRIVILEGES ON DATABASE sneaker_prices TO sneaker;
EOF

# Create tables
npm run db:migrate

# Add sneakers
npm run db:seed

# Verify
psql -U sneaker -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"
```

## 6. Start Service (5 min)

```bash
# Create systemd service
sudo tee /etc/systemd/system/sneaker-collector.service > /dev/null << EOF
[Unit]
Description=Sneaker Price Collector
After=postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/sneaker-api
ExecStart=/usr/bin/npm run dev
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Start
sudo systemctl daemon-reload
sudo systemctl enable sneaker-collector
sudo systemctl start sneaker-collector

# Verify running
sudo systemctl status sneaker-collector
sudo journalctl -u sneaker-collector -f
```

## Done! ✅

Your VM is now:
- ✅ Collecting eBay prices automatically
- ✅ Updating Tier 1 sneakers 4x daily
- ✅ Updating Tier 2 sneakers 1x daily
- ✅ Storing data in PostgreSQL
- ✅ Running 24/7 on system boot

## Monitor Data

```bash
# Watch collection progress
psql -U sneaker -d sneaker_prices -c \
  "SELECT COUNT(*) as prices, COUNT(DISTINCT sku_id) as sneakers \
   FROM prices;"

# View real-time logs
sudo journalctl -u sneaker-collector -f

# Check for errors
sudo journalctl -u sneaker-collector | grep ERROR
```

## Common Commands

| Command | What it does |
|---------|------------|
| `sudo systemctl restart sneaker-collector` | Restart data collection |
| `sudo journalctl -u sneaker-collector -f` | Watch logs live |
| `psql -U sneaker -d sneaker_prices` | Connect to database |
| `sudo systemctl stop sneaker-collector` | Stop collection |

## After 1 Week

```bash
# Check collected data
psql -U sneaker -d sneaker_prices << EOF
SELECT
  COUNT(*) as total_prices,
  COUNT(DISTINCT sku_id) as sneakers_tracked,
  MAX(timestamp) as last_update,
  MIN(timestamp) as first_update
FROM prices;
EOF
```

**Expected**: 10,000-15,000 price points across 180+ sneakers ✅

## Export Data to Host

```bash
# From VM
psql -U sneaker -d sneaker_prices -c \
  "COPY (SELECT * FROM prices) TO STDOUT WITH CSV HEADER" > ~/prices.csv

# From host
scp -P 2222 ubuntu@localhost:~/prices.csv ./
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Connection refused" | `sudo systemctl start postgresql` |
| Service won't start | `sudo journalctl -u sneaker-collector -n 50` |
| No data collected | Check logs: `sudo journalctl -u sneaker-collector \| grep ERROR` |
| Disk full | Archive old data: `DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '60 days';` |

---

**That's it!** Your 24/7 price collector is running. 🎉
