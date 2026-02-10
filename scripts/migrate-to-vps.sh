#!/bin/bash

# Complete VPS Migration Script
# Backs up database, images, and code for moving to new VPS
# Usage: ./scripts/migrate-to-vps.sh /path/to/backup

set -e

BACKUP_DIR="${1:-.}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="sneaker-api-backup-${TIMESTAMP}"

echo "🚀 Starting complete VPS migration backup..."
echo "Backup directory: $BACKUP_DIR"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

echo "1️⃣  Backing up PostgreSQL database..."
PGPASSWORD="fErchO99" pg_dump -h localhost -U postgres sneaker_prices > "$BACKUP_DIR/$BACKUP_NAME/database.sql"
echo "✅ Database backed up"

echo ""
echo "2️⃣  Backing up image files..."
cp -r ~/images "$BACKUP_DIR/$BACKUP_NAME/"
echo "✅ Images backed up ($(du -sh $BACKUP_DIR/$BACKUP_NAME/images | cut -f1))"

echo ""
echo "3️⃣  Backing up application code..."
git -C /home/gorhick/data_price_collection archive --format tar.gz -o "$BACKUP_DIR/$BACKUP_NAME/code.tar.gz" HEAD
echo "✅ Code backed up"

echo ""
echo "4️⃣  Backing up .env file..."
cp /home/gorhick/data_price_collection/.env "$BACKUP_DIR/$BACKUP_NAME/.env.backup"
echo "✅ Environment config backed up"

echo ""
echo "5️⃣  Creating migration instructions..."
cat > "$BACKUP_DIR/$BACKUP_NAME/RESTORE-INSTRUCTIONS.md" << 'EOF'
# VPS Migration Restore Instructions

## On New VPS:

### 1. Install Dependencies
```bash
# Install Node.js, PostgreSQL, npm
sudo apt update && sudo apt install -y nodejs npm postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql

# Create database user
sudo -u postgres createuser postgres --superuser
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'fErchO99';"
```

### 2. Restore Database
```bash
# Create empty database
sudo -u postgres createdb sneaker_prices

# Restore from backup
PGPASSWORD="fErchO99" psql -h localhost -U postgres sneaker_prices < database.sql
```

### 3. Restore Images
```bash
# Create image directories
mkdir -p ~/images

# Restore images
cp -r images/* ~/images/
```

### 4. Restore Application Code
```bash
# Extract code
tar -xzf code.tar.gz -C ~/data_price_collection

# Restore .env file
cp .env.backup ~/data_price_collection/.env

# Install dependencies
cd ~/data_price_collection
npm install
npm run build
```

### 5. Start Server
```bash
cd ~/data_price_collection
npm start
```

### 6. Verify Everything
```bash
# Check database
PGPASSWORD="fErchO99" psql -h localhost -U postgres -d sneaker_prices -c "SELECT COUNT(*) FROM skus;"

# Check images
ls ~/images/sneakers | wc -l

# Test API
curl http://localhost:3000/health
```

## Important Notes:
- Update .env if database credentials change
- Ensure PostgreSQL is running before restoring
- Configure firewall/security groups on new VPS
- Set up SSL certificates if needed
- Update DNS to point to new VPS IP
EOF

echo "✅ Restore instructions created"

echo ""
echo "============================================================"
echo "✅ Migration Backup Complete!"
echo "============================================================"
echo ""
echo "📦 Backup Location: $BACKUP_DIR/$BACKUP_NAME"
echo ""
echo "Contents:"
ls -lh "$BACKUP_DIR/$BACKUP_NAME/"
echo ""
echo "Total Size: $(du -sh $BACKUP_DIR/$BACKUP_NAME | cut -f1)"
echo ""
echo "🔒 SECURITY: Secure this backup!"
echo "   - Move to safe location"
echo "   - Encrypt if storing remotely"
echo "   - Keep .env file secure"
echo ""
echo "📝 Next Steps:"
echo "   1. Transfer backup to new VPS"
echo "   2. Follow RESTORE-INSTRUCTIONS.md"
echo "   3. Test API endpoints"
echo "   4. Update DNS records"
echo ""
