"""FastAPI dependencies for authentication and authorization."""

import time
from typing import Optional, Callable
from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from jose import JWTError
from datetime import datetime, timedelta, timezone

from zoltag.database import get_db
from zoltag.auth.jwt import get_supabase_uid_from_token
from zoltag.auth.models import (
    Invitation,
    TenantRole,
    TenantRolePermission,
    UserProfile,
    UserTenant,
)
from zoltag.metadata import Tenant as TenantModel
from zoltag.tenant_scope import tenant_column_filter_for_values, tenant_reference_filter


RBAC_PERMISSION_CACHE_TTL_SECONDS = 30
_tenant_permission_cache = {}

# Compatibility permission aliases.
# Keep implications intentionally one-way for broad alias keys. Avoid
# canonical->alias write implications that can accidentally escalate
# privileges through transitive expansion.
PERMISSION_IMPLICATIONS: dict[str, set[str]] = {
    # Alias -> canonical (broad convenience aliases)
    "assets.read": {"image.view"},
    "assets.write": {"image.rate", "image.tag", "image.note.edit", "image.variant.manage"},
    # Canonical -> alias (read-only compatibility for legacy roles/UI checks)
    "image.view": {"assets.read"},
}


def _permission_cache_key(tenant_id: str, supabase_uid: str) -> tuple[str, str]:
    return (str(tenant_id), str(supabase_uid))


def invalidate_tenant_permission_cache(
    supabase_uid: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Invalidate cached effective permissions for one user/tenant or broader scope."""
    if supabase_uid is None and tenant_id is None:
        _tenant_permission_cache.clear()
        return

    target_user = str(supabase_uid) if supabase_uid is not None else None
    target_tenant = str(tenant_id) if tenant_id is not None else None
    keys_to_remove = []
    for key_tenant, key_user in _tenant_permission_cache.keys():
        if target_user is not None and key_user != target_user:
            continue
        if target_tenant is not None and key_tenant != target_tenant:
            continue
        keys_to_remove.append((key_tenant, key_user))

    for key in keys_to_remove:
        _tenant_permission_cache.pop(key, None)


def _load_permissions_from_role_mapping(
    db: Session,
    membership: UserTenant,
) -> set[str]:
    role_id = membership.tenant_role_id
    if not role_id:
        return set()
    rows = db.query(
        TenantRolePermission.permission_key,
        TenantRolePermission.effect,
    ).join(
        TenantRole,
        TenantRole.id == TenantRolePermission.role_id,
    ).filter(
        TenantRole.id == role_id,
        TenantRole.tenant_id == membership.tenant_id,
        TenantRole.is_active.is_(True),
    ).all()
    if not rows:
        return set()

    allowed = {str(permission_key) for permission_key, effect in rows if str(effect) == "allow"}
    denied = {str(permission_key) for permission_key, effect in rows if str(effect) == "deny"}
    return _expand_permissions(allowed, denied)


def _expand_permissions(allowed: set[str], denied: set[str]) -> set[str]:
    expanded = set(allowed)
    changed = True
    while changed:
        changed = False
        for permission_key in list(expanded):
            implied = PERMISSION_IMPLICATIONS.get(permission_key) or set()
            for implied_key in implied:
                if implied_key in denied or implied_key in expanded:
                    continue
                expanded.add(implied_key)
                changed = True
    return expanded - denied


def get_effective_membership_permissions(
    db: Session,
    membership: UserTenant,
) -> set[str]:
    """Get effective permission keys for a tenant membership with short-lived cache."""
    cache_key = _permission_cache_key(membership.tenant_id, membership.supabase_uid)
    cached = _tenant_permission_cache.get(cache_key)
    now = time.time()
    if cached and cached[0] > now:
        return set(cached[1])

    permissions = _load_permissions_from_role_mapping(db, membership)

    _tenant_permission_cache[cache_key] = (now + RBAC_PERMISSION_CACHE_TTL_SECONDS, set(permissions))
    return permissions


def get_tenant_role_id_by_key(
    db: Session,
    *,
    tenant_id,
    role_key: Optional[str],
) -> Optional[object]:
    """Resolve tenant role id for a role_key in a tenant, if present."""
    normalized_key = str(role_key or "").strip().lower()
    if not normalized_key:
        return None
    row = db.query(TenantRole.id).filter(
        TenantRole.tenant_id == tenant_id,
        TenantRole.role_key == normalized_key,
    ).first()
    if not row:
        return None
    return row[0]


def _resolve_tenant_scope(db: Session, tenant_ref: str) -> Optional[str]:
    """Resolve tenant identifier from id, identifier, or UUID."""
    row = db.query(TenantModel.id).filter(
        tenant_reference_filter(TenantModel, tenant_ref)
    ).first()
    if not row:
        return None
    return str(row[0])


def claim_pending_invitations_for_user(
    db: Session,
    *,
    user: UserProfile,
) -> set[str]:
    """Claim all pending, non-expired invitations for a user email.

    Returns:
        set[str]: Tenant IDs that were changed.
    """
    normalized_email = str(getattr(user, "email", "") or "").strip().lower()
    if not normalized_email:
        return set()

    now = datetime.utcnow()
    invitations = db.query(Invitation).filter(
        func.lower(Invitation.email) == normalized_email,
        Invitation.accepted_at.is_(None),
        Invitation.expires_at > now,
    ).order_by(Invitation.created_at.asc()).all()
    if not invitations:
        return set()

    changed_tenant_ids: set[str] = set()
    for invitation in invitations:
        tenant_role_id = get_tenant_role_id_by_key(
            db,
            tenant_id=invitation.tenant_id,
            role_key=invitation.role,
        )
        membership = db.query(UserTenant).filter(
            UserTenant.supabase_uid == user.supabase_uid,
            UserTenant.tenant_id == invitation.tenant_id,
        ).first()

        if membership is None:
            db.add(
                UserTenant(
                    supabase_uid=user.supabase_uid,
                    tenant_id=invitation.tenant_id,
                    tenant_role_id=tenant_role_id,
                    role=str(invitation.role or "user").strip().lower() or "user",
                    invited_by=invitation.invited_by,
                    invited_at=invitation.created_at,
                    accepted_at=now,
                )
            )
        else:
            membership.tenant_role_id = tenant_role_id
            membership.role = str(invitation.role or membership.role or "user").strip().lower() or "user"
            membership.invited_by = membership.invited_by or invitation.invited_by
            membership.invited_at = membership.invited_at or invitation.created_at
            membership.accepted_at = membership.accepted_at or now

        invitation.accepted_at = now
        changed_tenant_ids.add(str(invitation.tenant_id))

    if changed_tenant_ids and not user.is_active:
        user.is_active = True

    return changed_tenant_ids


async def _resolve_authenticated_user(
    *,
    authorization: Optional[str],
    db: Session,
) -> UserProfile:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:]  # Remove "Bearer " prefix

    try:
        supabase_uid = await get_supabase_uid_from_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(UserProfile).filter(
        UserProfile.supabase_uid == supabase_uid
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please complete registration."
        )

    return user


async def get_authenticated_user_allow_pending(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> UserProfile:
    """Return authenticated user without enforcing approval status."""
    return await _resolve_authenticated_user(authorization=authorization, db=db)


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> UserProfile:
    """Verify JWT token and return current authenticated user.

    This dependency:
    1. Extracts the Bearer token from Authorization header
    2. Verifies the JWT signature using Supabase JWKS
    3. Loads the user profile from the database
    4. Checks that the user is active (approved)
    5. Updates last_login_at timestamp

    Args:
        authorization: Authorization header (should be "Bearer <token>")
        db: Database session

    Returns:
        UserProfile: The authenticated user

    Raises:
        HTTPException 401: Invalid or missing token
        HTTPException 403: User account not approved
        HTTPException 404: User profile not found
    """
    user = await _resolve_authenticated_user(authorization=authorization, db=db)

    changed_tenant_ids = claim_pending_invitations_for_user(db, user=user)
    if changed_tenant_ids:
        db.commit()
        for tenant_id in changed_tenant_ids:
            invalidate_tenant_permission_cache(
                supabase_uid=str(user.supabase_uid),
                tenant_id=tenant_id,
            )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending admin approval"
        )

    # Update last login timestamp at most once per hour to avoid per-request writes
    now = datetime.now(timezone.utc)
    last = user.last_login_at
    # Normalise stored value to aware if DB returned naive UTC
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if last is None or (now - last) > timedelta(hours=1):
        user.last_login_at = now
        db.commit()

    return user


async def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[UserProfile]:
    """Get current user if authenticated, None otherwise.

    Useful for endpoints that work with or without authentication.

    Args:
        authorization: Authorization header
        db: Database session

    Returns:
        UserProfile or None: User if authenticated, None otherwise
    """
    if not authorization:
        return None

    try:
        return await get_current_user(authorization, db)
    except HTTPException:
        return None


def require_super_admin(
    user: UserProfile = Depends(get_current_user)
) -> UserProfile:
    """Require super admin role.

    Used on endpoints that only super admins can access.

    Args:
        user: Current authenticated user

    Returns:
        UserProfile: The user (guaranteed to be super admin)

    Raises:
        HTTPException 403: User is not a super admin
    """
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin role required"
        )
    return user


def require_tenant_access(tenant_id: str) -> Callable:
    """Dependency factory to check user has access to specific tenant.

    Creates a dependency that checks if the authenticated user is a member
    of the specified tenant. Super admins automatically pass the check.

    Args:
        tenant_id: The tenant ID to check access for

    Returns:
        Callable: Dependency function

    Usage:
        @app.get("/api/v1/images")
        async def get_images(
            tenant_id: str = Query(...),
            user: UserProfile = Depends(require_tenant_access(tenant_id))
        ):
            # User is guaranteed to have access to tenant_id
    """
    async def check_access(
        user: UserProfile = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> UserProfile:
        # Super admins have access to all tenants
        if user.is_super_admin:
            return user

        # Check if user is a member of the tenant
        scope_tenant_id = _resolve_tenant_scope(db, tenant_id) or tenant_id
        membership = db.query(UserTenant).filter(
            UserTenant.supabase_uid == user.supabase_uid,
            tenant_column_filter_for_values(UserTenant, scope_tenant_id),
            UserTenant.accepted_at.isnot(None)  # Must have accepted invitation
        ).first()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No access to tenant {tenant_id}"
            )

        return user

    return check_access


def require_tenant_permission_from_header(permission_key: str) -> Callable:
    """Dependency factory to check tenant permission using X-Tenant-ID header."""
    required_permission = str(permission_key or "").strip()
    if not required_permission:
        raise ValueError("permission_key is required")

    async def check_permission(
        x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
        user: UserProfile = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> UserProfile:
        if user.is_super_admin:
            return user

        scope_tenant_id = _resolve_tenant_scope(db, x_tenant_id) or x_tenant_id
        membership = db.query(UserTenant).filter(
            UserTenant.supabase_uid == user.supabase_uid,
            tenant_column_filter_for_values(UserTenant, scope_tenant_id),
            UserTenant.accepted_at.isnot(None),
        ).first()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No access to tenant {x_tenant_id}",
            )

        effective_permissions = get_effective_membership_permissions(db, membership)
        if required_permission not in effective_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {required_permission}",
            )
        return user

    return check_permission
