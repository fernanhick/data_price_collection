# Home Server + QEMU Setup Guide

Complete guide for running the Sneaker Price Collector in a QEMU VM on your physical Ubuntu home server, accessible via SSH.

## Architecture

```
┌─────────────────────────────────────┐
│   Your Home Server (Ubuntu)         │
│   ├─ QEMU/libvirt installed        │
│   ├─ Runs 24/7                     │
│   └─ SSH accessible                │
│       └─ QEMU VM (Ubuntu)           │
│           └─ Sneaker Collector     │
│               ├─ Node.js           │
│               ├─ PostgreSQL        │
│               └─ Redis             │
└─────────────────────────────────────┘
       ↑
       │ SSH tunnel
       │
Your Computer (access remotely)
```

---

## Prerequisites

### Host Machine (Physical Server)

- Ubuntu 20.04 LTS or newer (22.04 LTS recommended)
- 8+ GB RAM available
- 100+ GB free disk space
- 4+ CPU cores
- SSH server running and accessible
- Stable internet connection (24/7)
- Power supply (UPS recommended for outage protection)

### Guest VM Requirements

- 4 GB RAM (can share with host)
- 2+ CPU cores
- 50 GB disk space
- Ubuntu 22.04 LTS

---

## Part 1: Prepare Your Home Server

### 1.1 Check Server Status

```bash
# SSH into your home server
ssh user@home-server-ip

# Check system info
uname -a
free -h
df -h
lscpu

# Check if QEMU already installed
which qemu-system-x86_64
which virsh
```

### 1.2 Install QEMU & Virtualization Tools

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install QEMU and libvirt
sudo apt install -y \
  qemu-system-x86_64 \
  qemu-utils \
  libvirt-daemon-system \
  libvirt-clients \
  virt-manager \
  bridge-utils \
  virt-viewer

# Verify installation
qemu-system-x86_64 --version
virsh --version

# Add your user to libvirt group (for non-root access)
sudo usermod -aG libvirt $USER
sudo usermod -aG kvm $USER

# Log out and back in for group to take effect
exit
ssh user@home-server-ip
```

### 1.3 Start Virtualization Services

```bash
# Start libvirt daemon
sudo systemctl start libvirtd
sudo systemctl enable libvirtd

# Verify running
sudo systemctl status libvirtd

# Check virtual networks
virsh net-list
# Should see "default" network
```

### 1.4 Create Storage Directory for VMs

```bash
# Create directory for VM images
sudo mkdir -p /var/lib/libvirt/images/sneaker-collector
sudo chown $USER:$USER /var/lib/libvirt/images/sneaker-collector

# Or on a different partition if you have limited /var space
mkdir -p ~/vms/sneaker-collector
```

---

## Part 2: Download and Create QEMU VM

### 2.1 Download Ubuntu ISO

```bash
# Download Ubuntu 22.04 LTS (3.3 GB)
cd ~/vms/
wget https://releases.ubuntu.com/22.04/ubuntu-22.04-live-server-amd64.iso

# Verify checksum
wget https://releases.ubuntu.com/22.04/SHA256SUMS
sha256sum -c SHA256SUMS 2>&1 | grep ubuntu-22.04-live-server-amd64.iso
```

### 2.2 Create VM Disk Image

```bash
# Create 50GB disk image
qemu-img create -f qcow2 ~/vms/sneaker-collector/disk.qcow2 50G

# Verify
ls -lh ~/vms/sneaker-collector/disk.qcow2
```

### 2.3 Launch QEMU VM for Installation

```bash
# Start VM with ISO
qemu-system-x86_64 \
  -m 4096 \
  -smp 4 \
  -enable-kvm \
  -drive file=$HOME/vms/sneaker-collector/disk.qcow2,format=qcow2 \
  -cdrom $HOME/vms/sneaker-collector/ubuntu-22.04-live-server-amd64.iso \
  -net nic,model=virtio \
  -net user,hostfwd=tcp:127.0.0.1:2222-:22 \
  -name sneaker-collector \
  -display gtk
```

**Note**: If you don't have a display server (headless server), use `-display none` and `vnc`:
```bash
qemu-system-x86_64 ... -display none -vnc :1
# Then connect from your computer with VNC viewer to home-server-ip:5901
```

### 2.4 Install Ubuntu Server

1. Choose **Ubuntu Server 22.04 LTS**
2. Configure:
   - **Language**: English
   - **Keyboard**: Your locale
   - **Network**: Auto-configure (DHCP)
   - **Storage**: Use entire disk
   - **User account**: Create account
   - **SSH**: Enable OpenSSH server (important!)
   - **Packages**: No extra packages
3. Let it install and reboot
4. Shutdown when done: `sudo shutdown -h now`

---

## Part 3: Configure VM for Permanent Running

### 3.1 Create Permanent QEMU Service

Instead of manually running QEMU each time, create a systemd service on your home server:

```bash
# Create service file
sudo nano /etc/systemd/system/sneaker-collector-qemu.service
```

Add this content:

```ini
[Unit]
Description=Sneaker Collector QEMU VM
After=libvirtd.service
Requires=libvirtd.service

[Service]
Type=simple
User=your-username
ExecStart=/usr/bin/qemu-system-x86_64 \
  -m 4096 \
  -smp 4 \
  -enable-kvm \
  -drive file=/home/your-username/vms/sneaker-collector/disk.qcow2,format=qcow2 \
  -net nic,model=virtio \
  -net user,hostfwd=tcp:127.0.0.1:2222-:22 \
  -name sneaker-collector \
  -display none \
  -daemonize

ExecStop=/usr/bin/killall qemu-system-x86_64
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Replace**: `your-username` with your actual username

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable sneaker-collector-qemu
sudo systemctl start sneaker-collector-qemu

# Verify
sudo systemctl status sneaker-collector-qemu
sudo journalctl -u sneaker-collector-qemu -f
```

### 3.2 Verify VM is Running

```bash
# Wait 30 seconds for VM to boot, then test SSH
ssh -p 2222 ubuntu@localhost

# If successful, you're in the VM!
# Continue with Part 4
```

---

## Part 4: Setup Sneaker Collector Inside VM

### 4.1 Initial VM Setup (from inside VM via SSH)

```bash
# SSH into VM from home server
ssh -p 2222 ubuntu@localhost

# Update system
sudo apt update && sudo apt upgrade -y

# Install utilities
sudo apt install -y curl wget git build-essential nano htop
```

### 4.2 Install Dependencies

```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib-15

# Redis
sudo apt install -y redis-server

# Start services
sudo systemctl start postgresql redis-server
sudo systemctl enable postgresql redis-server

# Verify
node --version
psql --version
redis-cli ping
```

### 4.3 Copy Project to VM

**From your home server (not inside VM):**

```bash
# Copy project to VM via SSH
scp -P 2222 -r ~/sneaker-api ubuntu@localhost:/home/ubuntu/

# Or if you prefer git clone inside VM:
ssh -p 2222 ubuntu@localhost
git clone https://github.com/your-username/sneaker-api.git
```

### 4.4 Setup Project (inside VM)

```bash
# SSH into VM
ssh -p 2222 ubuntu@localhost

# Navigate to project
cd ~/sneaker-api
npm install

# Create .env file
cp .env.example .env
nano .env
```

Configure .env:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://sneaker:password@localhost:5432/sneaker_prices
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sneaker_prices
DB_USER=sneaker
DB_PASSWORD=your_secure_password

REDIS_URL=redis://localhost:6379
CONVEX_URL=http://localhost
CONVEX_JWKS_URL=http://localhost

ENABLE_SCHEDULER=true
TIER_1_CRON=0 6,12,18,0 * * *
TIER_2_CRON=0 14 * * *
TIER_3_CRON=0 10 * * 1,4
```

### 4.5 Initialize Database

```bash
# Create PostgreSQL user and database
sudo -u postgres psql << EOF
CREATE USER sneaker WITH PASSWORD 'your_secure_password';
CREATE DATABASE sneaker_prices OWNER sneaker;
GRANT ALL PRIVILEGES ON DATABASE sneaker_prices TO sneaker;
\q
EOF

# Run migrations
npm run db:migrate

# Seed data
npm run db:seed

# Verify
psql -U sneaker -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"
```

### 4.6 Create Systemd Service (inside VM)

```bash
# Create service file
sudo nano /etc/systemd/system/sneaker-collector.service
```

Add:
```ini
[Unit]
Description=Sneaker Price Collector
After=postgresql.service redis.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/sneaker-api
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryMax=1G
CPUQuota=75%

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable sneaker-collector
sudo systemctl start sneaker-collector

# Verify
sudo systemctl status sneaker-collector
sudo journalctl -u sneaker-collector -f
```

---

## Part 5: Remote Access from Your Computer

### 5.1 SSH Tunnel for Database Access

To access the database from your computer without exposing it to the internet:

```bash
# From your computer, create SSH tunnel
ssh -L 5432:127.0.0.1:5432 user@home-server-ip

# Now you can connect locally
psql -h localhost -U sneaker -d sneaker_prices

# Keep this terminal open while using the tunnel
```

Or add to ~/.ssh/config:
```
Host sneaker-home
  HostName your-home-server-ip
  User your-username
  LocalForward 5432 127.0.0.1:5432
  LocalForward 6379 127.0.0.1:6379
```

Then connect:
```bash
ssh sneaker-home
# Keep open, then in another terminal:
psql -h localhost -U sneaker -d sneaker_prices
```

### 5.2 Remote Monitoring

```bash
# View logs from your computer
ssh user@home-server-ip
sudo journalctl -u sneaker-collector -f

# Check data collection
ssh user@home-server-ip
psql -U sneaker -d sneaker_prices << EOF
SELECT
  COUNT(*) as total_prices,
  COUNT(DISTINCT sku_id) as sneakers,
  MAX(timestamp) as last_update
FROM prices;
EOF

# Or create a simple bash script
nano ~/monitor-sneaker.sh
```

Add to script:
```bash
#!/bin/bash
ssh user@home-server-ip << 'EOF'
echo "=== Sneaker Collector Status ==="
sudo systemctl status sneaker-collector --no-pager
echo ""
echo "=== Data Collection Progress ==="
psql -U sneaker -d sneaker_prices -c \
  "SELECT COUNT(*) FROM prices; SELECT COUNT(DISTINCT sku_id) FROM prices;"
echo ""
echo "=== Recent Logs ==="
sudo journalctl -u sneaker-collector -n 20 --no-pager
EOF
```

Run it:
```bash
chmod +x ~/monitor-sneaker.sh
./monitor-sneaker.sh
```

---

## Part 6: Home Network Configuration

### 6.1 Find Your Home Server IP

```bash
# Inside home server
hostname -I

# Or from router admin page
# Usually 192.168.1.x or 192.168.0.x
```

### 6.2 Set Static IP (Recommended)

To avoid IP changing when router restarts:

```bash
# On home server, check current config
ip route show

# Edit netplan configuration
sudo nano /etc/netplan/00-installer-config.yaml
```

Example static IP configuration:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

Apply:
```bash
sudo netplan apply
ip addr show  # Verify
```

### 6.3 Router Configuration (Optional)

If you want to access the server from outside your home network:

1. **Port forwarding** (in router admin):
   - Forward port 22 (SSH) to your server's internal IP
   - Use a non-standard port like 2222 for security

2. **Dynamic DNS** (if your ISP changes your public IP):
   - Use service like No-IP or DuckDNS
   - Maps dynamic IP to static domain name

3. **Firewall**:
   - Keep SSH key-based auth only (disable password)
   - Never expose database ports directly

```bash
# Lock down SSH on server
sudo nano /etc/ssh/sshd_config

# Set:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

---

## Part 7: Power & Cooling Management

### 7.1 Power Considerations

For 24/7 operation, you want reliability:

```bash
# Check power state settings
cat /sys/class/power_supply/*/status

# Disable sleep mode
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Disable DPMS (display power management)
sudo nano /etc/default/grub
# Add: GRUB_CMDLINE_LINUX="... acpi=off"
sudo update-grub
```

### 7.2 Temperature Monitoring

```bash
# Install monitoring tools
sudo apt install -y lm-sensors

# Check temperatures
sensors
watch -n 1 sensors  # Continuous monitoring

# Set up alerts if needed
sudo apt install -y hddtemp
hddtemp /dev/sda
```

### 7.3 UPS Integration (Optional)

If you have a UPS:
```bash
sudo apt install -y apcupsd

# Configure to gracefully shutdown on battery low
# Edit /etc/apcupsd/apcupsd.conf
```

---

## Part 8: Backup Strategy

### 8.1 Regular Database Backups

Create backup script on home server:

```bash
nano ~/backup-sneaker.sh
```

Add:
```bash
#!/bin/bash

BACKUP_DIR="$HOME/sneaker-backups"
mkdir -p $BACKUP_DIR

# SSH into VM and backup
ssh -p 2222 ubuntu@localhost << 'EOF'
BACKUP_FILE="/home/ubuntu/backup_$(date +%Y%m%d_%H%M%S).sql.gz"
sudo -u postgres pg_dump sneaker_prices | gzip > $BACKUP_FILE
echo "Backup created: $BACKUP_FILE"
EOF

# Copy backup to home server
scp -P 2222 ubuntu@localhost:/home/ubuntu/backup_*.sql.gz $BACKUP_DIR/

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "✅ Backup completed. Total backups: $(ls -1 $BACKUP_DIR | wc -l)"
```

Make executable and schedule:
```bash
chmod +x ~/backup-sneaker.sh

# Schedule daily at 2am
crontab -e
# Add: 0 2 * * * ~/backup-sneaker.sh
```

### 8.2 VM Disk Snapshot

Periodically snapshot the VM disk:

```bash
# On home server
qemu-img snapshot -c "backup-$(date +%Y%m%d)" ~/vms/sneaker-collector/disk.qcow2

# List snapshots
qemu-img snapshot -l ~/vms/sneaker-collector/disk.qcow2

# Restore snapshot if needed
qemu-img snapshot -a backup-20260202 ~/vms/sneaker-collector/disk.qcow2
```

---

## Part 9: Monitoring & Maintenance

### 9.1 Daily Checks

```bash
# Create monitoring script
nano ~/check-sneaker.sh
```

Add:
```bash
#!/bin/bash

echo "🔍 Checking Sneaker Collector Health"
echo ""

# Check QEMU VM
echo "1️⃣ QEMU VM Status:"
sudo systemctl status sneaker-collector-qemu --no-pager | grep Active

# Check collector service
echo "2️⃣ Collector Service:"
ssh -p 2222 ubuntu@localhost "sudo systemctl status sneaker-collector --no-pager | grep Active"

# Check data collection
echo "3️⃣ Data Collected:"
ssh -p 2222 ubuntu@localhost \
  "psql -U sneaker -d sneaker_prices -c 'SELECT COUNT(*) as prices FROM prices;'"

# Check last update
echo "4️⃣ Last Price Update:"
ssh -p 2222 ubuntu@localhost \
  "psql -U sneaker -d sneaker_prices -c 'SELECT MAX(timestamp) FROM prices;'"

# Check for errors
echo "5️⃣ Recent Errors:"
ssh -p 2222 ubuntu@localhost \
  "sudo journalctl -u sneaker-collector -n 5 --no-pager | grep ERROR || echo 'No errors ✅'"

echo ""
echo "✅ Health check complete"
```

Run daily:
```bash
chmod +x ~/check-sneaker.sh
./check-sneaker.sh
```

### 9.2 Monthly Maintenance

```bash
# Archive old price data (keep last 90 days)
ssh -p 2222 ubuntu@localhost << 'EOF'
psql -U sneaker -d sneaker_prices -c \
  "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '90 days';"
EOF

# Optimize database
ssh -p 2222 ubuntu@localhost << 'EOF'
sudo -u postgres psql -d sneaker_prices -c "VACUUM ANALYZE;"
EOF

# Check disk usage
ssh -p 2222 ubuntu@localhost << 'EOF'
echo "Disk usage:"
df -h /home
echo ""
echo "Database size:"
sudo -u postgres psql -d sneaker_prices -c "SELECT pg_size_pretty(pg_database_size('sneaker_prices'));"
EOF
```

---

## Part 10: Troubleshooting

### VM Won't Start

```bash
# Check service status
sudo systemctl status sneaker-collector-qemu
sudo journalctl -u sneaker-collector-qemu -n 50

# Try manual start
qemu-system-x86_64 \
  -m 4096 -smp 4 -enable-kvm \
  -drive file=/path/to/disk.qcow2,format=qcow2 \
  -net nic,model=virtio \
  -net user,hostfwd=tcp:127.0.0.1:2222-:22 \
  -display none
```

### Can't SSH into VM

```bash
# Check if VM is actually running
ps aux | grep qemu

# Check port forwarding
netstat -tlnp | grep 2222

# Try different port in service file
# Change: -net user,hostfwd=tcp:127.0.0.1:2223-:22
```

### Database Disk Full

```bash
# Check size
ssh -p 2222 ubuntu@localhost "df -h /var"

# Archive old data
ssh -p 2222 ubuntu@localhost << 'EOF'
psql -U sneaker -d sneaker_prices -c \
  "DELETE FROM prices WHERE timestamp < NOW() - INTERVAL '30 days';"
sudo -u postgres psql -d sneaker_prices -c "VACUUM FULL;"
EOF

# If still full, expand disk
qemu-img resize ~/vms/sneaker-collector/disk.qcow2 +20G
# Then in VM: sudo growpart /dev/vda 1 && sudo resize2fs /dev/vda1
```

### High CPU/Memory Usage

```bash
# Check what's running
ssh -p 2222 ubuntu@localhost "top -b -n 1 | head -20"

# Restart collector
ssh -p 2222 ubuntu@localhost "sudo systemctl restart sneaker-collector"

# Check logs for scraper errors
ssh -p 2222 ubuntu@localhost "sudo journalctl -u sneaker-collector | grep ERROR"
```

---

## Quick Reference

### Start/Stop Operations

```bash
# Start everything
sudo systemctl start sneaker-collector-qemu

# Stop everything
sudo systemctl stop sneaker-collector-qemu

# Restart
sudo systemctl restart sneaker-collector-qemu

# View logs
sudo journalctl -u sneaker-collector-qemu -f
```

### Monitor from Your Computer

```bash
# SSH into home server
ssh user@home-server-ip

# Then SSH into VM
ssh -p 2222 ubuntu@localhost

# Check collector
sudo systemctl status sneaker-collector
sudo journalctl -u sneaker-collector -f

# Check data
psql -U sneaker -d sneaker_prices -c "SELECT COUNT(*) FROM prices;"
```

### Backup

```bash
# Daily backup
~/backup-sneaker.sh

# VM snapshot
qemu-img snapshot -c "backup-$(date +%Y%m%d)" ~/vms/sneaker-collector/disk.qcow2
```

---

## Expected Timeline

| Time | Status |
|------|--------|
| Day 1 | VM running, collector started, first prices collected |
| Week 1 | ~13,600 price points, 50 MB database |
| Month 1 | ~54,400 price points, 200 MB database |
| Month 3 | ~163,200 price points, 600 MB database |

---

## Success Checklist

- [x] QEMU/libvirt installed on home server
- [x] VM disk created (50GB)
- [x] Ubuntu 22.04 LTS installed in VM
- [x] QEMU systemd service created and running
- [x] SSH access working (port 2222)
- [x] Node.js, PostgreSQL, Redis installed in VM
- [x] Project cloned and dependencies installed
- [x] Database created and seeded
- [x] Collector systemd service created
- [x] Collector service running
- [x] Data collection started
- [x] SSH tunnel working from your computer
- [x] Monitoring scripts created
- [x] Backup script scheduled
- [x] Running 24/7 ✅

---

## Summary

Your home server now has:
- **QEMU VM** running 24/7 (with systemd service)
- **Sneaker Collector** automatically updating prices
- **PostgreSQL** storing all historical data
- **SSH access** from your computer
- **Backup strategy** for data protection
- **Monitoring scripts** for health checks

The system is:
✅ Fully automated
✅ Remotely accessible
✅ Production-ready
✅ Collecting real data

Happy data collection! 🚀
