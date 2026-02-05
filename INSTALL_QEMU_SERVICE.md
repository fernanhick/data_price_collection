# QEMU Sneaker Collector VM - Systemd Service Installation

## Overview
This guide will help you set up the QEMU VM as a systemd user service with automatic port forwarding for:
- **SSH:** Host port 2222 → VM port 22
- **Web Server:** Host port 3000 → VM port 3000

## Prerequisites
- QEMU/KVM installed on host machine
- VM disk image (`.qcow2` or `.img` file)
- Your user has access to `/dev/kvm`

## Installation Steps

### 1. Copy the Service File to Your Host Machine

From inside the VM, the service file is located at:
```
/home/gorhick/data_price_collection/qemu-sneaker-collector.service
```

Copy it to your **host machine** using SCP:
```bash
# On your host machine:
scp -P 2222 gorhick@localhost:~/data_price_collection/qemu-sneaker-collector.service ~/
```

### 2. Edit the Service File

On your **host machine**, edit the service file to update the paths:

```bash
nano ~/qemu-sneaker-collector.service
```

**Change this line:**
```
-drive file=/path/to/vm-disk.qcow2,format=qcow2,if=virtio \
```

**To your actual VM disk path, for example:**
```
-drive file=/home/youruser/VMs/sneaker-collector.qcow2,format=qcow2,if=virtio \
```

### 3. Install the Service

On your **host machine**:

```bash
# Create systemd user directory if it doesn't exist
mkdir -p ~/.config/systemd/user

# Copy the service file
cp ~/qemu-sneaker-collector.service ~/.config/systemd/user/

# Reload systemd
systemctl --user daemon-reload

# Enable the service (start on boot)
systemctl --user enable qemu-sneaker-collector.service

# Enable lingering (allows service to run when not logged in)
loginctl enable-linger $USER
```

### 4. Start the Service

```bash
# Start the VM
systemctl --user start qemu-sneaker-collector.service

# Check status
systemctl --user status qemu-sneaker-collector.service

# View logs
journalctl --user -u qemu-sneaker-collector.service -f
```

### 5. Verify Port Forwarding

From your **host machine**:

```bash
# Test SSH (should connect to VM)
ssh -p 2222 gorhick@localhost

# Test Web Server (should return health check)
curl http://localhost:3000/health

# Access Admin Dashboard in browser
# Open: http://localhost:3000/admin
```

## Service Management Commands

```bash
# Start the VM
systemctl --user start qemu-sneaker-collector.service

# Stop the VM (graceful shutdown)
systemctl --user stop qemu-sneaker-collector.service

# Restart the VM
systemctl --user restart qemu-sneaker-collector.service

# Check status
systemctl --user status qemu-sneaker-collector.service

# View logs (live)
journalctl --user -u qemu-sneaker-collector.service -f

# View logs (last 50 lines)
journalctl --user -u qemu-sneaker-collector.service -n 50

# Disable auto-start
systemctl --user disable qemu-sneaker-collector.service

# Enable auto-start
systemctl --user enable qemu-sneaker-collector.service
```

## Troubleshooting

### VM Won't Start

1. **Check the disk path:**
   ```bash
   systemctl --user status qemu-sneaker-collector.service
   ```
   Look for "No such file or directory" errors.

2. **Check KVM permissions:**
   ```bash
   ls -l /dev/kvm
   # You should be in the kvm group:
   groups
   # If not:
   sudo usermod -aG kvm $USER
   # Then log out and back in
   ```

3. **Check logs:**
   ```bash
   journalctl --user -u qemu-sneaker-collector.service --since "5 minutes ago"
   ```

### Port Forwarding Not Working

1. **Check if VM is running:**
   ```bash
   systemctl --user status qemu-sneaker-collector.service
   ```

2. **Check ports on host:**
   ```bash
   ss -tlnp | grep -E "2222|3000"
   ```

3. **Test from inside VM:**
   ```bash
   # SSH into VM
   ssh -p 2222 gorhick@localhost

   # Inside VM, check if server is running
   curl http://localhost:3000/health
   ```

### Need to Stop Current VM Instance First

If your VM is currently running (not via systemd), stop it first:

```bash
# Find QEMU process
ps aux | grep qemu

# Kill it gracefully
pkill -TERM qemu-system-x86_64
```

## Configuration Options

You can customize the service file:

### Memory (default: 4GB)
```
-m 4096
```

### CPU Cores (default: 2)
```
-smp 2
```

### Add More Port Forwards
```
-netdev user,id=net0,hostfwd=tcp::2222-:22,hostfwd=tcp::3000-:3000,hostfwd=tcp::5432-:5432
```

### Change to Headless Mode
The service is already configured for headless (`-display none`).

## Security Notes

- The VM runs as your user (not root)
- Port forwarding only binds to localhost (127.0.0.1)
- To allow external access, use a reverse proxy (nginx/caddy) on the host
- Resource limits are set (5GB RAM max, 200% CPU)

## Next Steps

After the service is running:
1. Access admin dashboard: http://localhost:3000/admin
2. Configure ADMIN_USER_IDS in the VM's .env file
3. Set up automatic backups of the VM disk
4. Configure monitoring (optional)

## Support

If you encounter issues:
1. Check service status and logs
2. Verify VM disk path is correct
3. Ensure ports 2222 and 3000 are not already in use
4. Check QEMU/KVM installation
