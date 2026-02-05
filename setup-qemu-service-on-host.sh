#!/bin/bash
# Complete QEMU Service Setup Script
# Run this on your HOST machine
#
# This script will:
# 1. Copy service files from VM to host
# 2. Find your VM disk image
# 3. Install and configure the systemd service
# 4. Set up port forwarding (SSH: 2222, Web: 3000)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   QEMU Sneaker Collector - Service Setup (Host)           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}❌ Don't run this as root. Run as your regular user.${NC}"
    exit 1
fi

# Step 1: Create working directory
echo -e "${BLUE}📁 Step 1: Creating working directory...${NC}"
WORK_DIR=~/qemu-service
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"
echo -e "${GREEN}✅ Created: $WORK_DIR${NC}"
echo ""

# Step 2: Copy files from VM
echo -e "${BLUE}📥 Step 2: Copying files from VM...${NC}"
echo "Using SSH port 2222 (current VM SSH port)"
echo ""

FILES=(
    "qemu-sneaker-collector.service"
    "INSTALL_QEMU_SERVICE.md"
    "install-service.sh"
)

for file in "${FILES[@]}"; do
    echo -n "Copying $file... "
    if scp -P 2222 -o StrictHostKeyChecking=no \
        gorhick@localhost:~/data_price_collection/$file . 2>/dev/null; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
        echo "If this fails, the VM might not be accessible on port 2222"
        echo "Make sure you can SSH with: ssh -p 2222 gorhick@localhost"
        exit 1
    fi
done
echo ""

# Step 3: Find VM disk image
echo -e "${BLUE}💾 Step 3: Finding VM disk image...${NC}"
echo "Searching for .qcow2 files..."
echo ""

DISK_CANDIDATES=$(find ~ -name "*.qcow2" 2>/dev/null | head -10)

if [ -z "$DISK_CANDIDATES" ]; then
    echo -e "${YELLOW}⚠️  No .qcow2 files found automatically${NC}"
    echo ""
    read -p "Enter the full path to your VM disk image: " DISK_PATH
else
    echo "Found VM disk images:"
    echo "$DISK_CANDIDATES" | nl
    echo ""

    NUM_DISKS=$(echo "$DISK_CANDIDATES" | wc -l)

    if [ "$NUM_DISKS" -eq 1 ]; then
        DISK_PATH=$(echo "$DISK_CANDIDATES" | head -1)
        echo -e "${GREEN}Auto-selected: $DISK_PATH${NC}"
        read -p "Is this correct? (Y/n): " CONFIRM
        if [ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ]; then
            read -p "Enter the full path to your VM disk image: " DISK_PATH
        fi
    else
        read -p "Enter the number of your VM disk (or full path): " CHOICE
        if [[ "$CHOICE" =~ ^[0-9]+$ ]]; then
            DISK_PATH=$(echo "$DISK_CANDIDATES" | sed -n "${CHOICE}p")
        else
            DISK_PATH="$CHOICE"
        fi
    fi
fi

# Verify disk exists
if [ ! -f "$DISK_PATH" ]; then
    echo -e "${RED}❌ Error: Disk not found at $DISK_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Using disk: $DISK_PATH${NC}"
DISK_SIZE=$(du -h "$DISK_PATH" | cut -f1)
echo "   Size: $DISK_SIZE"
echo ""

# Step 4: Update service file
echo -e "${BLUE}📝 Step 4: Updating service file with disk path...${NC}"
sed "s|/path/to/vm-disk.qcow2|$DISK_PATH|g" \
    qemu-sneaker-collector.service > qemu-sneaker-collector-updated.service
echo -e "${GREEN}✅ Service file updated${NC}"
echo ""

# Step 5: Install service
echo -e "${BLUE}⚙️  Step 5: Installing systemd service...${NC}"

# Create systemd user directory
mkdir -p ~/.config/systemd/user

# Copy service file
cp qemu-sneaker-collector-updated.service \
   ~/.config/systemd/user/qemu-sneaker-collector.service

# Clean up temp file
rm qemu-sneaker-collector-updated.service

# Reload systemd
systemctl --user daemon-reload

# Enable service
systemctl --user enable qemu-sneaker-collector.service

# Enable lingering
if loginctl enable-linger $USER 2>/dev/null; then
    echo -e "${GREEN}✅ Lingering enabled${NC}"
else
    echo -e "${YELLOW}⚠️  Could not enable lingering (may need sudo)${NC}"
fi

echo -e "${GREEN}✅ Service installed and enabled${NC}"
echo ""

# Step 6: Shutdown current VM
echo -e "${BLUE}🛑 Step 6: Shutting down current VM instance...${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: The current VM needs to be shut down first${NC}"
echo "This will close your SSH session to the VM."
echo ""
read -p "Shutdown current VM now? (Y/n): " SHUTDOWN

if [ "$SHUTDOWN" != "n" ] && [ "$SHUTDOWN" != "N" ]; then
    echo "Sending shutdown command to VM..."
    ssh -p 2222 gorhick@localhost "sudo shutdown -h now" 2>/dev/null || true
    echo "Waiting for VM to shut down (15 seconds)..."
    sleep 15
    echo -e "${GREEN}✅ VM should be shut down${NC}"
else
    echo -e "${YELLOW}⚠️  Please manually shutdown the VM with: ssh -p 2222 gorhick@localhost 'sudo shutdown -h now'${NC}"
    read -p "Press Enter when VM is shut down..."
fi
echo ""

# Step 7: Start service
echo -e "${BLUE}🚀 Step 7: Starting VM with systemd service...${NC}"
systemctl --user start qemu-sneaker-collector.service

echo "Waiting for VM to boot (10 seconds)..."
sleep 10

# Check status
if systemctl --user is-active --quiet qemu-sneaker-collector.service; then
    echo -e "${GREEN}✅ Service is running!${NC}"
else
    echo -e "${RED}❌ Service failed to start${NC}"
    echo "Check logs with: journalctl --user -u qemu-sneaker-collector.service -n 50"
    exit 1
fi
echo ""

# Step 8: Test connections
echo -e "${BLUE}🧪 Step 8: Testing connections...${NC}"

# Test SSH
echo -n "Testing SSH (port 2222)... "
if timeout 5 ssh -p 2222 -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
    gorhick@localhost "echo OK" 2>/dev/null | grep -q OK; then
    echo -e "${GREEN}✅${NC}"
    SSH_OK=true
else
    echo -e "${YELLOW}⏳ Not ready yet (VM still booting)${NC}"
    SSH_OK=false
fi

# Test Web Server
echo -n "Testing web server (port 3000)... "
if curl -s --max-time 5 http://localhost:3000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
    WEB_OK=true
else
    echo -e "${YELLOW}⏳ Not ready yet (service still starting)${NC}"
    WEB_OK=false
fi
echo ""

# Final status
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    SETUP COMPLETE! 🎉                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}📌 Service Status:${NC}"
systemctl --user status qemu-sneaker-collector.service --no-pager | head -10
echo ""

echo -e "${GREEN}🌐 Access Points:${NC}"
echo ""
if [ "$SSH_OK" = true ]; then
    echo -e "  ${GREEN}✅${NC} SSH:         ssh -p 2222 gorhick@localhost"
else
    echo -e "  ${YELLOW}⏳${NC} SSH:         ssh -p 2222 gorhick@localhost  (wait ~30s)"
fi

if [ "$WEB_OK" = true ]; then
    echo -e "  ${GREEN}✅${NC} Health:      http://localhost:3000/health"
    echo -e "  ${GREEN}✅${NC} Admin:       http://localhost:3000/admin"
else
    echo -e "  ${YELLOW}⏳${NC} Health:      http://localhost:3000/health  (wait ~30s)"
    echo -e "  ${YELLOW}⏳${NC} Admin:       http://localhost:3000/admin  (wait ~30s)"
fi
echo ""

echo -e "${GREEN}📋 Useful Commands:${NC}"
echo "  Start:       systemctl --user start qemu-sneaker-collector.service"
echo "  Stop:        systemctl --user stop qemu-sneaker-collector.service"
echo "  Restart:     systemctl --user restart qemu-sneaker-collector.service"
echo "  Status:      systemctl --user status qemu-sneaker-collector.service"
echo "  Logs:        journalctl --user -u qemu-sneaker-collector.service -f"
echo ""

echo -e "${BLUE}💡 Next Steps:${NC}"
echo "  1. Wait ~30 seconds for VM to fully boot if services aren't ready"
echo "  2. Test health: curl http://localhost:3000/health"
echo "  3. Open admin: http://localhost:3000/admin"
echo "  4. Configure ADMIN_USER_IDS in VM's .env file"
echo ""

echo -e "${YELLOW}📚 Documentation: $WORK_DIR/INSTALL_QEMU_SERVICE.md${NC}"
echo ""

# Ask if user wants to open admin dashboard
if command -v xdg-open >/dev/null 2>&1; then
    read -p "Open admin dashboard in browser now? (y/N): " OPEN_BROWSER
    if [ "$OPEN_BROWSER" = "y" ] || [ "$OPEN_BROWSER" = "Y" ]; then
        echo "Opening http://localhost:3000/admin..."
        xdg-open http://localhost:3000/admin 2>/dev/null || true
    fi
fi

echo -e "${GREEN}✨ All done!${NC}"
