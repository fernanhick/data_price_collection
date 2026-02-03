# QEMU Troubleshooting & FAQ

Solutions to common issues when running Sneaker Collector in QEMU.

## Network & Connectivity

### Can't SSH into VM

**Problem**: `ssh: connect to host localhost port 2222: Connection refused`

**Solutions**:

1. **Check port forwarding in QEMU**:
   ```bash
   # When launching QEMU, ensure you have:
   -net user,hostfwd=tcp::2222-:22
   ```

2. **Check SSHD running in VM**:
   ```bash
   # In VM console
   sudo systemctl status ssh
   sudo systemctl start ssh
   ```

3. **Check VM is actually running**:
   ```bash
   # From host
   ps aux | grep qemu
   ```

4. **Try different port**:
   ```bash
   # Launch QEMU with different port
   -net user,hostfwd=tcp::2223-:22
   ssh -p 2223 ubuntu@localhost
   ```

**Prevention**: Enable SSH during Ubuntu installation step.

---

### VM Can't Access Internet

**Problem**: `ping google.com` fails in VM

**Symptoms**:
- `npm install` fails
- Can't `apt update`
- Scraper can't reach eBay

**Solutions**:

1. **Check network interface**:
   ```bash
   # In VM
   ip link show
   ip addr show
   # Should see eth0 or similar with IP address
   ```

2. **If no IP address, restart networking**:
   ```bash
   sudo systemctl restart networking
   # or
   sudo netplan apply
   ```

3. **Check DNS**:
   ```bash
   cat /etc/resolv.conf
   # Should have nameserver entries

   nslookup google.com
   ```

4. **Manually set DNS** if needed:
   ```bash
   sudo nano /etc/netplan/00-installer-config.yaml
   ```

   Add:
   ```yaml
   network:
     version: 2
     ethernets:
       eth0:
         dhcp4: true
         dhcp4-overrides:
           use-dns: false
         nameservers:
           addresses: [8.8.8.8, 8.8.4.4]
   ```

   Then:
   ```bash
   sudo netplan apply
   ```

5. **Check QEMU network settings**:
   ```bash
   # If using libvirt, check default network
   sudo virsh net-list
   sudo virsh net-start default
   ```

---

## Database Issues

### PostgreSQL Won't Start

**Problem**: `sudo systemctl start postgresql` fails

**Check status**:
```bash
sudo systemctl status postgresql
sudo journalctl -xe  # Detailed error log
```

**Solutions**:

1. **Check disk space**:
   ```bash
   df -h /var/lib/postgresql
   # If < 100MB free, expand disk or clean up
   ```

2. **Check data directory**:
   ```bash
   sudo ls -la /var/lib/postgresql/15/main/
   sudo chown postgres:postgres /var/lib/postgresql/15/main/
   ```

3. **Recover from unclean shutdown**:
   ```bash
   sudo -u postgres /usr/lib/postgresql/15/bin/postgres \
     --single -D /var/lib/postgresql/15/main/
   # Type 'q' to exit
   ```

4. **Reinstall PostgreSQL** (last resort):
   ```bash
   sudo apt remove postgresql-15
   sudo apt install postgresql-15
   ```

---

### Database Connection Refused

**Problem**: `psql: error: connection to server at "localhost" (127.0.0.1), port 5432 failed`

**Solutions**:

1. **Verify PostgreSQL is running**:
   ```bash
   sudo systemctl status postgresql
   ```

2. **Check pg_hba.conf** (access control):
   ```bash
   sudo nano /etc/postgresql/15/main/pg_hba.conf
   # Should have line: local   all             all                                     trust
   # And: host    all             all             127.0.0.1/32            md5
   ```

3. **Check listening address**:
   ```bash
   sudo nano /etc/postgresql/15/main/postgresql.conf
   # Uncomment and set: listen_addresses = 'localhost'
   # Then restart: sudo systemctl restart postgresql
   ```

4. **Try as postgres user**:
   ```bash
   sudo -u postgres psql
   # Should work. If it does, issue is permissions
   ```

---

### Can't Connect with Username/Password

**Problem**: `psql: error: fe_sendauth: no password supplied` or `FATAL: Ident authentication failed`

**Solution**: Check pg_hba.conf and set correct auth method:

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Find this line:
local   all             all                                     peer

# Change to:
local   all             all                                     md5

# Restart:
sudo systemctl restart postgresql

# Now try:
psql -U sneaker -d sneaker_prices -W  # -W prompts for password
```

---

### Database Disk Space Growing Too Fast

**Problem**: Disk usage at 80%+, mostly from PostgreSQL

**Check size**:
```bash
sudo -u postgres psql << EOF
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
EOF
```

**Solutions**:

1. **Archive old prices** (keep last 3 months):
   ```bash
   psql -U sneaker -d sneaker_prices -c \
     "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '90 days';"
   ```

2. **Vacuum database** (reclaim space):
   ```bash
   sudo -u postgres psql -d sneaker_prices -c "VACUUM FULL;"
   ```

3. **Expand VM disk**:
   ```bash
   # Shutdown VM first
   qemu-img resize sneaker.qcow2 +20G

   # In VM, grow partition
   sudo growpart /dev/vda 1
   sudo resize2fs /dev/vda1
   ```

---

## Service & Scheduler Issues

### Service Shows as "Inactive"

**Problem**: `sudo systemctl status sneaker-collector` shows inactive/dead

**Solutions**:

1. **Check logs**:
   ```bash
   sudo journalctl -u sneaker-collector -n 100
   ```

2. **Verify dependencies**:
   ```bash
   sudo systemctl status postgresql
   sudo systemctl status redis-server
   # Both should be running
   ```

3. **Check file permissions**:
   ```bash
   ls -la ~/sneaker-api/
   # Should be owned by ubuntu user
   sudo chown -R ubuntu:ubuntu ~/sneaker-api/
   ```

4. **Test manually**:
   ```bash
   cd ~/sneaker-api
   npm run dev
   # Should start without errors
   ```

5. **Restart service**:
   ```bash
   sudo systemctl restart sneaker-collector
   sudo journalctl -u sneaker-collector -f
   ```

---

### Scraper Not Running on Schedule

**Problem**: Logs show no scraper activity, prices not updating

**Check scheduler**:
```bash
# View logs for scheduled tasks
sudo journalctl -u sneaker-collector | grep -i "tier\|cron\|schedule"

# Check current time
date

# Should match one of:
# Tier 1: 6:00, 12:00, 18:00, 0:00 UTC
# Tier 2: 14:00 UTC
# Tier 3: Monday/Thursday 10:00 UTC
```

**Solutions**:

1. **Verify scheduler enabled in .env**:
   ```bash
   grep ENABLE_SCHEDULER ~/sneaker-api/.env
   # Should be: ENABLE_SCHEDULER=true
   ```

2. **Check cron expressions**:
   ```bash
   grep "CRON" ~/sneaker-api/.env
   # TIER_1_CRON=0 6,12,18,0 * * *    (4x daily)
   # TIER_2_CRON=0 14 * * *            (1x daily)
   # TIER_3_CRON=0 10 * * 1,4          (2x weekly)
   ```

3. **Check system timezone**:
   ```bash
   timedatectl
   # Schedules are in UTC. If VM is different TZ, times won't match

   # Set to UTC if needed:
   sudo timedatectl set-timezone UTC
   ```

4. **Force manual update** to test:
   ```bash
   cd ~/sneaker-api
   npm run scraper:test
   ```

5. **Restart service**:
   ```bash
   sudo systemctl restart sneaker-collector
   ```

---

## Scraper Issues

### Scraper Returns No Data

**Problem**: `npm run scraper:test` runs but finds no listings

**Causes & Solutions**:

1. **Network connectivity**:
   ```bash
   curl -I https://www.ebay.com
   # Should return 200 OK
   ```

2. **eBay blocking your IP**:
   - Add delay between requests (already done, see `http.ts`)
   - Check logs for 429/403 errors:
     ```bash
     sudo journalctl -u sneaker-collector | grep -i "429\|403"
     ```
   - Wait a few hours before retrying

3. **Search query issues**:
   - Try manual search on eBay.com for same query
   - If nothing found there, nothing will be found by scraper

4. **HTML parsing failure**:
   - eBay may have changed HTML structure
   - Check logs for parsing errors
   - Update selectors in `src/services/scrapers/ebay.ts`

**Test with manual query**:
```bash
cd ~/sneaker-api
cat > test-ebay.js << 'EOF'
const { EbayScraper } = require('./dist/src/services/scrapers/ebay');
const scraper = new EbayScraper();

(async () => {
  try {
    const results = await scraper.searchSoldListings('Nike Jordan 1 Bred', 5);
    console.log('Results:', results);
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
EOF

npm run build
node test-ebay.js
```

---

### High Memory Usage by Node.js

**Problem**: `node` process consuming 2GB+ RAM

**Check**:
```bash
ps aux | grep node
top -p <PID>  # Monitor specific process
```

**Solutions**:

1. **Increase Node.js memory limit**:
   ```bash
   # Edit service file
   sudo nano /etc/systemd/system/sneaker-collector.service

   # Change ExecStart to:
   ExecStart=/usr/bin/node --max-old-space-size=512 /usr/bin/npm run dev

   # Restart:
   sudo systemctl daemon-reload
   sudo systemctl restart sneaker-collector
   ```

2. **Reduce price history retention**:
   ```bash
   psql -U sneaker -d sneaker_prices -c \
     "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '30 days';"
   ```

3. **Restart service weekly**:
   ```bash
   # Add to crontab
   0 3 * * 0 sudo systemctl restart sneaker-collector
   # Restarts every Sunday at 3am
   ```

---

## Disk & Storage Issues

### Running Out of Disk Space

**Problem**: `No space left on device`

**Check usage**:
```bash
df -h
du -sh /*  # Show top-level directory sizes
du -sh ~/sneaker-api/
sudo du -sh /var/lib/postgresql/
```

**Solutions**:

1. **Clean up package cache**:
   ```bash
   npm cache clean --force
   sudo apt clean
   ```

2. **Archive old data**:
   ```bash
   psql -U sneaker -d sneaker_prices << EOF
   DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '30 days';
   DELETE FROM price_history WHERE timestamp < NOW() - INTERVAL '60 days';
   VACUUM FULL;
   EOF
   ```

3. **Expand VM disk**:
   ```bash
   # Shutdown VM
   sudo systemctl stop sneaker-collector
   sudo systemctl stop postgresql

   # Resize disk image (add 20GB)
   qemu-img resize sneaker.qcow2 +20G

   # Start VM
   sudo systemctl start postgresql
   sudo systemctl start sneaker-collector

   # Grow filesystem
   sudo growpart /dev/vda 1
   sudo resize2fs /dev/vda1

   # Verify
   df -h
   ```

---

## Performance Issues

### VM Running Slowly

**Check resources**:
```bash
htop  # Press q to quit
free -h
df -h
```

**Solutions**:

1. **If CPU bound**: Reduce scraper threads (already minimal, but check logs)
2. **If memory bound**: Archive old data, restart service
3. **If disk bound**: Check for large files, clean cache
4. **Allocate more resources** to VM in QEMU settings (up to available host resources)

---

## Backup & Recovery

### Backup Database

```bash
# Quick backup
sudo -u postgres pg_dump sneaker_prices > ~/backup.sql

# Compressed backup
sudo -u postgres pg_dump sneaker_prices | gzip > ~/backup.sql.gz

# With custom format (faster)
sudo -u postgres pg_dump -Fc sneaker_prices > ~/backup.dump

# Copy to host
scp -P 2222 ubuntu@localhost:~/backup.sql.gz ./
```

### Restore Database

```bash
# From SQL backup
sudo -u postgres psql sneaker_prices < backup.sql

# From compressed
sudo -u postgres psql sneaker_prices < <(gunzip -c backup.sql.gz)

# From custom format
sudo -u postgres pg_restore -d sneaker_prices backup.dump
```

### Full VM Backup

```bash
# Shutdown VM first
qemu-img convert -f qcow2 -O raw sneaker.qcow2 sneaker.img

# Compress
gzip sneaker.img

# Store safely
ls -lh sneaker.img.gz
```

---

## When to Restart VM

**Recommended**: Once per month

```bash
# Stop services gracefully
sudo systemctl stop sneaker-collector
sudo systemctl stop postgresql

# Shutdown
sudo shutdown -h now

# After reboot, services auto-start:
sudo systemctl status sneaker-collector
sudo systemctl status postgresql
```

---

## Getting Help

**Check logs first**:
```bash
# Service logs
sudo journalctl -u sneaker-collector -n 200

# System logs
sudo journalctl -n 100

# PostgreSQL logs
sudo -u postgres psql -d sneaker_prices -c "SELECT * FROM pg_database_xlog_location();"
```

**Common log patterns**:
- `ECONNREFUSED` = PostgreSQL not running
- `TIMEOUT` = Network issue
- `429` = Rate limited by eBay
- `Memory limit` = Need more RAM

---

## Quick Fixes Checklist

```bash
# When things go wrong, try in order:

# 1. Check if all services running
sudo systemctl status postgresql redis-server sneaker-collector

# 2. View error logs
sudo journalctl -u sneaker-collector -n 50 | grep ERROR

# 3. Restart services
sudo systemctl restart postgresql
sudo systemctl restart redis-server
sudo systemctl restart sneaker-collector

# 4. Check database
psql -U sneaker -d sneaker_prices -c "SELECT COUNT(*) FROM prices;"

# 5. Test scraper manually
cd ~/sneaker-api && npm run scraper:test

# 6. Full restart (nuclear option)
sudo systemctl stop sneaker-collector
sleep 5
sudo systemctl start postgresql
sleep 10
sudo systemctl start redis-server
sleep 5
sudo systemctl start sneaker-collector
```

---

**Still stuck?** Check:
1. QEMU_SETUP_GUIDE.md - Comprehensive setup
2. QEMU_QUICK_START.md - Minimal quick start
3. DEVELOPMENT_GUIDE.md - Local development
4. README.md - General info

Good luck! 🚀
