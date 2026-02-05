#!/bin/bash
#
# Setup cron jobs for automated sneaker discovery
#

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WRAPPER_SCRIPT="$SCRIPT_DIR/cron-discover-sneakers.sh"

echo -e "${GREEN}=================================="
echo "Sneaker Discovery Cron Setup"
echo -e "==================================${NC}\n"

echo "Project directory: $PROJECT_DIR"
echo "Wrapper script: $WRAPPER_SCRIPT"
echo ""

# Verify wrapper script exists
if [ ! -f "$WRAPPER_SCRIPT" ]; then
    echo -e "${RED}ERROR: Wrapper script not found at $WRAPPER_SCRIPT${NC}"
    exit 1
fi

# Make sure wrapper is executable
chmod +x "$WRAPPER_SCRIPT"
echo -e "${GREEN}✓${NC} Wrapper script is executable"

# Create log directory
mkdir -p "$PROJECT_DIR/logs/discovery"
echo -e "${GREEN}✓${NC} Log directory created: $PROJECT_DIR/logs/discovery"

# Define cron jobs
CRON_JOBS="
# Sneaker Discovery - Automated by setup-cron-jobs.sh
# Full discovery every Sunday at 3 AM
0 3 * * 0 $WRAPPER_SCRIPT full >> $PROJECT_DIR/logs/discovery/cron-full.log 2>&1

# Safe discovery every day at 6 AM
0 6 * * * $WRAPPER_SCRIPT safe >> $PROJECT_DIR/logs/discovery/cron-safe.log 2>&1
"

# Backup existing crontab
echo ""
echo -e "${YELLOW}Backing up existing crontab...${NC}"
if crontab -l > /dev/null 2>&1; then
    crontab -l > "$PROJECT_DIR/logs/crontab-backup-$(date +%Y%m%d-%H%M%S).txt"
    echo -e "${GREEN}✓${NC} Existing crontab backed up"
else
    echo -e "${YELLOW}⚠${NC} No existing crontab found (this is fine for first-time setup)"
fi

# Add new cron jobs
echo ""
echo -e "${YELLOW}Installing cron jobs...${NC}"

# Get existing crontab (excluding old sneaker discovery jobs)
EXISTING_CRONTAB=$(crontab -l 2>/dev/null | grep -v "cron-discover-sneakers.sh" | grep -v "Sneaker Discovery" || true)

# Combine with new jobs
echo "$EXISTING_CRONTAB" | cat - <(echo "$CRON_JOBS") | crontab -

echo -e "${GREEN}✓${NC} Cron jobs installed successfully!"

# Display installed cron jobs
echo ""
echo -e "${GREEN}=================================="
echo "Installed Cron Jobs"
echo -e "==================================${NC}"
echo ""
crontab -l | grep -A 5 "Sneaker Discovery"
echo ""

# Summary
echo -e "${GREEN}=================================="
echo "Setup Complete!"
echo -e "==================================${NC}\n"

echo "Schedule:"
echo "  • Full discovery:  Every Sunday at 3:00 AM"
echo "  • Safe discovery:  Every day at 6:00 AM"
echo ""
echo "Logs:"
echo "  • Discovery logs:  $PROJECT_DIR/logs/discovery/"
echo "  • Cron logs:       $PROJECT_DIR/logs/discovery/cron-*.log"
echo ""
echo "Commands:"
echo "  • View cron jobs:     crontab -l"
echo "  • Remove cron jobs:   $SCRIPT_DIR/remove-cron-jobs.sh"
echo "  • Test manually:      $WRAPPER_SCRIPT full"
echo "  • View recent logs:   ls -lt $PROJECT_DIR/logs/discovery/"
echo ""
echo -e "${YELLOW}Note:${NC} Cron jobs will start running automatically."
echo "      First full discovery: Next Sunday at 3 AM"
echo "      First safe discovery: Tomorrow at 6 AM"
echo ""
echo -e "${GREEN}✅ All set! Your sneaker catalog will update automatically.${NC}"
