#!/bin/bash
# Migrate local PostgreSQL schema to Cloud SQL

set -e

PROJECT_ID=${1:-"photocat-483622"}
REGION=${2:-"us-central1"}
DB_INSTANCE=${3:-"photocat-db"}
LOCAL_DB=${4:-"photocat"}

echo "🔄 Migrating database schema to Cloud SQL..."
echo "Local DB: $LOCAL_DB"
echo "Cloud SQL: $PROJECT_ID:$REGION:$DB_INSTANCE"
echo ""

# Check if Cloud SQL Proxy is available
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo "📥 Downloading Cloud SQL Proxy..."
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        PROXY_URL="https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.2/cloud-sql-proxy.darwin.amd64"
    else
        PROXY_URL="https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.2/cloud-sql-proxy.linux.amd64"
    fi
    
    curl -o /tmp/cloud-sql-proxy $PROXY_URL
    chmod +x /tmp/cloud-sql-proxy
    PROXY_CMD="/tmp/cloud-sql-proxy"
else
    PROXY_CMD="cloud-sql-proxy"
fi

# Get Cloud SQL connection name
CLOUDSQL_CONNECTION=$(gcloud sql instances describe $DB_INSTANCE --format="value(connectionName)")
echo "✅ Cloud SQL connection: $CLOUDSQL_CONNECTION"
echo ""

# Export schema only (without ownership info)
echo "📦 Exporting database schema..."
BACKUP_FILE="/tmp/photocat_schema_$(date +%Y%m%d_%H%M%S).sql"
pg_dump --schema-only --no-owner --no-acl $LOCAL_DB > $BACKUP_FILE
echo "✅ Schema saved to: $BACKUP_FILE"
echo ""

# Prompt for Cloud SQL password
echo "🔐 Enter Cloud SQL password for user 'photocat-user':"
read -s CLOUD_SQL_PASSWORD
echo ""

# Create temporary .pgpass file for authentication
PGPASS_FILE="/tmp/.pgpass_$$"
echo "localhost:5433:photocat:photocat-user:$CLOUD_SQL_PASSWORD" > $PGPASS_FILE
chmod 600 $PGPASS_FILE
export PGPASSFILE=$PGPASS_FILE

# Start Cloud SQL Proxy in background
echo "🔌 Starting Cloud SQL Proxy on port 5433..."
$PROXY_CMD $CLOUDSQL_CONNECTION --port=5433 &
PROXY_PID=$!

# Wait for proxy to be ready
sleep 5

# Test connection first
echo "🔍 Testing Cloud SQL connection..."
if ! psql -h localhost -p 5433 -U photocat-user -d photocat -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ Failed to connect to Cloud SQL. Check your password."
    rm -f $PGPASS_FILE
    kill $PROXY_PID 2>/dev/null
    exit 1
fi
echo "✅ Connection successful"
echo ""

# Import to Cloud SQL
echo "📥 Importing schema to Cloud SQL..."
psql -h localhost -p 5433 -U photocat-user -d photocat < $BACKUP_FILE

echo ""
echo "✅ Schema migration complete!"

# Verify tables
echo "📊 Cloud SQL tables:"
psql -h localhost -p 5433 -U photocat-user -d photocat -c "\\dt" 2>/dev/null || echo "⚠️  Could not list tables"

# Clean up
rm -f $PGPASS_FILE
unset PGPASSFILE

# Stop proxy
kill $PROXY_PID

echo ""
echo "🎉 Schema migration successful!"
echo "📁 Schema file: $BACKUP_FILE"
echo ""
echo "Next steps:"
echo "  1. Deploy application: ./scripts/deploy.sh"
echo "  2. Test service URL"
echo "  3. Update Dropbox OAuth redirect URIs to Cloud Run URL"
