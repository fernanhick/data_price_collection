#!/bin/bash

# Production Setup Script for Sneaker Price API
# Run this script to set up PM2, firewall, and basic production config

set -e

echo "==================================="
echo "Sneaker Price API - Production Setup"
echo "==================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
   echo "ERROR: Do not run this script as root!"
   echo "Run as your normal user (gorhick)"
   exit 1
fi

# Step 1: Install PM2
echo "Step 1: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo "✅ PM2 installed"
else
    echo "✅ PM2 already installed"
fi

# Step 2: Stop any existing node processes
echo ""
echo "Step 2: Stopping existing processes..."
pkill -f "node.*src/index" || echo "No existing processes found"
sleep 2

# Step 3: Ensure project is built
echo ""
echo "Step 3: Building project..."
npm run build
echo "✅ Project built"

# Step 4: Start with PM2
echo ""
echo "Step 4: Starting API with PM2..."
pm2 delete sneaker-api 2>/dev/null || true
pm2 start dist/src/index.js --name sneaker-api
pm2 save
echo "✅ API started with PM2"

# Step 5: Setup PM2 startup
echo ""
echo "Step 5: Setting up PM2 to start on boot..."
echo "Note: This will require sudo and will display a command for you to run"
pm2 startup

# Step 6: Check status
echo ""
echo "==================================="
echo "Setup Complete! 🎉"
echo "==================================="
echo ""
echo "Your API is now running with PM2"
echo ""
echo "Quick Status Check:"
pm2 status
echo ""
echo "API Health:"
sleep 2
curl -s http://localhost:3000/health | jq . || curl -s http://localhost:3000/health
echo ""
echo ""
echo "Next Steps:"
echo "1. Run the command shown above (pm2 startup) if you haven't already"
echo "2. Test the API: curl http://localhost:3000/health"
echo "3. Access admin dashboard: http://YOUR_VPS_IP:3000/admin"
echo "4. (Optional) Set up nginx reverse proxy - see VPS_SETUP_GUIDE.md"
echo "5. (Optional) Set up SSL with Let's Encrypt - see VPS_SETUP_GUIDE.md"
echo ""
echo "Useful Commands:"
echo "  pm2 status              - View app status"
echo "  pm2 logs sneaker-api    - View logs"
echo "  pm2 restart sneaker-api - Restart app"
echo "  pm2 monit               - Monitor resources"
echo ""
echo "Full documentation: VPS_SETUP_GUIDE.md"
echo "==================================="
