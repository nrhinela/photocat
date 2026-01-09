#!/bin/bash
# Run database migrations on Cloud SQL

set -e

PROJECT_ID="${1:-photocat-483622}"
REGION="${2:-us-central1}"
INSTANCE="${3:-photocat-db}"
DB_USER="${4:-photocat-user}"
DB_NAME="${5:-photocat}"
DB_PASSWORD="${6:-photocat123}"

echo "Running migrations on Cloud SQL instance: $INSTANCE"
echo "Project: $PROJECT_ID, Region: $REGION"

# Get the connection name
CONNECTION_NAME=$(gcloud sql instances describe "$INSTANCE" \
    --project="$PROJECT_ID" \
    --format="value(connectionName)")

echo "Connection: $CONNECTION_NAME"

# Activate virtual environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source venv/bin/activate

# Use gcloud sql connect for the migration
echo "Running Alembic migrations through gcloud sql connect..."
MIGRATION_SQL="
DO \$\$
BEGIN
    -- Create alembic_version table if needed
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alembic_version') THEN
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
    END IF;
END \$\$;
"

# First, let's use the local .env to connect via Alembic
# Temporarily override DATABASE_URL
OLD_DATABASE_URL="$DATABASE_URL"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"

# Use gcloud sql proxy in a different way - run the migration through gcloud sql execute
echo "Generating migration SQL..."
PGPASSWORD="${DB_PASSWORD}" alembic upgrade head --sql > /tmp/migration.sql 2>/dev/null || true

echo "Please run the migration manually using:"
echo "  gcloud sql connect ${INSTANCE} --user=${DB_USER} --database=${DB_NAME} --project=${PROJECT_ID}"
echo "Then copy/paste the contents of: /tmp/migration.sql"
echo ""
echo "Or use this one-liner:"
echo "  cat /tmp/migration.sql | gcloud sql connect ${INSTANCE} --user=${DB_USER} --database=${DB_NAME} --project=${PROJECT_ID}"

# Restore
export DATABASE_URL="$OLD_DATABASE_URL"
