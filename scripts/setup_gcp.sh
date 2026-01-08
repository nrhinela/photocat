#!/bin/bash
# GCP Infrastructure Setup Script

set -e

PROJECT_ID=${1:-"your-project-id"}
REGION=${2:-"us-central1"}
DB_INSTANCE=${3:-"photocat-db"}

echo "Setting up PhotoCat infrastructure in project: $PROJECT_ID"

# Enable required APIs
echo "Enabling GCP APIs..."
gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    storage.googleapis.com \
    secretmanager.googleapis.com \
    cloudtasks.googleapis.com \
    logging.googleapis.com \
    cloudbuild.googleapis.com \
    --project=$PROJECT_ID

# Create Cloud Storage buckets
echo "Creating Cloud Storage buckets..."
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-photocat-images || true
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://${PROJECT_ID}-photocat-thumbnails || true

# Set lifecycle policy for thumbnails (optional cost optimization)
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 365}
      }
    ]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://${PROJECT_ID}-photocat-thumbnails
rm lifecycle.json

# Create Cloud SQL PostgreSQL instance
echo "Creating Cloud SQL instance..."
gcloud sql instances create $DB_INSTANCE \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --root-password=$(openssl rand -base64 32) \
    --project=$PROJECT_ID || echo "Instance already exists"

# Create database
gcloud sql databases create photocat \
    --instance=$DB_INSTANCE \
    --project=$PROJECT_ID || echo "Database already exists"

# Create Cloud Tasks queue
echo "Creating Cloud Tasks queue..."
gcloud tasks queues create image-processing \
    --location=$REGION \
    --project=$PROJECT_ID || echo "Queue already exists"

# Create service account
echo "Creating service account..."
gcloud iam service-accounts create photocat-service \
    --display-name="PhotoCat Service Account" \
    --project=$PROJECT_ID || echo "Service account already exists"

# Grant IAM permissions
echo "Granting IAM permissions..."
SERVICE_ACCOUNT="photocat-service@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudtasks.enqueuer"

echo "Infrastructure setup complete!"
echo ""
echo "Next steps:"
echo "1. Set up Dropbox app credentials in Secret Manager"
echo "2. Configure .env file with your settings"
echo "3. Run database migrations: alembic upgrade head"
echo "4. Deploy with: gcloud builds submit --config=cloudbuild.yaml"
