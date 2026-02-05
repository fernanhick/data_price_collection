#!/bin/bash
#
# Cron-safe wrapper for sneaker discovery
# This script ensures proper environment setup when run via cron
#

set -e  # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Log directory
LOG_DIR="$PROJECT_DIR/logs/discovery"
mkdir -p "$LOG_DIR"

# Timestamp for log files
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# Determine which discovery script to run
DISCOVERY_TYPE="${1:-full}"  # 'full' or 'safe'

# Log file
if [ "$DISCOVERY_TYPE" = "safe" ]; then
    LOG_FILE="$LOG_DIR/safe-discovery-$TIMESTAMP.log"
    SCRIPT_CMD="npm run sneaker:discover-safe"
else
    LOG_FILE="$LOG_DIR/full-discovery-$TIMESTAMP.log"
    SCRIPT_CMD="npm run sneaker:discover"
fi

# Function to log messages
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=================================="
log "Starting sneaker discovery ($DISCOVERY_TYPE)"
log "Project directory: $PROJECT_DIR"
log "Log file: $LOG_FILE"
log "=================================="

# Change to project directory
cd "$PROJECT_DIR"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    log "Loading environment variables from .env"
    set -a  # Automatically export all variables
    source "$PROJECT_DIR/.env"
    set +a  # Stop auto-exporting
else
    log "WARNING: .env file not found"
fi

# Ensure Node.js is available
if ! command -v node &> /dev/null; then
    log "ERROR: Node.js not found in PATH"
    log "Attempting to load from common locations..."

    # Try to source common Node.js paths
    [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
    [ -s "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
fi

# Verify Node.js is now available
if ! command -v node &> /dev/null; then
    log "ERROR: Node.js still not found. Exiting."
    exit 1
fi

log "Node version: $(node --version)"
log "NPM version: $(npm --version)"

# Run the discovery script
log "Running: $SCRIPT_CMD"
log "=================================="

if $SCRIPT_CMD >> "$LOG_FILE" 2>&1; then
    log "=================================="
    log "✅ Discovery completed successfully"
    EXIT_CODE=0
else
    log "=================================="
    log "❌ Discovery failed with exit code $?"
    EXIT_CODE=1
fi

# Clean up old logs (keep last 30 days)
log "Cleaning up logs older than 30 days..."
find "$LOG_DIR" -name "*.log" -type f -mtime +30 -delete 2>/dev/null || true

# Show summary
TOTAL_LOGS=$(ls -1 "$LOG_DIR"/*.log 2>/dev/null | wc -l)
log "Total log files: $TOTAL_LOGS"
log "Latest log: $LOG_FILE"
log "=================================="

exit $EXIT_CODE
