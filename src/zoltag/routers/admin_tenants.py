"""Router for tenant management endpoints."""

from datetime import datetime
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from zoltag.dependencies import get_db
from zoltag.auth.dependencies import get_current_user
from zoltag.auth.models import UserProfile, UserTenant
from zoltag.metadata import Tenant as TenantModel
from zoltag.tenant_scope import tenant_reference_filter, tenant_column_filter_for_values

router = APIRouter(
    prefix="/api/v1/admin/tenants",
    tags=["admin-tenants"],
)


IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9-]+$")


def _normalize_identifier(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="identifier is required")
    if not IDENTIFIER_PATTERN.match(normalized):
        raise HTTPException(
            status_code=400,
            detail="identifier must contain only lowercase letters, numbers, and hyphens",
        )
    return normalized


def _normalize_tenant_id(value: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return ""
    try:
        return str(uuid.UUID(normalized))
    except (ValueError, TypeError, AttributeError):
        return ""


def _resolve_tenant(db: Session, tenant_ref: str):
    return db.query(TenantModel).filter(tenant_reference_filter(TenantModel, tenant_ref)).first()


def _resolved_dropbox_app_key(tenant: TenantModel) -> str:
    settings_payload = getattr(tenant, "settings", None) or {}
    key_from_settings = settings_payload.get("dropbox_app_key") if isinstance(settings_payload, dict) else None
    return (tenant.dropbox_app_key or key_from_settings or "").strip()


def _require_super_admin(user: UserProfile) -> None:
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin role required")


def _user_is_tenant_admin(db: Session, user: UserProfile, tenant: TenantModel) -> bool:
    membership = db.query(UserTenant).filter(
        UserTenant.supabase_uid == user.supabase_uid,
        tenant_column_filter_for_values(UserTenant, str(tenant.id)),
        UserTenant.accepted_at.isnot(None),
        UserTenant.role == "admin",
    ).first()
    return membership is not None


def _require_tenant_admin_or_super_admin(db: Session, user: UserProfile, tenant: TenantModel) -> None:
    if user.is_super_admin:
        return
    if _user_is_tenant_admin(db, user, tenant):
        return
    raise HTTPException(status_code=403, detail="Admin role required for this tenant")


@router.get("", response_model=list)
async def list_tenants(
    db: Session = Depends(get_db),
    details: bool = False,
    user: UserProfile = Depends(get_current_user),
):
    """List all tenants."""
    if user.is_super_admin:
        tenant_filter_ids = None
    else:
        tenant_filter_ids = [
            row[0]
            for row in db.query(UserTenant.tenant_id).filter(
                UserTenant.supabase_uid == user.supabase_uid,
                UserTenant.accepted_at.isnot(None),
                UserTenant.role == "admin",
            ).all()
        ]
        if not tenant_filter_ids:
            return []

    if details:
        tenant_query = db.query(TenantModel)
        if tenant_filter_ids is not None:
            tenant_query = tenant_query.filter(TenantModel.id.in_(tenant_filter_ids))
        tenants = tenant_query.all()
        return [{
            "dropbox_app_key": _resolved_dropbox_app_key(t),
            "id": str(t.id),
            "identifier": getattr(t, "identifier", None) or str(t.id),
            "key_prefix": getattr(t, "key_prefix", None) or str(t.id),
            "name": t.name,
            "active": t.active,
            "dropbox_configured": bool(_resolved_dropbox_app_key(t)),  # Has app key configured
            "storage_bucket": t.storage_bucket,
            "thumbnail_bucket": t.thumbnail_bucket,
            "settings": t.settings,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        } for t in tenants]

    row_query = db.query(
        TenantModel.id,
        TenantModel.identifier,
        TenantModel.key_prefix,
        TenantModel.name,
        TenantModel.active,
        TenantModel.dropbox_app_key,
        TenantModel.settings,
        TenantModel.storage_bucket,
        TenantModel.thumbnail_bucket,
        TenantModel.created_at,
        TenantModel.updated_at,
    )
    if tenant_filter_ids is not None:
        row_query = row_query.filter(TenantModel.id.in_(tenant_filter_ids))
    rows = row_query.all()

    return [{
        "dropbox_app_key": (row.dropbox_app_key or ((row.settings or {}).get("dropbox_app_key") if isinstance(row.settings, dict) else "") or "").strip(),
        "id": str(row.id),
        "identifier": getattr(row, "identifier", None) or str(row.id),
        "key_prefix": getattr(row, "key_prefix", None) or str(row.id),
        "name": row.name,
        "active": row.active,
        "dropbox_configured": bool((row.dropbox_app_key or ((row.settings or {}).get("dropbox_app_key") if isinstance(row.settings, dict) else "") or "").strip()),
        "storage_bucket": row.storage_bucket,
        "thumbnail_bucket": row.thumbnail_bucket,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None
    } for row in rows]


@router.get("/{tenant_id}", response_model=dict)
async def get_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
):
    """Get a single tenant (full details)."""
    tenant = _resolve_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    _require_tenant_admin_or_super_admin(db, user, tenant)

    return {
        "dropbox_app_key": _resolved_dropbox_app_key(tenant),
        "id": str(tenant.id),
        "identifier": getattr(tenant, "identifier", None) or str(tenant.id),
        "key_prefix": getattr(tenant, "key_prefix", None) or str(tenant.id),
        "name": tenant.name,
        "active": tenant.active,
        "dropbox_configured": bool(_resolved_dropbox_app_key(tenant)),
        "storage_bucket": tenant.storage_bucket,
        "thumbnail_bucket": tenant.thumbnail_bucket,
        "settings": tenant.settings,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "updated_at": tenant.updated_at.isoformat() if tenant.updated_at else None
    }


@router.post("", response_model=dict)
async def create_tenant(
    tenant_data: dict,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
):
    """Create a new tenant."""
    _require_super_admin(user)
    # Validate required fields
    if not tenant_data.get("name"):
        raise HTTPException(status_code=400, detail="name is required")
    requested_id_raw = (tenant_data.get("id") or "").strip()
    requested_id_uuid = _normalize_tenant_id(requested_id_raw)
    identifier_seed = tenant_data.get("identifier") or requested_id_raw
    identifier = _normalize_identifier(identifier_seed or "")
    key_prefix = _normalize_identifier(tenant_data.get("key_prefix") or identifier)
    tenant_id = requested_id_uuid or str(uuid.uuid4())

    # Check if tenant already exists
    existing = db.query(TenantModel).filter(TenantModel.id == tenant_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tenant already exists")
    existing_identifier = db.query(TenantModel).filter(TenantModel.identifier == identifier).first()
    if existing_identifier:
        raise HTTPException(status_code=409, detail="Tenant identifier already exists")
    existing_key_prefix = db.query(TenantModel).filter(TenantModel.key_prefix == key_prefix).first()
    if existing_key_prefix:
        raise HTTPException(status_code=409, detail="Tenant key_prefix already exists")

    # Create tenant
    tenant = TenantModel(
        id=tenant_id,
        identifier=identifier,
        key_prefix=key_prefix,
        name=tenant_data["name"],
        active=tenant_data.get("active", True),
        dropbox_app_key=tenant_data.get("dropbox_app_key"),
        settings=tenant_data.get("settings", {})
    )

    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    return {
        "id": str(tenant.id),
        "identifier": getattr(tenant, "identifier", None) or str(tenant.id),
        "key_prefix": getattr(tenant, "key_prefix", None) or str(tenant.id),
        "name": tenant.name,
        "active": tenant.active,
        "created_at": tenant.created_at.isoformat()
    }


@router.put("/{tenant_id}", response_model=dict)
async def update_tenant(
    tenant_id: str,
    tenant_data: dict,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
):
    """Update an existing tenant."""
    tenant = _resolve_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    _require_tenant_admin_or_super_admin(db, user, tenant)

    if not user.is_super_admin:
        restricted_fields = {"id", "identifier", "key_prefix", "name", "active"}
        attempted_restricted_fields = sorted(set(tenant_data.keys()) & restricted_fields)
        if attempted_restricted_fields:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Only super admins can update these fields: "
                    + ", ".join(attempted_restricted_fields)
                ),
            )

    if "id" in tenant_data:
        requested_id = _normalize_tenant_id(tenant_data.get("id") or "") or (tenant_data.get("id") or "").strip()
        if requested_id != str(tenant.id):
            raise HTTPException(status_code=400, detail="tenant id is immutable")
    if "key_prefix" in tenant_data:
        requested_key_prefix = _normalize_identifier(tenant_data.get("key_prefix") or "")
        if requested_key_prefix != (getattr(tenant, "key_prefix", None) or str(tenant.id)):
            raise HTTPException(status_code=400, detail="key_prefix is immutable")
    if "identifier" in tenant_data:
        updated_identifier = _normalize_identifier(tenant_data.get("identifier") or "")
        existing_identifier = db.query(TenantModel).filter(
            TenantModel.identifier == updated_identifier,
            TenantModel.id != tenant.id,
        ).first()
        if existing_identifier:
            raise HTTPException(status_code=409, detail="Tenant identifier already exists")
        tenant.identifier = updated_identifier

    # Update fields
    if "name" in tenant_data:
        tenant.name = tenant_data["name"]
    if "active" in tenant_data:
        tenant.active = tenant_data["active"]
    if "dropbox_app_key" in tenant_data:
        tenant.dropbox_app_key = tenant_data["dropbox_app_key"]
    if "storage_bucket" in tenant_data:
        tenant.storage_bucket = tenant_data["storage_bucket"]
    if "thumbnail_bucket" in tenant_data:
        tenant.thumbnail_bucket = tenant_data["thumbnail_bucket"]
    if "settings" in tenant_data:
        tenant.settings = tenant_data["settings"]

    tenant.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(tenant)

    return {
        "id": str(tenant.id),
        "identifier": getattr(tenant, "identifier", None) or str(tenant.id),
        "key_prefix": getattr(tenant, "key_prefix", None) or str(tenant.id),
        "name": tenant.name,
        "active": tenant.active,
        "updated_at": tenant.updated_at.isoformat()
    }


@router.patch("/{tenant_id}/settings", response_model=dict)
async def update_tenant_settings(
    tenant_id: str,
    settings_update: dict,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
):
    """Partially update tenant settings (merge with existing settings)."""
    tenant = _resolve_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    _require_tenant_admin_or_super_admin(db, user, tenant)

    # Get existing settings or initialize empty dict
    current_settings = tenant.settings or {}

    # Merge with new settings
    current_settings.update(settings_update)

    # Update tenant
    tenant.settings = current_settings
    tenant.updated_at = datetime.utcnow()

    # Mark settings as modified so SQLAlchemy detects the JSONB change
    flag_modified(tenant, "settings")

    db.commit()
    db.refresh(tenant)

    return {
        "id": str(tenant.id),
        "identifier": getattr(tenant, "identifier", None) or str(tenant.id),
        "settings": tenant.settings,
        "updated_at": tenant.updated_at.isoformat()
    }


@router.delete("/{tenant_id}", response_model=dict)
async def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
):
    """Delete a tenant and all associated data."""
    _require_super_admin(user)
    tenant = _resolve_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    resolved_tenant_id = tenant.id
    db.delete(tenant)
    db.commit()

    return {"status": "deleted", "tenant_id": resolved_tenant_id}
