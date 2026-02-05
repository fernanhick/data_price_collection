#!/bin/bash
# Quick installer for QEMU Sneaker Collector systemd service
# Run this script on your HOST machine (not inside the VM)

set -e

echo "🚀 QEMU Sneaker Collector - Systemd Service Installer"
echo "======================================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Don't run this as root. Run as your regular user."
    exit 1
fi

# Check if service file exists
if [ ! -f "qemu-sneaker-collector.service" ]; then
    echo "❌ Service file not found in current directory."
    echo "Please ensure qemu-sneaker-collector.service is in the current directory."
    exit 1
fi

# Get VM disk path from user
echo "📂 VM Disk Image Location"
echo "-------------------------"
read -p "Enter the full path to your VM disk image (.qcow2): " DISK_PATH

if [ ! -f "$DISK_PATH" ]; then
    echo "⚠️  Warning: File not found at $DISK_PATH"
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi

# Update service file with disk path
echo ""
echo "📝 Updating service file with your disk path..."
sed "s|/path/to/vm-disk.qcow2|$DISK_PATH|g" qemu-sneaker-collector.service > qemu-sneaker-collector-updated.service

# Create systemd user directory
echo "📁 Creating systemd user directory..."
mkdir -p ~/.config/systemd/user

# Copy service file
echo "📋 Installing service file..."
cp qemu-sneaker-collector-updated.service ~/.config/systemd/user/qemu-sneaker-collector.service
rm qemu-sneaker-collector-updated.service

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl --user daemon-reload

# Enable lingering
echo "⏰ Enabling lingering (allows service to run when not logged in)..."
loginctl enable-linger $USER 2>/dev/null || echo "Note: Could not enable lingering (may need sudo)"

# Ask if user wants to start now
echo ""
read -p "🚀 Start the VM now? (y/N): " START_NOW

if [ "$START_NOW" = "y" ] || [ "$START_NOW" = "Y" ]; then
    echo "Starting service..."
    systemctl --user start qemu-sneaker-collector.service
    sleep 2
    systemctl --user status qemu-sneaker-collector.service --no-pager
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📌 Useful commands:"
echo "   Start:   systemctl --user start qemu-sneaker-collector.service"
echo "   Stop:    systemctl --user stop qemu-sneaker-collector.service"
echo "   Status:  systemctl --user status qemu-sneaker-collector.service"
echo "   Logs:    journalctl --user -u qemu-sneaker-collector.service -f"
echo ""
echo "🌐 Access Points (once VM is running):"
echo "   SSH:     ssh -p 2222 gorhick@localhost"
echo "   Admin:   http://localhost:3000/admin"
echo "   Health:  http://localhost:3000/health"
echo ""
echo "📚 For detailed instructions, see INSTALL_QEMU_SERVICE.md"
