#!/bin/bash
#
# Remove sneaker discovery cron jobs
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Removing sneaker discovery cron jobs...${NC}\n"

# Backup current crontab
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if crontab -l > /dev/null 2>&1; then
    BACKUP_FILE="$PROJECT_DIR/logs/crontab-backup-before-removal-$(date +%Y%m%d-%H%M%S).txt"
    crontab -l > "$BACKUP_FILE"
    echo -e "${GREEN}✓${NC} Backed up crontab to: $BACKUP_FILE"
fi

# Remove sneaker discovery cron jobs
crontab -l 2>/dev/null | grep -v "cron-discover-sneakers.sh" | grep -v "Sneaker Discovery" | crontab - || crontab -r

echo -e "${GREEN}✓${NC} Sneaker discovery cron jobs removed"
echo ""
echo "Remaining cron jobs:"
if crontab -l > /dev/null 2>&1; then
    crontab -l
else
    echo "  (none)"
fi
echo ""
echo -e "${GREEN}Done!${NC}"
