# Supabase Migration Guide for PhotoCat

## Executive Summary

PhotoCat can be successfully migrated to Supabase with **zero database schema changes**. All PostgreSQL-specific features used in the codebase (JSONB, ARRAY types, partial indexes, composite constraints) are fully supported by Supabase's managed PostgreSQL database.

**Estimated Cost Savings**: From ~$5/day ($150/month) on Cloud SQL to ~$25/month on Supabase paid tier, or potentially free if within the generous free tier limits (~500MB database).

**Estimated Migration Effort**: 2-4 hours for a complete migration, including testing.

---

## Why Supabase?

### Cost Comparison

| Database | Base Cost | Connection Limit | Low Utilization | Best For |
|----------|-----------|------------------|-----------------|----------|
| Cloud SQL PostgreSQL | $5/day ($150/mo) | Generous | Always on | Production scale |
| Supabase Free Tier | Free | 20 concurrent | Graceful auto-pause | Development + low-traffic apps |
| Supabase Pro | $25/month | 100 concurrent | Cost-optimized | Production with features |
| Railway PostgreSQL | ~$5/month | Limited | Pay-as-you-go | Low utilization |

**For PhotoCat's low utilization**, Supabase free tier could work, or Pro tier at ~$200/year vs $1,800/year on Cloud SQL.

### Additional Benefits

1. **Built-in Features** (no extra cost):
   - Real-time subscriptions (WebSockets)
   - Row-Level Security (RLS) for multi-tenant isolation
   - Authentication system (JWT-based)
   - Vector storage (pgvector) for embeddings
   - PostgREST auto-generated API

2. **Developer Experience**:
   - Web dashboard for database management
   - No Cloud SQL proxy needed
   - Automated backups and point-in-time recovery
   - Built-in monitoring and metrics

3. **Seamless Migration**:
   - Drop-in PostgreSQL replacement
   - All your SQLAlchemy code works unchanged
   - All migrations run without modification

---

## Step-by-Step Migration Plan

### Phase 1: Setup Supabase Project (30 minutes)

#### 1.1 Create Supabase Account
```bash
# Visit https://supabase.com/dashboard
# Sign up with email or GitHub
```

#### 1.2 Create New Project
- Click "New Project"
- **Project Name**: `photocat-prod` (or `-dev` for development)
- **Database Password**: Generate secure password (save to `.env`)
- **Region**: Choose closest to your GCP region (us-central1 available)
- **Pricing Plan**: Pro ($25/month) for production, Free for development

#### 1.3 Get Connection String
```bash
# From Supabase Dashboard:
# 1. Go to Settings → Database → Connection Strings
# 2. Select "Node" or "Python" tab
# 3. Copy the connection string
# Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Example:
# postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

#### 1.4 Update Environment Variables
```bash
# .env file
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

**Do NOT commit `.env` to git!**

---

### Phase 2: Data Migration (45 minutes)

#### 2.1 Export Data from Current Database

```bash
# From your current Cloud SQL instance
# Using Cloud SQL Proxy (must be running in another terminal)
make db-proxy

# In a new terminal, export the entire database
pg_dump \
  -h 127.0.0.1 \
  -U postgres \
  -d photocat \
  --no-password \
  > photocat_backup.sql

# Verify file size (should match database size)
ls -lh photocat_backup.sql
```

#### 2.2 Prepare Backup for Supabase Import

Supabase has file size limits. If your dump is > 100MB, you may need to:

```bash
# Option A: Split into chunks
split -b 50M photocat_backup.sql photocat_backup_part_

# Option B: Use pg_restore with directory format (preferred)
pg_dump \
  -h 127.0.0.1 \
  -U postgres \
  -d photocat \
  --format=directory \
  --file=photocat_backup_dir
```

#### 2.3 Restore to Supabase

**Option A: Via psql (Recommended)**
```bash
# Test connection to Supabase
psql postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres

# Restore from backup
psql postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres < photocat_backup.sql

# Monitor progress (in another terminal)
psql postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres
> SELECT datname, pg_size_pretty(pg_database_size(datname))
  FROM pg_database
  WHERE datname = 'postgres';
```

**Option B: Via Supabase Dashboard**
1. Go to SQL Editor
2. Click "Create a new query"
3. Paste contents of `photocat_backup.sql`
4. Execute (for smaller dumps only)

**Option C: Via Supabase API**
See Supabase documentation for large file uploads.

#### 2.4 Verify Data Integrity

```bash
# Connect to Supabase database
psql postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres

# Check table counts
> SELECT schemaname, COUNT(*)
  FROM pg_tables
  WHERE schemaname = 'public'
  GROUP BY schemaname;

# Check tenant data
> SELECT id, name, active FROM tenants;

# Verify indexes were created
> SELECT indexname FROM pg_indexes WHERE schemaname = 'public';

# Verify constraints
> SELECT constraint_name FROM information_schema.table_constraints
  WHERE table_schema = 'public';
```

---

### Phase 3: Update Application Configuration (15 minutes)

#### 3.1 Update Settings

No code changes needed! Just environment variables:

```bash
# .env (development)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres
ENVIRONMENT=dev

# For production
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres
ENVIRONMENT=prod
```

#### 3.2 Test Connection

```bash
# Start development server
make dev

# Check logs for database connection
# Should see: "Connected to PostgreSQL"

# Make a test API call
curl http://localhost:8080/health
# Response: {"status": "healthy"}

# Check tenants
curl http://localhost:8080/api/v1/tenants
# Should return your tenants list
```

#### 3.3 Verify All Features Work

```bash
# Run test suite against Supabase
make test

# Check specific functionality:
# - Image upload/sync
# - Tagging operations
# - Search queries
# - Configuration CRUD
# - People tagging
```

---

### Phase 4: Optional - Implement Supabase RLS (1-2 hours)

Supabase includes Row-Level Security (RLS), which can enhance your multi-tenant isolation.

#### 4.1 Enable RLS on Tables

```sql
-- In Supabase SQL Editor

-- Enable RLS for image_metadata table
ALTER TABLE image_metadata ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their tenant's data
CREATE POLICY "Users can view their tenant's images"
  ON image_metadata
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id')::text
  );

-- Create policy: users can insert images for their tenant
CREATE POLICY "Users can insert images for their tenant"
  ON image_metadata
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::text
  );
```

#### 4.2 Set Tenant Context in Application

```python
# In photocat/dependencies.py

from sqlalchemy.orm import Session
from photocat.tenant import Tenant

async def get_db_with_rls(db: Session, tenant: Tenant = Depends(get_tenant)):
    """Set tenant context for RLS policies."""
    # Set the tenant ID in PostgreSQL session
    db.execute(f"SET app.current_tenant_id = '{tenant.id}'")
    return db
```

**Note**: RLS is optional; your current X-Tenant-ID header approach works fine.

---

### Phase 5: Update Deployment Configuration (30 minutes)

#### 5.1 Update Makefile

No changes needed! The Makefile uses environment variables that are the same.

#### 5.2 Update Docker Configuration

```dockerfile
# Dockerfile
# No changes to database configuration needed
# Just ensure DATABASE_URL is passed as environment variable

ENV DATABASE_URL=$DATABASE_URL
```

#### 5.3 Update cloudbuild.yaml

```yaml
# cloudbuild.yaml - only update environment variable source
steps:
  - name: 'gcr.io/cloud-builders/gke-deploy'
    args:
      - run
      - --filename=.
      - --location=${_REGION}
      - --cluster=${_CLUSTER_NAME}
    env:
      - 'DATABASE_URL=${_SUPABASE_DATABASE_URL}'
      - 'ENVIRONMENT=prod'

substitutions:
  _SUPABASE_DATABASE_URL: 'postgresql://postgres:${_SUPABASE_PASSWORD}@db.xxxxxxxxxxxx.supabase.co:5432/postgres'
  _SUPABASE_PASSWORD: '${SUPABASE_PASSWORD}'  # Store in Secret Manager
```

#### 5.4 Store Secrets in Google Secret Manager

```bash
# Add Supabase password to Google Secret Manager
echo -n "YOUR_SUPABASE_PASSWORD" | \
  gcloud secrets create supabase-password --data-file=-

# Or update existing
echo -n "YOUR_SUPABASE_PASSWORD" | \
  gcloud secrets versions add supabase-password --data-file=-

# Grant Cloud Build access
gcloud secrets add-iam-policy-binding supabase-password \
  --member=serviceAccount:YOUR_PROJECT_NUMBER@cloudbuild.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

### Phase 6: Testing and Validation (30 minutes)

#### 6.1 Run Full Test Suite

```bash
# Test against Supabase database
DATABASE_URL=postgresql://... pytest -v

# Should pass all tests:
# - Database connectivity tests
# - Migration tests
# - API endpoint tests
# - Multi-tenant isolation tests
# - Image processing tests
```

#### 6.2 Performance Baseline

```bash
# Compare query performance between Cloud SQL and Supabase
# Use your existing monitoring/logging

# Check connection pooling
# Supabase includes built-in connection pooling (PgBouncer)
# Optimal settings for FastAPI:
# - max_connections: 20-30 (adjust based on workers)
# - pool_pre_ping: True (validate connections)
```

#### 6.3 Backup Verification

```bash
# Supabase automatically backs up daily
# Verify you can access backups in dashboard:
# Database Settings → Backups

# Test point-in-time recovery is possible
# (don't restore, just verify the option exists)
```

---

### Phase 7: Deployment (30 minutes)

#### 7.1 Deploy to Production

```bash
# Update environment variables in Cloud Run/Cloud Build
gcloud run deploy photocat-api \
  --set-env-vars="DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres" \
  --region us-central1

# Verify deployment
curl https://your-app.run.app/health
curl https://your-app.run.app/api/v1/tenants
```

#### 7.2 Monitor Initial Traffic

```bash
# Check logs for any database errors
make logs-api

# Monitor Supabase metrics:
# - Connection count
# - Query performance
# - Storage usage
# (Available in Supabase dashboard)

# Check application metrics
# - Response times
# - Error rates
# - Database connection pool status
```

#### 7.3 Cut Over Old Database

After 24-48 hours of successful operation:

```bash
# Stop Cloud SQL instance
gcloud sql instances patch photocat-instance --backup-configuration enabled=False

# Or delete (after confirming backup exists)
gcloud sql instances delete photocat-instance --async

# Export final backup (for archive)
pg_dump postgresql://localhost/photocat > photocat_archive_$(date +%Y%m%d).sql
```

---

## Rollback Plan (If Needed)

If issues occur, you can quickly rollback:

```bash
# 1. Restore old Cloud SQL backup
gcloud sql backups restore BACKUP_ID --backup-instance=photocat-instance

# 2. Update .env back to old database URL
DATABASE_URL=postgresql://postgres:PASSWORD@CLOUD_SQL_IP:5432/photocat

# 3. Redeploy
gcloud run deploy photocat-api --set-env-vars="DATABASE_URL=..." --region us-central1

# 4. Keep Supabase as warm standby for next attempt
```

---

## Migration Checklist

- [ ] **Phase 1**: Supabase project created
  - [ ] Project created and database initialized
  - [ ] Connection string obtained
  - [ ] Password stored securely

- [ ] **Phase 2**: Data migrated
  - [ ] Database backed up from Cloud SQL
  - [ ] Data restored to Supabase
  - [ ] Data integrity verified (table counts, constraints)

- [ ] **Phase 3**: Application configured
  - [ ] .env file updated with Supabase URL
  - [ ] Local development tested
  - [ ] Test suite passes

- [ ] **Phase 4**: Optional RLS (if implementing)
  - [ ] RLS policies created
  - [ ] Tenant context setting implemented
  - [ ] Multi-tenant isolation verified

- [ ] **Phase 5**: Deployment updated
  - [ ] Makefile verified (no changes needed)
  - [ ] Docker configuration updated
  - [ ] cloudbuild.yaml updated
  - [ ] Secrets stored in Secret Manager

- [ ] **Phase 6**: Testing complete
  - [ ] Full test suite passes on Supabase
  - [ ] Performance baseline established
  - [ ] Backup/restore process verified

- [ ] **Phase 7**: Production deployment
  - [ ] Deployed to Cloud Run with new DB URL
  - [ ] Monitoring active
  - [ ] 24-48 hours of stable operation
  - [ ] Old Cloud SQL instance shut down

---

## Known Considerations

### 1. Connection Pooling

Supabase includes PgBouncer for connection pooling. Existing settings work fine:

```python
# settings.py - no changes needed
db_pool_size: int = 10      # SQLAlchemy connection pool
db_max_overflow: int = 20   # Supabase handles additional connections
```

### 2. ARRAY and JSONB Types

All your ARRAY and JSONB columns work perfectly in Supabase:

```python
# metadata/__init__.py
# SQLite compatibility layer can be removed (not needed for Supabase)
# But leaving it in doesn't hurt - it's not used in production anyway
```

### 3. Unique Partial Indexes

Supabase fully supports PostgreSQL partial indexes:

```sql
-- This works perfectly in Supabase:
CREATE UNIQUE INDEX uq_photo_lists_active_per_tenant
  ON photo_lists (tenant_id)
  WHERE is_active = true;
```

### 4. Network Security

Supabase databases require authentication but are public-facing. Ensure:

```bash
# Firewall rules in Supabase dashboard
# Settings → Database → Firewall Rules
# - Allow your application's IP
# - Restrict to necessary ranges
```

### 5. Multi-Tenant Isolation

Your current approach (X-Tenant-ID header + application-level checks) remains secure. RLS is optional enhancement.

---

## Cost Breakdown

### Current Setup (Cloud SQL)
- Instance: $5/day = $150/month
- Storage: ~$10/month (assuming 100GB)
- Backups: ~$5/month
- **Total: ~$165/month**

### Supabase Option A (Free Tier)
- Database: Free
- Storage: Free (500MB included)
- **Total: $0/month**
- Limitations:
  - 1 project
  - Auto-pause after 1 week inactivity
  - 500MB storage limit

### Supabase Option B (Pro Tier)
- Database: $25/month
- Storage: $100/month per 1GB after 8GB included
- Backups: Included
- **Total: $25-125/month** (depending on storage needs)

### Estimated Savings
- **Free Tier**: $165/month saved (if storage fits)
- **Pro Tier**: $40-140/month saved

---

## Migration Support Resources

### Official Documentation
- [Supabase Getting Started](https://supabase.com/docs/getting-started/quickstarts)
- [Supabase Database](https://supabase.com/docs/guides/database)
- [Migrating to Supabase](https://supabase.com/docs/guides/migrations)

### PostgreSQL Tools
- [pg_dump documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [psql documentation](https://www.postgresql.org/docs/current/app-psql.html)

### Community
- [Supabase Discord](https://discord.supabase.io)
- [PostgreSQL Community](https://www.postgresql.org/community/)

---

## FAQ

### Q: Will my Alembic migrations still work?
**A**: Yes, completely unchanged. Alembic works perfectly with Supabase PostgreSQL.

### Q: Do I need to change my SQLAlchemy code?
**A**: No, not at all. Your ORM code is database-agnostic.

### Q: How do I handle the connection string change?
**A**: Just update the `DATABASE_URL` environment variable. Everything else stays the same.

### Q: Is Supabase secure for sensitive image metadata?
**A**: Yes. Supabase:
- Uses TLS/SSL for all connections
- Encrypts data at rest
- Supports Row-Level Security (RLS)
- Has built-in authentication
- Complies with GDPR/SOC 2

### Q: What if I hit storage limits on free tier?
**A**: Upgrade to Pro tier ($25/month). Supabase handles the upgrade seamlessly with zero downtime.

### Q: Can I keep my data on both databases during transition?
**A**: Yes. You can run dual-write (writes to both) for 24-48 hours to verify accuracy before switching off old DB.

### Q: How long does data restoration take?
**A**: Depends on database size:
- < 1GB: 5-15 minutes
- 1-10GB: 15-60 minutes
- > 10GB: 1-4 hours

### Q: Do I need Cloud SQL proxy with Supabase?
**A**: No. Supabase databases are directly accessible (over encrypted connection). No proxy needed.

---

## Next Steps

1. **Immediate**: Review this guide and answer any questions
2. **This Week**: Set up Supabase project and test with development database
3. **Next Week**: Perform full migration to test environment
4. **Following Week**: Deploy to production when confident

**Estimated Total Time**: 4-6 hours hands-on + 24-48 hours monitoring

---

**Document Version**: 1.0
**Last Updated**: 2026-01-24
**Status**: Ready for implementation
