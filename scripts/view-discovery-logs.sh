#!/bin/bash
#
# View sneaker discovery logs
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs/discovery"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ ! -d "$LOG_DIR" ]; then
    echo -e "${YELLOW}No logs found yet. Run discovery first:${NC}"
    echo "  npm run sneaker:discover"
    exit 1
fi

echo -e "${GREEN}=================================="
echo "Sneaker Discovery Logs"
echo -e "==================================${NC}\n"

# Show statistics
TOTAL_LOGS=$(ls -1 "$LOG_DIR"/*.log 2>/dev/null | wc -l)
echo "Total log files: $TOTAL_LOGS"
echo "Log directory: $LOG_DIR"
echo ""

# Show recent logs
echo -e "${BLUE}Recent logs (last 10):${NC}"
ls -lt "$LOG_DIR"/*.log 2>/dev/null | head -10 | while read -r line; do
    echo "  $line"
done
echo ""

# Show latest log option
LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)
if [ -n "$LATEST_LOG" ]; then
    echo -e "${YELLOW}Latest log file:${NC}"
    echo "  $LATEST_LOG"
    echo ""

    read -p "View latest log? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "${GREEN}=== Latest Log ===${NC}"
        cat "$LATEST_LOG"
    fi
fi

echo ""
echo -e "${BLUE}Commands:${NC}"
echo "  View latest:           cat $LOG_DIR/\$(ls -t $LOG_DIR | head -1)"
echo "  View cron logs:        tail -f $LOG_DIR/cron-*.log"
echo "  View all logs:         ls -lt $LOG_DIR/"
echo "  Clean old logs:        find $LOG_DIR -name '*.log' -mtime +30 -delete"
