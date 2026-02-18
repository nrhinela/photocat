"""Tests for automatic invitation claiming during auth."""

from datetime import datetime, timedelta
import uuid

from sqlalchemy.orm import Session

from zoltag.auth.dependencies import claim_pending_invitations_for_user
from zoltag.auth.models import Invitation, UserProfile, UserTenant
from zoltag.metadata import Tenant as TenantModel


def _create_tenant(test_db: Session) -> uuid.UUID:
    tenant_id = uuid.uuid4()
    tenant = TenantModel(
        id=tenant_id,
        identifier=f"tenant-{tenant_id.hex[:8]}",
        key_prefix=f"tenant-{tenant_id.hex[:8]}",
        name="Test Tenant",
        active=True,
    )
    test_db.add(tenant)
    test_db.flush()
    return tenant_id


def _create_user(test_db: Session, email: str, *, is_active: bool) -> UserProfile:
    user = UserProfile(
        supabase_uid=uuid.uuid4(),
        email=email,
        email_verified=True,
        display_name=email.split("@")[0],
        is_active=is_active,
        is_super_admin=False,
    )
    test_db.add(user)
    test_db.flush()
    return user


def test_claim_pending_invitations_creates_membership_and_activates_user(test_db: Session):
    tenant_id = _create_tenant(test_db)
    inviter = _create_user(test_db, "admin@example.com", is_active=True)
    invited = _create_user(test_db, "invited@example.com", is_active=False)

    invitation = Invitation(
        email="INVITED@example.com",
        tenant_id=tenant_id,
        role="editor",
        invited_by=inviter.supabase_uid,
        token="token-a",
        expires_at=datetime.utcnow() + timedelta(days=1),
        accepted_at=None,
    )
    test_db.add(invitation)
    test_db.commit()

    changed_tenants = claim_pending_invitations_for_user(test_db, user=invited)
    test_db.commit()

    assert str(tenant_id) in changed_tenants

    refreshed_user = test_db.query(UserProfile).filter(UserProfile.supabase_uid == invited.supabase_uid).one()
    assert refreshed_user.is_active is True

    membership = test_db.query(UserTenant).filter(
        UserTenant.supabase_uid == invited.supabase_uid,
        UserTenant.tenant_id == tenant_id,
    ).one()
    assert membership.role == "editor"
    assert membership.accepted_at is not None

    refreshed_invitation = test_db.query(Invitation).filter(Invitation.id == invitation.id).one()
    assert refreshed_invitation.accepted_at is not None


def test_claim_pending_invitations_updates_existing_membership_role(test_db: Session):
    tenant_id = _create_tenant(test_db)
    inviter = _create_user(test_db, "admin2@example.com", is_active=True)
    invited = _create_user(test_db, "member@example.com", is_active=True)

    membership = UserTenant(
        supabase_uid=invited.supabase_uid,
        tenant_id=tenant_id,
        role="user",
        invited_by=inviter.supabase_uid,
        invited_at=datetime.utcnow() - timedelta(days=2),
        accepted_at=datetime.utcnow() - timedelta(days=2),
    )
    test_db.add(membership)

    invitation = Invitation(
        email="member@example.com",
        tenant_id=tenant_id,
        role="admin",
        invited_by=inviter.supabase_uid,
        token="token-b",
        expires_at=datetime.utcnow() + timedelta(days=1),
        accepted_at=None,
    )
    test_db.add(invitation)
    test_db.commit()

    changed_tenants = claim_pending_invitations_for_user(test_db, user=invited)
    test_db.commit()

    assert str(tenant_id) in changed_tenants

    refreshed_membership = test_db.query(UserTenant).filter(
        UserTenant.supabase_uid == invited.supabase_uid,
        UserTenant.tenant_id == tenant_id,
    ).one()
    assert refreshed_membership.role == "admin"

    refreshed_invitation = test_db.query(Invitation).filter(Invitation.id == invitation.id).one()
    assert refreshed_invitation.accepted_at is not None
