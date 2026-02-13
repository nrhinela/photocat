"""Tenant-admin integrations endpoints."""

from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from zoltag.auth.dependencies import require_tenant_role_from_header
from zoltag.auth.models import UserProfile
from zoltag.database import get_db
from zoltag.dependencies import delete_secret, get_secret, get_tenant
from zoltag.dropbox_oauth import (
    inspect_dropbox_oauth_config,
    sanitize_redirect_origin,
    sanitize_return_path,
)
from zoltag.metadata import Tenant as TenantModel
from zoltag.tenant import Tenant

router = APIRouter(prefix="/api/v1/admin/integrations", tags=["admin-integrations"])
_ALLOWED_SOURCE_PROVIDERS = {"dropbox", "gdrive"}
_PROVIDER_LABELS = {
    "dropbox": "Dropbox",
    "gdrive": "Google Drive",
}


def _normalize_source_provider(value: str | None) -> str:
    provider = str(value or "").strip().lower()
    if provider in {"google-drive", "google_drive", "drive"}:
        provider = "gdrive"
    if provider not in _ALLOWED_SOURCE_PROVIDERS:
        raise HTTPException(status_code=400, detail="Invalid source provider")
    return provider


def _normalize_sync_folders(raw_value) -> list[str]:
    if raw_value is None:
        return []
    if not isinstance(raw_value, list):
        raise HTTPException(status_code=400, detail="sync_folders must be a list")

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_value:
        folder = str(item or "").strip()
        if not folder:
            continue
        if folder in seen:
            continue
        seen.add(folder)
        normalized.append(folder)
    return normalized


def _sync_folder_key_for_provider(provider: str) -> str:
    return "gdrive_sync_folders" if provider == "gdrive" else "dropbox_sync_folders"


def _read_secret_value(secret_id: str) -> str:
    try:
        return str(get_secret(secret_id) or "").strip()
    except Exception:
        return ""


def _resolve_default_source_provider(settings_payload: dict | None) -> str:
    provider = str((settings_payload or {}).get("sync_source_provider") or "dropbox").strip().lower()
    if provider not in _ALLOWED_SOURCE_PROVIDERS:
        return "dropbox"
    return provider


def _list_setting(settings_payload: dict | None, key: str) -> list[str]:
    raw = (settings_payload or {}).get(key) or []
    if isinstance(raw, list):
        return [str(item or "").strip() for item in raw if str(item or "").strip()]
    return []


def _resolve_redirect_origin_from_request(request: Request, payload: dict | None = None) -> str:
    requested_redirect_origin = sanitize_redirect_origin((payload or {}).get("redirect_origin"))
    if not requested_redirect_origin:
        requested_redirect_origin = sanitize_redirect_origin(request.headers.get("origin"))
    if not requested_redirect_origin:
        referer = str(request.headers.get("referer") or "").strip()
        if referer:
            parts = urlsplit(referer)
            requested_redirect_origin = sanitize_redirect_origin(f"{parts.scheme}://{parts.netloc}")
    if not requested_redirect_origin:
        host = str(request.headers.get("host") or "").strip()
        if host:
            requested_redirect_origin = sanitize_redirect_origin(f"{request.url.scheme}://{host}")
    return requested_redirect_origin


def _build_dropbox_status(tenant_row: TenantModel) -> dict:
    settings_payload = tenant_row.settings or {}
    token_secret_name = f"dropbox-token-{tenant_row.id}"
    token_value = _read_secret_value(token_secret_name)
    connected = bool(token_value)
    stored_mode = str(settings_payload.get("dropbox_oauth_mode") or "").strip().lower()

    if connected:
        selected_mode = stored_mode if stored_mode in {"managed", "legacy_tenant"} else "managed"
        can_connect = True
        issues: list[str] = []
    else:
        oauth_config = inspect_dropbox_oauth_config(
            tenant_id=tenant_row.id,
            tenant_app_key=tenant_row.dropbox_app_key,
            get_secret=get_secret,
            selection_mode="managed_only",
        )
        selected_mode = oauth_config["selected_mode"]
        can_connect = bool(oauth_config["can_connect"])
        issues = oauth_config["issues"]

    sync_folder_key = _sync_folder_key_for_provider("dropbox")

    return {
        "id": "dropbox",
        "label": _PROVIDER_LABELS["dropbox"],
        "connected": connected,
        "can_connect": can_connect,
        "mode": selected_mode,
        "issues": issues,
        "sync_folder_key": sync_folder_key,
        "sync_folders": _list_setting(settings_payload, sync_folder_key),
    }


def _build_gdrive_status(tenant_row: TenantModel) -> dict:
    settings_payload = tenant_row.settings or {}
    tenant_id = tenant_row.id
    client_id = str(settings_payload.get("gdrive_client_id") or "").strip()
    client_secret_name = str(settings_payload.get("gdrive_client_secret") or f"gdrive-client-secret-{tenant_id}").strip()
    token_secret_name = str(settings_payload.get("gdrive_token_secret") or f"gdrive-token-{tenant_id}").strip()

    token_value = _read_secret_value(token_secret_name) if token_secret_name else ""
    connected = bool(token_value)

    issues: list[str] = []
    if connected:
        can_connect = True
    else:
        if not client_id:
            issues.append("gdrive_client_id_not_configured")
        client_secret_value = _read_secret_value(client_secret_name) if client_secret_name else ""
        if not client_secret_value:
            issues.append("gdrive_client_secret_not_configured")
        can_connect = bool(client_id and client_secret_value)

    sync_folder_key = _sync_folder_key_for_provider("gdrive")
    return {
        "id": "gdrive",
        "label": _PROVIDER_LABELS["gdrive"],
        "connected": connected,
        "can_connect": can_connect,
        "mode": "tenant_oauth",
        "issues": issues,
        "sync_folder_key": sync_folder_key,
        "sync_folders": _list_setting(settings_payload, sync_folder_key),
    }


def _build_integrations_status(tenant_row: TenantModel) -> dict:
    settings_payload = tenant_row.settings or {}
    default_source_provider = _resolve_default_source_provider(settings_payload)
    dropbox_status = _build_dropbox_status(tenant_row)
    gdrive_status = _build_gdrive_status(tenant_row)
    providers = [dropbox_status, gdrive_status]
    provider_configs = {provider["id"]: provider for provider in providers}

    active_provider = provider_configs.get(default_source_provider) or dropbox_status
    return {
        "tenant_id": tenant_row.id,
        "default_source_provider": default_source_provider,
        "providers": providers,
        "provider_configs": provider_configs,
        "source_provider_options": [
            {"id": "dropbox", "label": _PROVIDER_LABELS["dropbox"]},
            {"id": "gdrive", "label": _PROVIDER_LABELS["gdrive"]},
        ],
        # Backward-compatible fields for existing UI callers.
        "source_provider": default_source_provider,
        "sync_folder_key": active_provider["sync_folder_key"],
        "sync_folders": active_provider["sync_folders"],
        "connected": dropbox_status["connected"],
        "can_connect": dropbox_status["can_connect"],
        "mode": dropbox_status["mode"],
        "issues": dropbox_status["issues"],
    }


@router.get("/status")
async def get_integrations_status(
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
    db: Session = Depends(get_db),
):
    """Get integration connection/config status for current tenant."""
    tenant_row = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _build_integrations_status(tenant_row)


@router.get("/dropbox/status")
async def get_dropbox_status(
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
    db: Session = Depends(get_db),
):
    """Backward-compatible Dropbox status endpoint for current tenant."""
    tenant_row = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _build_integrations_status(tenant_row)


@router.patch("/dropbox/config")
async def update_dropbox_config(
    payload: dict,
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
    db: Session = Depends(get_db),
):
    """Update tenant integration sync source and provider sync folders."""
    tenant_row = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    settings_payload = tenant_row.settings or {}
    if not isinstance(settings_payload, dict):
        settings_payload = {}

    if "default_source_provider" in payload:
        settings_payload["sync_source_provider"] = _normalize_source_provider(payload.get("default_source_provider"))

    target_provider = None
    if "provider" in payload:
        target_provider = _normalize_source_provider(payload.get("provider"))

    # Backward compatibility for older payload shape.
    if "source_provider" in payload:
        source_provider = _normalize_source_provider(payload.get("source_provider"))
        settings_payload["sync_source_provider"] = source_provider
        if target_provider is None:
            target_provider = source_provider

    if "sync_folders" in payload:
        if target_provider is None:
            target_provider = _resolve_default_source_provider(settings_payload)
        sync_folder_key = _sync_folder_key_for_provider(target_provider)
        settings_payload[sync_folder_key] = _normalize_sync_folders(payload.get("sync_folders"))

    tenant_row.settings = settings_payload
    flag_modified(tenant_row, "settings")
    db.commit()

    refreshed = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    status = _build_integrations_status(refreshed)
    status["status"] = "updated"
    return status


@router.post("/dropbox/connect")
async def start_dropbox_connect(
    request: Request,
    payload: dict | None = None,
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
    db: Session = Depends(get_db),
):
    """Generate Dropbox OAuth authorize URL for redirect-based flow."""
    tenant_row = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    dropbox_status = _build_dropbox_status(tenant_row)
    if not dropbox_status["can_connect"]:
        raise HTTPException(status_code=400, detail="Dropbox OAuth is not configured for this tenant")

    requested_return_to = (payload or {}).get("return_to")
    requested_redirect_origin = _resolve_redirect_origin_from_request(request, payload)
    return_to = sanitize_return_path(requested_return_to)
    query_payload = {
        "tenant": tenant.id,
        "flow": "redirect",
        "credential_mode": "managed",
        "return_to": return_to,
    }
    if requested_redirect_origin:
        query_payload["redirect_origin"] = requested_redirect_origin
    query = urlencode(query_payload)
    return {
        "tenant_id": tenant.id,
        "provider": "dropbox",
        "authorize_url": f"/oauth/dropbox/authorize?{query}",
        "mode": dropbox_status["mode"],
    }


@router.post("/gdrive/connect")
async def start_gdrive_connect(
    request: Request,
    payload: dict | None = None,
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
    db: Session = Depends(get_db),
):
    """Generate Google Drive OAuth authorize URL for redirect-based flow."""
    tenant_row = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    gdrive_status = _build_gdrive_status(tenant_row)
    if not gdrive_status["can_connect"]:
        raise HTTPException(status_code=400, detail="Google Drive OAuth is not configured for this tenant")

    requested_return_to = (payload or {}).get("return_to")
    requested_redirect_origin = _resolve_redirect_origin_from_request(request, payload)
    return_to = sanitize_return_path(requested_return_to)
    query_payload = {
        "tenant": tenant.id,
        "flow": "redirect",
        "return_to": return_to,
    }
    if requested_redirect_origin:
        query_payload["redirect_origin"] = requested_redirect_origin
    query = urlencode(query_payload)
    return {
        "tenant_id": tenant.id,
        "provider": "gdrive",
        "authorize_url": f"/oauth/gdrive/authorize?{query}",
        "mode": gdrive_status["mode"],
    }


@router.delete("/dropbox/connection")
async def disconnect_dropbox(
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
):
    """Disconnect Dropbox by deleting tenant refresh token secret."""
    token_secret_name = f"dropbox-token-{tenant.id}"
    delete_secret(token_secret_name)
    return {
        "tenant_id": tenant.id,
        "provider": "dropbox",
        "status": "disconnected",
    }


@router.delete("/gdrive/connection")
async def disconnect_gdrive(
    tenant: Tenant = Depends(get_tenant),
    _admin: UserProfile = Depends(require_tenant_role_from_header("admin")),
    db: Session = Depends(get_db),
):
    """Disconnect Google Drive by deleting tenant refresh token secret."""
    tenant_row = db.query(TenantModel).filter(TenantModel.id == tenant.id).first()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")

    settings_payload = tenant_row.settings or {}
    token_secret_name = str(settings_payload.get("gdrive_token_secret") or f"gdrive-token-{tenant.id}").strip()
    if token_secret_name:
        delete_secret(token_secret_name)
    return {
        "tenant_id": tenant.id,
        "provider": "gdrive",
        "status": "disconnected",
    }
