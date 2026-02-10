#!/bin/bash

# Diagnostic script to verify sneaker API setup
# Usage: bash scripts/verify-setup.sh

echo "========================================="
echo "Sneaker API Setup Verification"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check status
check_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
    fi
}

# =========================================
echo "1. DATABASE CONNECTION"
echo "========================================="

# Check PostgreSQL connection
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -c "SELECT 1;" > /dev/null 2>&1
check_status $? "PostgreSQL connection"

# Check SKU count
SKU_COUNT=$(PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -t -c "SELECT COUNT(*) FROM skus;")
echo "  Total SKUs: $SKU_COUNT"

# Check image coverage
IMAGE_COUNT=$(PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -t -c "SELECT COUNT(*) FROM skus WHERE image_local_path IS NOT NULL;")
echo "  SKUs with images: $IMAGE_COUNT"

if [ ! -z "$SKU_COUNT" ] && [ ! -z "$IMAGE_COUNT" ]; then
    COVERAGE=$((IMAGE_COUNT * 100 / SKU_COUNT))
    echo "  Coverage: ${COVERAGE}%"
fi

echo ""

# =========================================
echo "2. API SERVER"
echo "========================================="

# Check if API is running locally
curl -s http://localhost:3000/health > /dev/null 2>&1
check_status $? "API running on localhost:3000"

# Get API health info
if curl -s http://localhost:3000/health > /tmp/health.json 2>&1; then
    echo "  API Status:"
    cat /tmp/health.json | grep -o '"status":"[^"]*"' || echo "  (Could not parse status)"
fi

echo ""

# =========================================
echo "3. IMAGE STORAGE"
echo "========================================="

if [ -d "$HOME/images/sneakers" ]; then
    IMAGE_FILE_COUNT=$(ls -1 "$HOME/images/sneakers" | wc -l)
    echo -e "${GREEN}✓${NC} Image directory exists: $HOME/images/sneakers"
    echo "  Image files: $IMAGE_FILE_COUNT"

    # Check total size
    IMAGE_SIZE=$(du -sh "$HOME/images" | cut -f1)
    echo "  Total size: $IMAGE_SIZE"
else
    echo -e "${RED}✗${NC} Image directory missing: $HOME/images/sneakers"
fi

echo ""

# =========================================
echo "4. NETWORK CONNECTIVITY"
echo "========================================="

# Get local IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}')
fi

if [ -n "$LOCAL_IP" ]; then
    echo "  Your local IP: $LOCAL_IP"
else
    echo -e "${YELLOW}⚠${NC}  Could not determine local IP"
fi

# Check if accessible from local network
curl -s http://192.168.1.73:3000/health > /dev/null 2>&1
check_status $? "API accessible from VM IP (192.168.1.73:3000)"

# Try to get your public IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null)
if [ -n "$PUBLIC_IP" ]; then
    echo "  Your public IP: $PUBLIC_IP"
else
    echo -e "${YELLOW}⚠${NC}  Could not determine public IP"
fi

echo ""

# =========================================
echo "5. PORT STATUS"
echo "========================================="

# Check if port 3000 is listening
if command -v netstat &> /dev/null; then
    netstat -tuln 2>/dev/null | grep ":3000 " > /dev/null
    check_status $? "Port 3000 is listening"
fi

if command -v lsof &> /dev/null; then
    lsof -i :3000 > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  Process using port 3000:"
        lsof -i :3000 | tail -1 | awk '{print "    " $1 " (PID: " $2 ")"}'
    fi
fi

echo ""

# =========================================
echo "6. FILE SYSTEM"
echo "========================================="

# Check project directory
if [ -d "$HOME/data_price_collection" ]; then
    echo -e "${GREEN}✓${NC} Project directory exists"

    # Check if build exists
    if [ -d "$HOME/data_price_collection/dist" ]; then
        echo -e "${GREEN}✓${NC} Build directory exists (dist/)"
    else
        echo -e "${RED}✗${NC} Build directory missing (run: npm run build)"
    fi
else
    echo -e "${RED}✗${NC} Project directory missing"
fi

# Check node_modules
if [ -d "$HOME/data_price_collection/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Dependencies installed (node_modules/)"
else
    echo -e "${YELLOW}⚠${NC}  Dependencies not installed (run: npm install)"
fi

echo ""

# =========================================
echo "7. ENVIRONMENT CONFIGURATION"
echo "========================================="

if [ -f "$HOME/data_price_collection/.env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"

    # Check for critical variables
    grep -q "^PORT=" "$HOME/data_price_collection/.env" && echo "  ✓ PORT configured"
    grep -q "^NODE_ENV=" "$HOME/data_price_collection/.env" && echo "  ✓ NODE_ENV configured"
    grep -q "^DB_HOST=" "$HOME/data_price_collection/.env" && echo "  ✓ Database configured"
else
    echo -e "${RED}✗${NC} .env file missing"
fi

echo ""

# =========================================
echo "SUMMARY"
echo "========================================="

# Create simple report
ISSUES=0

# Check critical items
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} API not running - START IT FIRST:"
    echo "   cd ~/data_price_collection && npm start"
    ISSUES=$((ISSUES + 1))
fi

if [ -z "$IMAGE_FILE_COUNT" ] || [ "$IMAGE_FILE_COUNT" -lt 100 ]; then
    echo -e "${YELLOW}⚠${NC}  Low image coverage - consider backfilling:"
    echo "   npm run images:backfill-batch"
fi

if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}All systems operational!${NC}"
    echo ""
    echo "Next step: Configure port forwarding"
    echo "  See: VM-PORT-FORWARDING-SETUP.md"
else
    echo -e "${RED}Fix the above issues before continuing${NC}"
fi

echo ""
echo "For detailed information, see:"
echo "  - API logs: tail -f ~/data_price_collection/logs/app.log"
echo "  - API health: curl http://localhost:3000/health | jq"
echo "  - Database: PGPASSWORD=\"fErchO99\" psql -h localhost -U postgres -d sneaker_prices"
echo ""
