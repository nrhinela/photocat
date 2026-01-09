#!/bin/bash
# Quick deployment script for PhotoCat

set -e

PROJECT_ID=${1:-"photocat-483622"}
REGION=${2:-"us-central1"}
DB_INSTANCE=${3:-"photocat-db"}

echo "🚀 Deploying PhotoCat to GCP..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Check if gcloud is configured
if ! gcloud config get-value project >/dev/null 2>&1; then
    echo "❌ Please configure gcloud first: gcloud config set project $PROJECT_ID"
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID

# Get Cloud SQL connection name
CLOUDSQL_CONNECTION=$(gcloud sql instances describe $DB_INSTANCE --format="value(connectionName)" 2>/dev/null || echo "")

if [ -z "$CLOUDSQL_CONNECTION" ]; then
    echo "❌ Cloud SQL instance '$DB_INSTANCE' not found"
    echo "💡 Run: ./scripts/setup_gcp.sh $PROJECT_ID $REGION $DB_INSTANCE"
    exit 1
fi

echo "✅ Found Cloud SQL instance: $CLOUDSQL_CONNECTION"
echo ""

# Build and deploy
echo "🏗️  Building container image..."
gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=_CLOUDSQL_INSTANCE="$CLOUDSQL_CONNECTION",COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')" \
    --timeout=30m

echo ""
echo "✅ Deployment complete!"
echo ""

# Get service URL
SERVICE_URL=$(gcloud run services describe photocat-api --region=$REGION --format="value(status.url)" 2>/dev/null || echo "")

if [ -n "$SERVICE_URL" ]; then
    echo "🌐 Service URL: $SERVICE_URL"
    echo ""
    echo "Test your deployment:"
    echo "  curl $SERVICE_URL/health"
    echo "  open $SERVICE_URL"
else
    echo "⚠️  Could not retrieve service URL. Check Cloud Console."
fi
