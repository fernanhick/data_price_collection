# User Tasks & Checklist - Sneaker Price API

**Your Responsibilities**: Infrastructure, configuration, legal, and integration tasks.

---

## 📋 PRE-LAUNCH (Before Day 1)

### Legal & Compliance

- [ ] **Prepare Terms of Service**
  - Include: "Reference data only, not for trading"
  - "Prices are estimates based on public marketplace data"
  - "We are not affiliated with eBay, GOAT, or StockX"
  - **Timeline**: Complete before any user access
  - **Deliverable**: terms.html or /terms endpoint

- [ ] **Create Price Disclaimer**
  - Display in mobile app UI
  - "Estimates may lag real-time market conditions by 1-24 hours"
  - "Prices are for reference only, not guaranteed"
  - **Deliverable**: disclaimer.md for frontend team

- [ ] **Get Legal Review** (Optional but recommended)
  - Send ToS and disclaimer to legal counsel
  - Get sign-off on data scraping approach
  - **Timeline**: 1-2 business days

### Infrastructure Setup

- [ ] **Choose & Rent VPS**
  - Options: DigitalOcean, Linode, Vultr, or Hetzner
  - Requirements: Ubuntu 20.04+, 2GB RAM, 50GB SSD
  - Cost: ~$5-10/month
  - **Action**: Create account, note IP address and root password
  - **Deliverable**: VPS IP address, SSH access

- [ ] **Setup Domain for API** (Use Your Existing Domain)
  - You already have a domain for your web section
  - Options for API:
    1. **Subdomain (RECOMMENDED)**: `api.yourdomain.com`
    2. **Path**: `yourdomain.com/api` (if web is on same server)
    3. **Separate domain**: `api-yourdomain.com` (if keeping separate)

  - **For Subdomain (api.yourdomain.com)**:
    - Go to your domain DNS provider (Namecheap, GoDaddy, etc.)
    - Add new DNS A record:
      ```
      Type: A
      Name: api
      Value: YOUR_VPS_IP_ADDRESS
      TTL: 3600
      ```
    - Wait 15-30 min for DNS to propagate
    - Test: `ping api.yourdomain.com` should resolve to VPS IP

  - **For Web Path (yourdomain.com/api)**:
    - Point `yourdomain.com` to your VPS IP
    - Configure Nginx to route `/api/*` requests to price API
    - Rest of traffic goes to web app

  - **Deliverable**: Domain/subdomain resolving to VPS IP

- [ ] **SSH Setup**
  - Connect to VPS: `ssh root@YOUR_VPS_IP`
  - Update packages: `apt update && apt upgrade -y`
  - Set root password (or use SSH keys for security)
  - **Deliverable**: Verified SSH access

### Initial Data Preparation

- [ ] **Create Initial Sneaker List**
  - Prepare 100-200 popular sneakers in JSON format:
  ```json
  [
    {
      "sku_code": "nike-air-jordan-1-retro-bred",
      "brand": "Nike",
      "model": "Air Jordan 1 Retro",
      "colorway": "Bred",
      "tier": 1
    },
    ...
  ]
  ```
  - **Sources**:
    - Your StockX sparse access (top 50)
    - Manual list of iconic releases (50-100)
    - Optional: Export from sneaker DB you may have
  - **Deliverable**: sneakers.json file (~100-200 entries)

### API Key Setup

- [ ] **Decide on API Key Strategy**
  - How many keys do you need?
    - 1 key for your mobile app? ✅
    - Multiple keys (app v1, v2, web client)?
  - **Decision**: Number of API keys needed

- [ ] **Plan API Key Distribution**
  - How will mobile app get the key?
    - Hardcoded in app (acceptable for reference data)
    - Downloaded from dashboard
    - Request via email
  - **Decision**: Distribution method

---

## 🔧 DAY 1-2: Initial Deployment

### Configuration Files

- [ ] **Create Environment File (.env)**
  - Store on VPS, never commit to git
  - Variables needed:
  ```
  DATABASE_URL=postgresql://user:pass@postgres:5432/prices
  REDIS_URL=redis://redis:6379
  NODE_ENV=production
  API_KEY_MASTER=sk_your_initial_key_here
  PORT=3000
  ```
  - **Deliverable**: .env file on VPS

- [ ] **Configure Nginx (Reverse Proxy)**
  - Decide: Will you use domain name or IP address?
  - If domain: Point DNS to VPS IP
  - Generate SSL certificate (Let's Encrypt - automatic)
  - **Deliverable**: Nginx running on port 80/443

### Database Initialization

- [ ] **Load Initial Sneaker Data**
  - Copy sneakers.json to VPS
  - Run: `docker exec prices_postgres psql -U postgres -d prices -c "INSERT INTO skus (...) VALUES (...)"`
  - Verify: Should see 100-200 rows in `skus` table
  - **Deliverable**: Confirmed data in database

- [ ] **Create Initial API Key**
  - Backend will auto-generate on startup
  - Copy API key: Format will be `sk_xxxxxxxxxxxxx`
  - **Action**: Note this key for mobile app
  - **Deliverable**: API key for mobile app integration

### Testing & Verification

- [ ] **Test Price Scraper Manually**
  - SSH to VPS: `docker exec prices_app npm run scrape:test`
  - Check: Does it find eBay listings for test SKU?
  - Expected: 2-5 listings found, prices extracted
  - **Deliverable**: Verified scraper works

- [ ] **Test API Endpoints**
  - Use curl or Postman:
  ```bash
  curl -H "X-API-Key: sk_xxxxx" https://YOUR_IP/api/skus
  curl -H "X-API-Key: sk_xxxxx" https://YOUR_IP/api/prices/nike-air-jordan-1-retro-bred
  ```
  - Expected: JSON response with prices
  - **Deliverable**: Verified API working

- [ ] **Test Scheduler (First Update)**
  - Wait for scheduled time (or manually trigger)
  - Check: Are prices being updated in database?
  - Command: `docker logs prices_app | grep "price update"`
  - **Deliverable**: Confirmed daily updates working

---

## 📱 DAYS 3-7: Integration & Expansion

### Mobile App Integration

- [ ] **Integrate API into Mobile App**
  - Add API endpoint to app config: `https://YOUR_IP` or domain
  - Add API key to secure storage (keychain/keystore)
  - Implement API calls:
    - `GET /api/prices/{sku_code}` for single price
    - `GET /api/skus?search=...` for search
  - **Deliverable**: Mobile app calling your API successfully

- [ ] **Test Mobile App Against Live API**
  - Search for sneaker in app → should return prices
  - Check price updates throughout day
  - Verify Tier 1 updates 4 times (or Tier 2 once daily)
  - **Deliverable**: Confirmed mobile app works

### Catalog Expansion

- [ ] **Prepare Additional Sneaker List**
  - Goal: Expand from 100 to 500+ sneakers by day 7
  - Prepare CSV/JSON with:
    - Brand, Model, Colorway
    - Release date (optional)
    - Retail price (optional)
  - Sources:
    - StockX list (sparse access)
    - GOAT popular listings
    - Manual research (iconic Jordan/Dunk releases)
  - **Deliverable**: sneakers_expanded.json (~400 new entries)

- [ ] **Load Expanded Catalog to Database**
  - Upload file to VPS
  - Backend auto-imports and deduplicates
  - Or manually: `docker exec prices_postgres psql -U postgres -d prices -c "COPY skus FROM 'file.csv'"`
  - Verify: `SELECT COUNT(*) FROM skus;` should show 500+
  - **Deliverable**: Expanded catalog in database

### Monitoring Setup

- [ ] **Configure Email/Slack Alerts** (Optional but recommended)
  - When: Price scraper fails
  - When: API has errors (5xx)
  - When: Daily update misses
  - **Action**: Create Slack webhook or email service
  - **Deliverable**: Alerts configured and tested

- [ ] **Create Simple Monitoring Dashboard**
  - Check endpoint daily: `GET /api/health/prices`
  - Response should show:
    - Last price update time
    - Number of prices in database
    - Any recent errors
  - **Deliverable**: Bookmark and check daily

---

## 📊 DAYS 8-14: Optimization & Hardening

### Performance Tuning

- [ ] **Monitor Price Update Success Rate**
  - Target: 100% on-time updates
  - Track: Did Tier 1 update at 6am, 12pm, 6pm, 12am?
  - Track: Did Tier 2 update at 2pm?
  - **Deliverable**: 7 days of verified updates

- [ ] **Check Scraper Performance**
  - Average time per tier?
  - Any rate limiting (429 responses)?
  - Any IP bans?
  - **Action**: Adjust if needed or contact support

- [ ] **Optimize API Key Rate Limits** (if needed)
  - Current default: 1000 requests/minute
  - Too high? Reduce to 100-500 req/min
  - Too low? Increase to 2000+ req/min
  - **Decision**: Final rate limit for your API key

### Backup & Disaster Recovery

- [ ] **Setup Database Backups**
  - Option A: Automated (daily cron job)
  - Option B: Manual (daily via command)
  - Command: `docker exec prices_postgres pg_dump > backup_$(date +%Y%m%d).sql`
  - Store backups locally or on S3
  - **Deliverable**: First backup created and tested

- [ ] **Test Restore Process**
  - Delete a test table
  - Restore from backup
  - Verify data is back
  - **Deliverable**: Confirmed restore works

### Legal & User Messaging

- [ ] **Finalize Terms & Disclaimers**
  - Add to website or in-app
  - Get legal sign-off (if required)
  - Ensure all user-facing language approved
  - **Deliverable**: Published terms and disclaimers

- [ ] **Add API Documentation**
  - Create `/docs` or link to OpenAPI spec
  - Show how to use API with code examples
  - Include rate limiting info
  - **Deliverable**: Public API documentation

---

## 🚀 DAYS 15-21: Production Hardening

### Security

- [ ] **Rotate Initial API Key**
  - Generate new API key
  - Update mobile app with new key
  - Disable old key (keep in DB but mark inactive)
  - **Timeline**: Do this before any public launch
  - **Deliverable**: New API key active, old key disabled

- [ ] **Verify HTTPS is Working**
  - Check: Do all requests use HTTPS?
  - Test: `curl https://YOUR_DOMAIN/api/prices` (not http)
  - Verify SSL certificate valid
  - **Deliverable**: Confirmed all traffic encrypted

- [ ] **Audit Logs & Error Tracking**
  - Review logs for last 7 days
  - Any suspicious activity?
  - Any repeated errors?
  - **Action**: Fix any issues found

### Monitoring & Alerting

- [ ] **Confirm Daily Update Monitoring**
  - Can you verify Tier 1 updated 4 times today?
  - Can you verify Tier 2 updated once?
  - Set calendar reminder to check daily (or automate)
  - **Deliverable**: Daily verification process established

- [ ] **Setup Incident Response**
  - What if scraper fails for a day?
  - What if API goes down?
  - Create runbook with steps to fix
  - **Deliverable**: Incident response document

### Final Testing

- [ ] **Stress Test the System**
  - Simulate mobile app making 100+ requests
  - Verify prices still update correctly
  - Check API performance (should be <200ms)
  - **Deliverable**: Performance verified under load

- [ ] **Test Error Scenarios**
  - Kill the scraper → does alert trigger?
  - Kill the database → does it restart?
  - Manually test API with invalid key → get 401?
  - **Deliverable**: All error scenarios verified

---

## 📈 WEEK 4+: Ongoing Operations

### Daily Tasks

- [ ] **Daily Monitoring** (5-10 min)
  - Check: `GET /api/health/prices`
  - Verify: Last update times are recent (within 24h)
  - Verify: Price count increasing
  - Check logs for errors

### Weekly Tasks

- [ ] **Catalog Expansion** (1-2 hours/week)
  - Identify top 10-20 new sneaker releases this week
  - Add to database
  - Assign tier (usually Tier 2 initially)
  - Monitor prices over next 24h

- [ ] **Performance Review** (30 min/week)
  - Average price scraper time?
  - Any IP bans or rate limiting?
  - Price accuracy vs. actual market?
  - User feedback from mobile app?

- [ ] **Database Health Check** (15 min/week)
  - Disk usage growing as expected?
  - Any slow queries?
  - Backup successful?

### Monthly Tasks

- [ ] **API Key Rotation** (1 hour/month, optional)
  - Generate new key
  - Test in staging
  - Update mobile app
  - Disable old key

- [ ] **Performance Optimization**
  - Which sneakers are searched most?
  - Which prices change most frequently?
  - Can we optimize tier assignments?

- [ ] **Feature Requests & Feedback**
  - Any user feature requests?
  - Any issues from mobile app team?
  - Plan improvements for next month

---

## ⚠️ CRITICAL REMINDERS

### Before Any Public Launch:
- [ ] Legal review of ToS (required)
- [ ] Disclaimers visible to users
- [ ] API key secured (not hardcoded in plain text)
- [ ] HTTPS working (SSL certificate valid)
- [ ] At least 7 days of successful daily updates proven

### Never Do:
- ❌ Hardcode API key in public GitHub repo
- ❌ Expose database password in logs
- ❌ Share your VPS root password
- ❌ Skip SSL/HTTPS (always encrypt)
- ❌ Launch without legal review

### Best Practices:
- ✅ Keep API key in secure storage on mobile (keychain)
- ✅ Rotate API key every 3-6 months
- ✅ Monitor daily updates religiously
- ✅ Keep backups offline (S3, local drive)
- ✅ Document everything for future reference

---

## 📞 When to Ask for Help

**Technical Issues**:
- Scraper not finding listings → Debug eBay/GOAT changes
- API returning 500 errors → Check backend logs
- Database full → Check backup & cleanup

**Legal Questions**:
- Is scraping eBay public listings legal? → Consult lawyer
- Can we use GOAT data? → Check their ToS

**Scaling Issues**:
- Need to handle 10k users? → Upgrade VPS or database
- Price updates taking too long? → Add more scrapers

---

## 📝 Summary of Deliverables

By end of each phase, you should have:

**Pre-Launch**:
- ToS and Disclaimers ✅
- VPS running ✅
- 100-200 sneaker list ✅

**Day 1-2**:
- Prices updating daily ✅
- Mobile app integrated ✅
- API key working ✅

**Days 3-7**:
- Catalog expanded to 500+ ✅
- Alerts configured ✅
- Mobile app fully tested ✅

**Days 8-14**:
- 7 days perfect update record ✅
- Backups verified ✅
- All errors fixed ✅

**Days 15-21**:
- Production hardened ✅
- Monitoring in place ✅
- Ready for public launch ✅

**Week 4+**:
- Daily monitoring process ✅
- Weekly expansion routine ✅
- Monthly optimization ✅

---

**Good luck! 🚀**
