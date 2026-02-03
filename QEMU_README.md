# QEMU Setup - Complete Guide Index

This directory contains comprehensive documentation for running the Sneaker Price Collector in a QEMU virtual machine for 24/7 data collection.

## Quick Links

| Document | Purpose | Time |
|----------|---------|------|
| **[QEMU_QUICK_START.md](./QEMU_QUICK_START.md)** | Fast setup from scratch | 1 hour |
| **[QEMU_SETUP_GUIDE.md](./QEMU_SETUP_GUIDE.md)** | Detailed step-by-step guide | Reference |
| **[QEMU_TROUBLESHOOTING.md](./QEMU_TROUBLESHOOTING.md)** | Solutions to common issues | As needed |

## What This Is For

Running a dedicated 24/7 data collection machine that:
- ✅ Scrapes eBay for real-time sneaker prices
- ✅ Stores historical price data in PostgreSQL
- ✅ Automatically updates prices on schedule (Tier 1: 4x daily, Tier 2: daily, Tier 3: 2x weekly)
- ✅ Requires no manual intervention after setup
- ✅ Can run on any computer with QEMU

## Why Use QEMU?

| Reason | Benefit |
|--------|---------|
| **Isolated** | Don't affect your main system |
| **Portable** | Move .qcow2 file between machines |
| **Snapshot** | Easy to backup and restore |
| **24/7** | Leave VM running, collect data continuously |
| **Free** | QEMU and all dependencies are open-source |

## System Requirements (Host Computer)

| Requirement | Recommended | Minimum |
|-------------|------------|---------|
| **RAM** | 8 GB available | 4 GB available |
| **Disk** | 100 GB free space | 50 GB free space |
| **CPU** | 4+ cores | 2+ cores |
| **OS** | Linux, macOS, Windows | Linux, macOS, Windows |
| **Software** | QEMU 4.0+, virt-manager | QEMU 4.0+ |

## Step 1: Start Here

**First time setting up?** Go to [QEMU_QUICK_START.md](./QEMU_QUICK_START.md)

It's a TL;DR version that gets you from "blank VM" to "collecting data" in ~1 hour.

## Step 2: Reference

**Need detailed explanations?** Go to [QEMU_SETUP_GUIDE.md](./QEMU_SETUP_GUIDE.md)

It covers:
- VM creation with proper specs
- Installing all dependencies
- Database setup and configuration
- Systemd service setup for 24/7 operation
- Monitoring and maintenance
- Data backup and export

## Step 3: Troubleshooting

**Something's broken?** Go to [QEMU_TROUBLESHOOTING.md](./QEMU_TROUBLESHOOTING.md)

It has solutions for:
- Network connectivity issues
- Database connection problems
- Service not starting
- Scraper not collecting data
- Disk space issues
- Performance problems

## Expected Timeline

### **Before Setup** (Pick one)
- [ ] Install QEMU: `sudo apt install qemu-system-x86_64` (Linux) or `brew install qemu` (macOS)
- [ ] Or install virt-manager for GUI: `sudo apt install virt-manager`
- [ ] Download Ubuntu 22.04 LTS ISO (~3.3 GB)

### **Setup Phase** (~1 hour)
- [ ] Create QEMU VM (10 min)
- [ ] Install Ubuntu Server (15 min)
- [ ] Install dependencies (15 min)
- [ ] Setup project (15 min)
- [ ] Start data collection (5 min)

### **Verify Phase** (ongoing)
- [ ] Check logs: `sudo journalctl -u sneaker-collector -f`
- [ ] Check database: `psql -U sneaker -d sneaker_prices -c "SELECT COUNT(*) FROM prices;"`
- [ ] Wait for first scheduled update (6am, 12pm, 6pm, or 12am UTC, or 2pm UTC for Tier 2)

### **After 1 Week**
- [ ] ~13,600 price points collected
- [ ] 180+ sneakers tracked
- [ ] Database ~50 MB

### **After 1 Month**
- [ ] ~54,400 price points
- [ ] Database ~200 MB
- [ ] Enough data for trend analysis

## Minimal Setup (Copy-Paste)

If you're confident, this is the absolute minimum:

```bash
# 1. Create VM
qemu-img create -f qcow2 sneaker.qcow2 50G
qemu-system-x86_64 -m 4096 -smp 4 -enable-kvm \
  -drive file=sneaker.qcow2,format=qcow2 \
  -cdrom ubuntu-22.04-live-server-amd64.iso \
  -net user,hostfwd=tcp::2222-:22 -name sneaker

# Install Ubuntu Server, then:

# 2. SSH in
ssh -p 2222 ubuntu@localhost

# 3. Install everything
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs postgresql-15 redis-server git
cd ~ && git clone <your-repo> sneaker-api && cd sneaker-api

# 4. Setup
npm install
cp .env.example .env
# Edit .env with your database config

# 5. Create database
sudo -u postgres psql << EOF
CREATE USER sneaker WITH PASSWORD 'password';
CREATE DATABASE sneaker_prices OWNER sneaker;
GRANT ALL PRIVILEGES ON DATABASE sneaker_prices TO sneaker;
EOF

npm run db:migrate
npm run db:seed

# 6. Create service
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

# 7. Start
sudo systemctl daemon-reload
sudo systemctl enable sneaker-collector
sudo systemctl start sneaker-collector

# Done! Monitor:
sudo journalctl -u sneaker-collector -f
```

## File Descriptions

### Documentation Files

```
QEMU_README.md (this file)
├─ Overview and quick navigation
├─ System requirements
└─ Links to other guides

QEMU_QUICK_START.md
├─ TL;DR version
├─ Minimal setup steps
├─ Expected results
└─ Common commands

QEMU_SETUP_GUIDE.md
├─ Comprehensive step-by-step
├─ VM creation details
├─ All configuration options
├─ Monitoring and maintenance
├─ Backup strategies
└─ Optimization tips

QEMU_TROUBLESHOOTING.md
├─ Network issues
├─ Database problems
├─ Service failures
├─ Scraper issues
├─ Performance problems
├─ Recovery procedures
└─ Quick fix checklist
```

### Project Files

The project includes everything needed:
- `src/services/scrapers/ebay.ts` - eBay scraper
- `src/services/scheduler.ts` - Tier-based scheduler
- `src/db/schema.ts` - PostgreSQL schema
- `.env.example` - Configuration template

## Key Directories in VM

```
/home/ubuntu/
├── sneaker-api/          # Project code
│   ├── src/
│   ├── dist/             # Compiled code
│   ├── package.json
│   └── .env              # Your configuration
├── backups/              # Database backups
└── prices.csv            # Exported data
```

## Monitoring Checklist

After setup, verify regularly:

```bash
# Every day:
sudo journalctl -u sneaker-collector | grep ERROR

# Every week:
psql -U sneaker -d sneaker_prices << EOF
SELECT
  COUNT(*) as total_prices,
  COUNT(DISTINCT sku_id) as sneakers_tracked,
  MAX(timestamp) as last_update
FROM prices;
EOF

# Every month:
df -h  # Check disk usage
sudo -u postgres psql -d sneaker_prices -c "VACUUM ANALYZE;"
```

## Common Tasks

### Check if data is being collected

```bash
sudo journalctl -u sneaker-collector -f
# Should see logs like: "Fetching prices for..." and "✅ Successfully fetched"
```

### Restart the scraper

```bash
sudo systemctl restart sneaker-collector
```

### Stop the scraper

```bash
sudo systemctl stop sneaker-collector
```

### View collected data

```bash
psql -U sneaker -d sneaker_prices
# Then SQL queries like: SELECT COUNT(*) FROM prices;
```

### Export data to CSV

```bash
psql -U sneaker -d sneaker_prices -c \
  "COPY (SELECT * FROM prices) TO STDOUT WITH CSV HEADER" > prices.csv
```

### Backup database

```bash
sudo -u postgres pg_dump sneaker_prices | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Update project code

```bash
cd ~/sneaker-api
git pull
npm install
sudo systemctl restart sneaker-collector
```

## When to Consult Each Document

| Situation | Read |
|-----------|------|
| "I'm new, where do I start?" | QEMU_QUICK_START.md |
| "I need detailed setup steps" | QEMU_SETUP_GUIDE.md |
| "Something isn't working" | QEMU_TROUBLESHOOTING.md |
| "How do I do X?" | Use Ctrl+F to search all docs |

## Pro Tips

1. **Snapshot your VM** after successful setup:
   ```bash
   qemu-img snapshot -c "working-v1" sneaker.qcow2
   ```
   Then you can roll back if something breaks.

2. **Keep backups**:
   ```bash
   sudo -u postgres pg_dump sneaker_prices | gzip > ~/backup_$(date +%Y%m%d).sql.gz
   ```

3. **Monitor disk usage** on VM:
   ```bash
   df -h /var/lib/postgresql
   ```
   If > 80%, archive old data.

4. **Set CPU/Memory limits** in systemd service to prevent VM slowdowns:
   ```ini
   MemoryMax=2G
   CPUQuota=75%
   ```

5. **Export data regularly** to host machine:
   ```bash
   # Copy prices to host every month
   scp -P 2222 ubuntu@localhost:~/prices.csv ./prices_$(date +%Y%m%d).csv
   ```

## Next Steps After Data Collection

Once you have 1-2 months of data:

1. **Analyze**: Use Python, Excel, or R to analyze price trends
2. **Export**: `psql ... COPY ... TO prices.csv`
3. **Deploy API**: If ready, deploy REST API to production
4. **Connect App**: Point Expo app to production API for live prices

## Support Resources

- **Network issues?** → QEMU_TROUBLESHOOTING.md - Network & Connectivity
- **Database problems?** → QEMU_TROUBLESHOOTING.md - Database Issues
- **Scraper not working?** → QEMU_TROUBLESHOOTING.md - Scraper Issues
- **Want to learn more?** → QEMU_SETUP_GUIDE.md - Full details
- **Need quick reference?** → QEMU_QUICK_START.md - TL;DR

## Success Indicators

Your setup is working if you see:

✅ Service running: `sudo systemctl status sneaker-collector` shows "active (running)"
✅ Data collected: `psql ... -c "SELECT COUNT(*) FROM prices;"` shows > 0
✅ Logs clean: `sudo journalctl -u sneaker-collector` shows no ERROR entries
✅ Regular updates: Timestamps in database update every 6 hours (Tier 1)

## Still Have Questions?

1. **Read the relevant guide** (Quick Start, Setup, or Troubleshooting)
2. **Search the documentation** for your keywords
3. **Check the logs**: `sudo journalctl -u sneaker-collector`
4. **Test manually**: `cd ~/sneaker-api && npm run scraper:test`

---

**Ready to start?** → Go to [QEMU_QUICK_START.md](./QEMU_QUICK_START.md) 🚀

**Want detailed instructions?** → Go to [QEMU_SETUP_GUIDE.md](./QEMU_SETUP_GUIDE.md) 📚

**Something broken?** → Go to [QEMU_TROUBLESHOOTING.md](./QEMU_TROUBLESHOOTING.md) 🔧
