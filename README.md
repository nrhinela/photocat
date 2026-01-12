# PhotoCat

Multi-tenant image organization and search utility for Dropbox collections.

## Features

- **Multi-Tenant**: Isolated configurations and data per client
- **Image Processing**: Efficient handling of various formats (JPEG, PNG, HEIC, RAW)
- **Smart Metadata**: EXIF extraction, visual features, facial recognition
- **Controlled Vocabularies**: Configurable keywords and people per tenant
- **Flexible Search**: Text, visual similarity, date range, location-based
- **Cost-Optimized**: Intelligent caching and selective AI processing
- **Cloud-Native**: Built for Google Cloud Platform

## Architecture

```
photocat/
├── src/photocat/          # Main application code
│   ├── tenant/           # Tenant management and isolation
│   ├── config/           # Configuration loading and validation
│   ├── dropbox/          # Dropbox API integration
│   ├── image/            # Image processing and feature extraction
│   ├── metadata/         # Metadata engine and storage
│   ├── search/           # Search indexing and queries
│   └── api/              # FastAPI web service
├── config/               # Tenant configurations
│   └── {tenant_id}/
│       ├── keywords.yaml
│       └── people.yaml
├── tests/                # Test suite
└── alembic/             # Database migrations
```

## Setup

### Prerequisites
- Python 3.11+
- Google Cloud SDK
- Cloud SQL PostgreSQL instance
- Dropbox App credentials

### Development Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Setup Cloud SQL proxy
cloud-sql-proxy INSTANCE_CONNECTION_NAME

# Run migrations
alembic upgrade head

# Run tests
pytest

# Format code
black . && ruff check .
```

## Configuration

Each tenant requires:
1. `config/{tenant_id}/keywords.yaml` - Hierarchical content categories
2. `config/{tenant_id}/people.yaml` - People for facial recognition
3. Dropbox OAuth credentials in Secret Manager (`dropbox-token-{tenant_id}`)

## Deployment

The preferred method for deploying the application is using the provided `Makefile`, which simplifies the process and ensures all steps are followed correctly. For a comprehensive guide on deployment, database migrations, and other operational tasks, please see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Simplified Deployment (Makefile)

The following commands are the recommended way to deploy the application:

```bash
# Deploy all services (API and worker) to production
make deploy-all

# Or, deploy services individually
make deploy-api
make deploy-worker
```

### Manual Deployment (gcloud)

The `make` commands are wrappers around `gcloud` commands. If you need to deploy manually, you can use the following:

```bash
# Deploy API service
gcloud run deploy photocat \
  --source . \
  --region us-central1 \
  --allow-unauthenticated

# Deploy background worker
gcloud run deploy photocat-worker \
  --source . \
  --no-allow-unauthenticated \
  --set-env-vars WORKER_MODE=true
```

## License

Proprietary
