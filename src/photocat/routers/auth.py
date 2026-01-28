"""Authentication endpoints for Supabase Auth."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from photocat.database import get_db
from photocat.auth.dependencies import get_current_user
from photocat.auth.models import UserProfile, UserTenant, Invitation
from photocat.auth.schemas import (
    LoginResponse,
    RegisterRequest,
    AcceptInvitationRequest,
    UserProfileResponse,
    TenantMembershipResponse,
)
from photocat.metadata import Tenant as TenantModel


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=dict, status_code=201)
async def register(
    request: RegisterRequest,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Complete registration after Supabase signup.

    User must have already signed up via Supabase Auth and obtained a JWT token.
    This endpoint creates the user_profile record in the database.

    The user starts with is_active=FALSE and must be approved by a super admin
    before they can access any tenant (unless they accept an invitation, which
    auto-approves them).

    Args:
        request: Registration data (display_name)
        user: Current authenticated user (from JWT token)
        db: Database session

    Returns:
        dict: Status message and user ID

    Raises:
        HTTPException 401: Invalid or missing JWT token
        HTTPException 403: User account pending approval (shouldn't happen on first call)
    """
    # Check if profile already exists
    existing = db.query(UserProfile).filter(
        UserProfile.supabase_uid == user.supabase_uid
    ).first()

    if existing:
        return {
            "message": "Profile already exists",
            "status": "active" if existing.is_active else "pending_approval"
        }

    # Create new profile (is_active=False, requires approval)
    profile = UserProfile(
        supabase_uid=user.supabase_uid,
        email=user.email,
        email_verified=user.email_verified,
        display_name=request.display_name or user.email.split("@")[0],
        is_active=False,
        is_super_admin=False
    )

    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {
        "message": "Registration pending admin approval",
        "status": "pending_approval",
        "user_id": str(user.supabase_uid)
    }


@router.get("/me", response_model=LoginResponse)
async def get_current_user_info(
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user info with tenant memberships.

    Returns the authenticated user's profile and list of accepted tenant memberships.
    Pending invitations (accepted_at=NULL) are not included in the response.

    This endpoint is used by the frontend to:
    - Display user profile information
    - Populate tenant selector
    - Verify user approval status

    Args:
        user: Current authenticated user
        db: Database session

    Returns:
        LoginResponse: User profile and list of tenant memberships

    Raises:
        HTTPException 401: Invalid or missing JWT token
        HTTPException 403: User account pending approval
    """
    # Fetch accepted tenant memberships
    memberships = db.query(UserTenant).filter(
        UserTenant.supabase_uid == user.supabase_uid,
        UserTenant.accepted_at.isnot(None)
    ).all()

    tenants = []
    for membership in memberships:
        tenant = db.query(TenantModel).filter(
            TenantModel.id == membership.tenant_id
        ).first()
        if tenant:
            tenants.append(TenantMembershipResponse(
                tenant_id=tenant.id,
                tenant_name=tenant.name,
                role=membership.role,
                accepted_at=membership.accepted_at
            ))

    return LoginResponse(
        user=UserProfileResponse.from_orm(user),
        tenants=tenants
    )


@router.post("/accept-invitation", response_model=LoginResponse)
async def accept_invitation(
    request: AcceptInvitationRequest,
    user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Accept an invitation and join a tenant.

    When a user accepts an invitation:
    1. The invitation token is verified (must match email, not expired, not already accepted)
    2. The user account is activated (is_active=TRUE)
    3. A user_tenants record is created with the specified role
    4. The invitation is marked as accepted

    This flow allows admins to invite users with a specific role, and the user
    is automatically approved upon accepting the invitation (no super admin approval needed).

    Args:
        request: Invitation token from email link
        user: Current authenticated user
        db: Database session

    Returns:
        LoginResponse: Updated user profile and tenant list

    Raises:
        HTTPException 401: Invalid or missing JWT token
        HTTPException 404: Invalid, expired, or already-accepted invitation
    """
    # Find invitation
    invitation = db.query(Invitation).filter(
        Invitation.token == request.invitation_token,
        Invitation.email == user.email,
        Invitation.accepted_at.is_(None),
        Invitation.expires_at > datetime.utcnow()
    ).first()

    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid, expired, or already-accepted invitation"
        )

    # Activate user account (auto-approve via invitation)
    user.is_active = True

    # Create tenant membership with specified role
    membership = UserTenant(
        supabase_uid=user.supabase_uid,
        tenant_id=invitation.tenant_id,
        role=invitation.role,
        invited_by=invitation.invited_by,
        invited_at=invitation.created_at,
        accepted_at=datetime.utcnow()
    )
    db.add(membership)

    # Mark invitation as accepted
    invitation.accepted_at = datetime.utcnow()

    db.commit()

    # Return updated user info with new tenant
    return await get_current_user_info(user, db)


@router.post("/logout", status_code=200)
async def logout(user: UserProfile = Depends(get_current_user)):
    """Logout endpoint (server-side cleanup).

    This is a no-op on the server side. The frontend should:
    1. Call `supabase.auth.signOut()` to revoke the token
    2. Clear localStorage/sessionStorage
    3. Clear any cookies (if using httpOnly cookies)

    This endpoint is provided for:
    - Audit logging (future)
    - Explicit token revocation (future, with Supabase Pro)
    - Consistent API design

    Args:
        user: Current authenticated user

    Returns:
        dict: Success message
    """
    return {"message": "Logged out successfully"}
