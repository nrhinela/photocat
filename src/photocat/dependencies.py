"""Shared dependencies for FastAPI endpoints."""

from typing import Optional

from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from google.cloud import secretmanager

from photocat.database import SessionLocal
from photocat.tenant import Tenant
from photocat.metadata import Tenant as TenantModel
from photocat.settings import settings


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_tenant(
    x_tenant_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Tenant:
    """Extract and validate tenant from request headers."""
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-ID header required")

    # Load tenant from database
    tenant_row = db.query(TenantModel).filter(TenantModel.id == x_tenant_id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail=f"Tenant {x_tenant_id} not found")

    # Convert database row to Tenant dataclass
    tenant = Tenant(
        id=tenant_row.id,
        name=tenant_row.name,
        active=tenant_row.active,
        dropbox_token_secret=f"dropbox-token-{tenant_row.id}",
        dropbox_app_key=tenant_row.dropbox_app_key,
        dropbox_app_secret=f"dropbox-app-secret-{tenant_row.id}",
        storage_bucket=tenant_row.storage_bucket,
        thumbnail_bucket=tenant_row.thumbnail_bucket,
    )
    return tenant


def get_secret(secret_id: str) -> str:
    """Get secret from Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{settings.gcp_project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode('UTF-8')


def store_secret(secret_id: str, value: str) -> None:
    """Store secret in Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    parent = f"projects/{settings.gcp_project_id}"

    try:
        # Try to create secret
        secret = client.create_secret(
            request={
                "parent": parent,
                "secret_id": secret_id,
                "secret": {"replication": {"automatic": {}}},
            }
        )
    except Exception:
        # Secret already exists
        pass

    # Add version
    parent_secret = f"projects/{settings.gcp_project_id}/secrets/{secret_id}"
    client.add_secret_version(
        request={
            "parent": parent_secret,
            "payload": {"data": value.encode('UTF-8')},
        }
    )
