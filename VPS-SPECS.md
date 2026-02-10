# VPS Specifications & Scaling Guide

## Current Project Size

| Component | Size | Notes |
|-----------|------|-------|
| **Database (PostgreSQL)** | 3-5 MB | 1,116 sneakers + pricing history |
| **Images** | 32 MB | 1,082 cached WebP images |
| **Application Code** | 500 KB | Node.js + TypeScript |
| **Node Modules** | 200 MB | npm dependencies |
| **Total Active Data** | ~240 MB | What's actively used |

---

## 🔴 MINIMUM VPS (Proof of Concept)

**Use Case:** Local development, testing, small scale (<100 API calls/day)

### Specs
- **CPU:** 1 vCPU (2.0 GHz+)
- **RAM:** 1 GB
- **Storage:** 50 GB SSD
- **Bandwidth:** 1 TB/month
- **Estimated Cost:** $2-5/month

### Limitations
- ❌ No room for growth
- ❌ Slow database queries
- ❌ No background jobs
- ❌ Single point of failure
- ❌ Poor performance under load

### Example Providers
- DigitalOcean: $4-5/month
- Linode: $5/month
- Vultr: $2.50/month
- Hetzner: €2.50/month

---

## 🟡 RECOMMENDED VPS (Current Scale)

**Use Case:** Production API, 1,000-5,000 API calls/day, small team

### Specs
- **CPU:** 2 vCPU (2.4 GHz+)
- **RAM:** 4 GB
- **Storage:** 100 GB SSD
- **Bandwidth:** 5 TB/month
- **Estimated Cost:** $12-20/month

### Why This Size?
- ✅ Comfortable for current usage
- ✅ Room for 2-3x growth
- ✅ Background scraping without lag
- ✅ Database caching in memory
- ✅ Good price/performance ratio

### Capability
- Max concurrent users: 100-200
- API requests/day: 5,000-10,000
- Image serving: Fast
- Discovery scripts: Non-blocking

### Example Providers
- DigitalOcean Standard: $12-20/month (2GB-4GB)
- Linode Nanode: $5-10/month (1GB-2GB)
- Vultr Regular: $6-12/month (1GB-2GB)
- AWS t3.small: $15-20/month
- Hetzner CPX11: €5/month (2GB)

### Recommended Configuration
```yaml
CPU: 2 vCPU
RAM: 4 GB
Storage: 100 GB SSD (20 GB used, 80 GB free)
Distribution: Ubuntu 22.04 LTS
Backup: Daily snapshots (50-100 MB each)
```

---

## 🟢 PRODUCTION VPS (Moderate Scale)

**Use Case:** Production API, 10,000-50,000 API calls/day, multiple teams

### Specs
- **CPU:** 4 vCPU (2.6 GHz+)
- **RAM:** 8 GB
- **Storage:** 200 GB SSD
- **Bandwidth:** 10 TB/month
- **Estimated Cost:** $30-50/month

### Why This Size?
- ✅ Handle 10x current traffic
- ✅ Concurrent price updates
- ✅ Multiple scrapers running
- ✅ Real-time data queries
- ✅ Room for 5+ years growth

### Capability
- Max concurrent users: 500-1,000
- API requests/day: 50,000+
- Scraping jobs: Parallel execution
- Image storage: Unlimited growth
- Database: In-memory caching

### Example Providers
- DigitalOcean Standard: $24-40/month (4GB-8GB)
- Linode Linode 8GB: $40/month
- Vultr High Performance: $24-40/month
- AWS t3.medium: $30-35/month
- Hetzner CPX21: €10/month (4GB)

### Recommended Configuration
```yaml
CPU: 4 vCPU
RAM: 8 GB
Storage: 200 GB SSD (50 GB used, 150 GB free)
Distribution: Ubuntu 22.04 LTS
Database Replication: Read replicas optional
Cache: Redis (2 GB)
Backup: Hourly snapshots + offsite backup
CDN: CloudFlare for images
```

---

## 🟣 ENTERPRISE VPS (High Scale)

**Use Case:** High-traffic API, 100,000+ API calls/day, enterprise customers

### Specs
- **CPU:** 8+ vCPU (3.0 GHz+)
- **RAM:** 16+ GB
- **Storage:** 500+ GB SSD
- **Bandwidth:** 50+ TB/month
- **Estimated Cost:** $60-150/month

### Why This Size?
- ✅ Handle 100x current traffic
- ✅ Multi-region deployment ready
- ✅ Load balancing capability
- ✅ Database clustering
- ✅ Unlimited growth potential

### Capability
- Max concurrent users: 5,000+
- API requests/day: 500,000+
- Microservices architecture
- Multiple scraping servers
- Database replication

### Example Providers
- DigitalOcean Premium: $60-100/month
- Linode Linode 16GB: $80/month
- AWS t3.large: $60-70/month
- Hetzner CPX31: €20/month (8GB)
- Bare Metal Servers: $100-200/month

### Recommended Configuration
```yaml
CPU: 8 vCPU
RAM: 16 GB
Storage: 500 GB SSD (100 GB used, 400 GB free)
Database: PostgreSQL 14+ with replication
Cache: Redis cluster (5-10 GB)
Load Balancer: Nginx/HAProxy
Monitoring: Prometheus + Grafana
Backup: Real-time replication + S3 backup
CDN: CloudFlare + AWS CloudFront
```

---

## Cost Breakdown by Scale

### Year 1 Costs (Recommended)

| Item | Cost | Notes |
|------|------|-------|
| VPS (2 vCPU, 4GB) | $144-240 | $12-20/month |
| Backup Storage | $10-20 | Offsite backups |
| CDN (CloudFlare) | $200 | For images (optional) |
| Domain | $12 | yearly |
| SSL Cert | Free | Let's Encrypt |
| **Total** | **$366-472/year** | ~$30-40/month |

### Growth Path

| Stage | Users | API Calls/Day | VPS | Cost/Month |
|-------|-------|---------------|-----|-----------|
| MVP | 10 | 100 | 1 vCPU, 1 GB | $5 |
| Beta | 50 | 1,000 | 2 vCPU, 2 GB | $10 |
| **Launch** (Current) | 200 | 5,000 | **2 vCPU, 4 GB** | **$15** |
| Growth | 500 | 25,000 | 4 vCPU, 8 GB | $35 |
| Scale | 2,000 | 100,000 | 8 vCPU, 16 GB | $80 |
| Enterprise | 10,000 | 500,000 | 16 vCPU, 32 GB | $150+ |

---

## 📊 Storage Growth Projections

### Database Size Growth
```
Current: 1,116 sneakers = 3 MB
With price history (daily):
- 1 year:   ~2 GB
- 5 years:  ~10 GB
- 10 years: ~20 GB
```

### Image Storage Growth
```
Current: 1,082 images = 32 MB
With 5x catalog size = 160 MB
With 10x catalog size = 320 MB
```

### Total Storage Needs
```
Year 1:  50 GB (plenty of headroom)
Year 5:  150 GB (still comfortable)
Year 10: 300 GB (may need upgrade)
```

---

## 🚀 Scaling Strategies

### Stage 1: Vertical Scaling (Recommended)
Upgrade your single VPS as you grow:
1. Start: 2 vCPU, 4 GB
2. Year 1: 4 vCPU, 8 GB
3. Year 3: 8 vCPU, 16 GB

**Pros:** Simple, no architecture changes
**Cons:** Limited by hardware ceiling

### Stage 2: Horizontal Scaling (When needed)
Split services across multiple VPS:
```
Load Balancer (Nginx/HAProxy)
├── API Server 1 (Node.js)
├── API Server 2 (Node.js)
├── API Server 3 (Node.js)
├── Database Server (PostgreSQL)
├── Cache Server (Redis)
└── Image Server (CDN)
```

### Stage 3: Managed Services
Use cloud providers for scaling:
```
AWS/DigitalOcean/Azure
├── App Platform (Auto-scaling Node.js)
├── Managed PostgreSQL
├── Managed Redis
├── S3/Spaces (Image storage)
└── CloudFront/CloudFlare (CDN)
```

---

## 💾 Storage Optimization

### Current Setup: 32 MB Images
- 1,082 images × 30 KB average = 32 MB
- Format: WebP (optimized)
- Sizes: 600×600 (full) + 200×200 (thumb)

### Growth Scenarios

**Scenario 1: 2x Catalog (2,164 images)**
```
Storage: 64 MB
Cost: Negligible
Action: No action needed
```

**Scenario 2: 5x Catalog (5,410 images)**
```
Storage: 160 MB
Cost: $1-2/month if using S3
Action: Move to CDN
Command: aws s3 sync ~/images s3://bucket/images
```

**Scenario 3: 10x Catalog (10,820 images)**
```
Storage: 320 MB
Cost: $3-5/month if using S3
Action: Use CloudFront distribution
Result: Global image delivery, <100ms latency
```

---

## 🔧 Performance Tuning by VPS Size

### 1 vCPU, 1 GB RAM
```nginx
worker_processes 1;
worker_connections 256;

PostgreSQL shared_buffers = 256MB
PostgreSQL max_connections = 20
Redis: N/A (not needed)
```

### 2 vCPU, 4 GB RAM (Recommended)
```nginx
worker_processes 2;
worker_connections 1024;

PostgreSQL shared_buffers = 1GB
PostgreSQL max_connections = 100
Node.js cluster.fork(): 2 workers
Redis: N/A (optional)
```

### 4 vCPU, 8 GB RAM
```nginx
worker_processes 4;
worker_connections 2048;

PostgreSQL shared_buffers = 2GB
PostgreSQL max_connections = 200
Node.js cluster.fork(): 4 workers
Redis: 2 GB cache
```

### 8 vCPU, 16 GB RAM
```nginx
worker_processes 8;
worker_connections 4096;

PostgreSQL shared_buffers = 4GB
PostgreSQL max_connections = 400
Node.js cluster.fork(): 8 workers
Redis: 5 GB cache
```

---

## 📋 VPS Selection Checklist

When choosing a VPS provider, look for:

### Must Have
- [ ] SSD storage (not HDD)
- [ ] Ubuntu 22.04 LTS support
- [ ] Root/sudo access
- [ ] SSH key authentication
- [ ] Daily backups available
- [ ] ≥1 Gbps network
- [ ] DDoS protection
- [ ] Free outbound bandwidth

### Nice to Have
- [ ] API for automation
- [ ] Snapshot/backup scheduling
- [ ] One-click PostgreSQL
- [ ] Node.js pre-installed image
- [ ] Load balancing (if scaling)
- [ ] Monitoring dashboard
- [ ] 24/7 support
- [ ] Global data centers

---

## ✅ Recommended VPS Setup (2026)

### Best Value
```
Provider: Hetzner Cloud
Plan: CPX21
CPU: 3 vCPU
RAM: 4 GB
Storage: 40 GB NVMe SSD
Price: €8.30/month (~$9/month)
Location: Multiple (Frankfurt, US, Singapore)
Bonus: Excellent price/performance, good support
```

### Best Balance
```
Provider: DigitalOcean
Plan: Standard Droplet
CPU: 2 vCPU
RAM: 4 GB
Storage: 80 GB SSD
Price: $12-20/month
Location: Multiple worldwide
Bonus: Great UI, app marketplace, managed PostgreSQL available
```

### Best for Scale
```
Provider: AWS
Plan: t3.medium
CPU: 2 vCPU
RAM: 4 GB
Storage: 80 GB gp3 SSD
Price: $30-35/month
Location: Multiple regions worldwide
Bonus: Auto-scaling, managed services, global infrastructure
```

---

## 🎯 My Recommendation for You

### Current (1,116 sneakers, 1,082 images)
**2 vCPU, 4 GB RAM, 100 GB SSD**
- Price: $12-20/month
- Perfect headroom for growth
- Handles 100x traffic

### 1-Year Plan (5,000+ sneakers)
**Upgrade to 4 vCPU, 8 GB RAM**
- Price: $35-40/month
- Supports enterprise features
- Real-time price updates possible

### 3+ Year Plan (50,000+ products)
**Multi-VPS with load balancer**
- Multiple app servers
- Dedicated database server
- Managed cache layer
- CDN for images

---

## 🔐 Backup Strategy by VPS Size

### 1 vCPU, 1 GB
```
- Daily snapshots (local)
- Monthly offsite backup to S3
- No redundancy
```

### 2 vCPU, 4 GB (Recommended)
```
- Daily snapshots (local)
- Daily backup to S3
- Weekly full backup to different region
- Total backup: ~50-100 MB/day
- Cost: ~$5/month S3
```

### 4 vCPU, 8 GB+
```
- Hourly snapshots (local)
- Real-time replication to standby server
- Automated S3 backups
- Weekly full backup to different region
- Real-time redundancy
- Total cost: +$20-30/month
```

---

## Summary Table

| Metric | Minimum | Recommended | Production | Enterprise |
|--------|---------|-------------|-----------|------------|
| **CPU** | 1 vCPU | 2 vCPU | 4 vCPU | 8+ vCPU |
| **RAM** | 1 GB | 4 GB | 8 GB | 16+ GB |
| **Storage** | 50 GB | 100 GB | 200 GB | 500+ GB |
| **API Calls/Day** | 100 | 5,000 | 50,000+ | 500,000+ |
| **Price/Month** | $5 | $15 | $35 | $100+ |
| **Concurrent Users** | 10 | 200 | 1,000 | 5,000+ |
| **Use Case** | Dev | Prod | Growth | Enterprise |
| **TL;DR** | ❌ No | ✅ **YES** | ✅✅ | ✅✅✅ |

**Start with Recommended (2 vCPU, 4 GB) - perfect for current scale with room to grow!**

---

That's it! You have a clear path from MVP to enterprise scale. 🚀
