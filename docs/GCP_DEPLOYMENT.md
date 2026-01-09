# PhotoCat GCP Deployment Guide

## Prerequisites

1. **GCP Project**: Create or select a project at https://console.cloud.google.com
2. **gcloud CLI**: Install from https://cloud.google.com/sdk/docs/install
3. **Local Database**: Current PostgreSQL database with data to migrate

## Step 1: Configure GCP Project

```bash
# Set your project ID
export PROJECT_ID=photocat-483622
export REGION=us-central1
export DB_INSTANCE=photocat-db

# Authenticate
gcloud auth login
gcloud config set project $PROJECT_ID
```

## Step 2: Run Infrastructure Setup

```bash
# Make setup script executable
chmod +x scripts/setup_gcp.sh

# Run setup (creates buckets, Cloud SQL, service accounts, IAM)
./scripts/setup_gcp.sh $PROJECT_ID $REGION $DB_INSTANCE
```

This script will:
- Enable required GCP APIs
- Create Cloud Storage buckets (images & thumbnails)
- Create Cloud SQL PostgreSQL instance
- Set up Cloud Tasks queue
- Create service account with proper permissions

## Step 3: Configure Database Connection

```bash
# Get Cloud SQL connection name
gcloud sql instances describe $DB_INSTANCE --format="value(connectionName)"
# Output: photocat-483622:us-central1:photocat-db

# Create database user (if not exists)
gcloud sql users create photocat-user \
    --instance=$DB_INSTANCE \
    --password=$(openssl rand -base64 20)

# Save the password securely!
```

## Step 4: Store Secrets in Secret Manager

```bash
# Dropbox App Key & Secret
echo -n "your-dropbox-app-key" | gcloud secrets create dropbox-app-key --data-file=-
echo -n "your-dropbox-app-secret" | gcloud secrets create dropbox-app-secret --data-file=-

# Dropbox tenant tokens (repeat for each tenant)
echo -n "tenant-refresh-token" | gcloud secrets create dropbox-token-demo --data-file=-

# Database password
echo -n "your-db-password" | gcloud secrets create db-password --data-file=-

# Grant service account access to secrets
SERVICE_ACCOUNT="photocat-service@${PROJECT_ID}.iam.gserviceaccount.com"
for secret in dropbox-app-key dropbox-app-secret dropbox-token-demo db-password; do
    gcloud secrets add-iam-policy-binding $secret \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor"
done
```

## Step 5: Migrate Database

### Option A: Using Cloud SQL Proxy (Recommended)

```bash
# Install Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.2/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy

# Start proxy in background
./cloud-sql-proxy $PROJECT_ID:$REGION:$DB_INSTANCE --port=5433 &

# Export local database
pg_dump photocat > /tmp/photocat_backup.sql

# Import to Cloud SQL via proxy
PGPASSWORD="your-cloud-sql-password" psql -h localhost -p 5433 -U photocat-user -d photocat < /tmp/photocat_backup.sql

# Stop proxy
pkill cloud-sql-proxy
```

### Option B: Using gcloud sql import

```bash
# Export local database
pg_dump photocat | gzip > /tmp/photocat_backup.sql.gz

# Upload to Cloud Storage
gsutil cp /tmp/photocat_backup.sql.gz gs://${PROJECT_ID}-photocat-images/backups/

# Import to Cloud SQL
gcloud sql import sql $DB_INSTANCE \
    gs://${PROJECT_ID}-photocat-images/backups/photocat_backup.sql.gz \
    --database=photocat
```

## Step 6: Update Configuration

Create `.env.production`:

```bash
cat > .env.production <<EOF
# Production Configuration
DEBUG=false
WORKER_MODE=false

# Google Cloud Platform
GCP_PROJECT_ID=$PROJECT_ID
GCP_REGION=$REGION

# Cloud Storage
STORAGE_BUCKET_NAME=${PROJECT_ID}-images
THUMBNAIL_BUCKET_NAME=${PROJECT_ID}-thumbnails

# Database (Cloud SQL via Unix socket)
DATABASE_URL=postgresql://photocat-user:YOUR_PASSWORD@/photocat?host=/cloudsql/$PROJECT_ID:$REGION:$DB_INSTANCE

# Cloud Tasks
TASK_QUEUE_NAME=image-processing
TASK_LOCATION=$REGION

# Tagging Model
TAGGING_MODEL=siglip

# Processing Settings
THUMBNAIL_SIZE=256
BATCH_SIZE=10
MAX_WORKERS=4

# API Settings
API_HOST=0.0.0.0
API_PORT=8080
API_WORKERS=4
EOF
```

## Step 7: Deploy to Cloud Run

```bash
# Build and deploy using Cloud Build
gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=_CLOUDSQL_INSTANCE="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

# Or deploy directly with gcloud
gcloud run deploy photocat-api \
    --source . \
    --region=$REGION \
    --platform=managed \
    --allow-unauthenticated \
    --service-account=photocat-service@${PROJECT_ID}.iam.gserviceaccount.com \
    --add-cloudsql-instances=$PROJECT_ID:$REGION:$DB_INSTANCE \
    --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,TAGGING_MODEL=siglip" \
    --set-secrets="DROPBOX_APP_KEY=dropbox-app-key:latest,DROPBOX_APP_SECRET=dropbox-app-secret:latest,DATABASE_PASSWORD=db-password:latest" \
    --memory=4Gi \
    --cpu=2 \
    --timeout=900 \
    --max-instances=10
```

## Step 8: Verify Deployment

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe photocat-api --region=$REGION --format="value(status.url)")

echo "Service URL: $SERVICE_URL"

# Test health endpoint
curl $SERVICE_URL/health

# Test API
curl $SERVICE_URL/api/v1/tenants
```

## Step 9: Upload Model Files (One-time)

SigLIP model is large (3.5GB) and should be included in the container image or downloaded on first run.

### Option A: Bake into Docker image (increases build time)
Update Dockerfile to download model during build.

### Option B: Download on first Cloud Run instance startup (recommended)
Models will auto-download to `/tmp/.cache` on first use. Consider:
- Using Cloud Run minimum instances (keep 1 warm)
- Pre-warming by making test API call after deployment

## Step 10: Configure Domain (Optional)

```bash
# Map custom domain
gcloud run domain-mappings create --service=photocat-api \
    --domain=photocat.yourdomain.com \
    --region=$REGION
```

## Monitoring & Logs

```bash
# View logs
gcloud run logs read photocat-api --region=$REGION --limit=50

# View metrics in Cloud Console
open "https://console.cloud.google.com/run/detail/$REGION/photocat-api/metrics?project=$PROJECT_ID"
```

## Cost Optimization

1. **Cloud SQL**: Start with `db-f1-micro` (included in free tier), upgrade as needed
2. **Cloud Run**: Pay only for requests (free tier: 2M requests/month)
3. **Cloud Storage**: Set lifecycle policies to delete old thumbnails
4. **Cloud Run CPU allocation**: Use `--cpu-throttling` to reduce idle costs

## Troubleshooting

### Database Connection Issues
```bash
# Test Cloud SQL connectivity
gcloud sql connect $DB_INSTANCE --user=photocat-user --database=photocat
```

### Cloud Run Timeouts
- Increase `--timeout` (max 3600s)
- Use `--memory=4Gi` for model loading
- Consider Cloud Run Jobs for batch processing

### Model Loading Slow
- Use Cloud Run minimum instances: `--min-instances=1`
- Or bake model into Docker image

### Secrets Not Loading
```bash
# Verify service account has access
gcloud secrets describe dropbox-app-key --format="yaml(replication.automatic)"
```

## Rollback

```bash
# List revisions
gcloud run revisions list --service=photocat-api --region=$REGION

# Rollback to previous revision
gcloud run services update-traffic photocat-api \
    --to-revisions=REVISION_NAME=100 \
    --region=$REGION
```
