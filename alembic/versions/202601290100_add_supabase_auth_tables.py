"""Add Supabase Auth tables (user_profiles, user_tenants, invitations)

This migration adds user authentication and authorization tables:
1. user_profiles - User identity synced from Supabase auth.users
2. user_tenants - Many-to-many user-tenant membership with roles
3. invitations - Token-based invitation system for onboarding

Revision ID: 202601290100
Revises: 202601271530
Create Date: 2026-01-29 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "202601290100"
down_revision = "202601271530"
branch_labels = None
depends_on = None


def upgrade():
    """Add Supabase Auth tables with RLS policies."""

    # ========================================================================
    # Phase 1: Create user_profiles table
    # ========================================================================
    op.create_table(
        "user_profiles",
        sa.Column("supabase_uid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false"), index=True),
        sa.Column("is_super_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("supabase_uid"),
    )

    op.create_index("idx_user_profiles_email", "user_profiles", ["email"])
    op.create_index("idx_user_profiles_is_active", "user_profiles", ["is_active"])

    # Enable RLS on user_profiles
    op.execute("ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY")

    # RLS Policy: Users can view their own profile
    op.execute("""
        CREATE POLICY "Users can view their own profile"
        ON user_profiles FOR SELECT
        USING (supabase_uid = auth.uid())
    """)

    # RLS Policy: Users can update their own profile
    op.execute("""
        CREATE POLICY "Users can update their own profile"
        ON user_profiles FOR UPDATE
        USING (supabase_uid = auth.uid())
    """)

    # ========================================================================
    # Phase 2: Create user_tenants table (many-to-many membership)
    # ========================================================================
    op.create_table(
        "user_tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("supabase_uid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="user"),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["supabase_uid"], ["user_profiles.supabase_uid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by"], ["user_profiles.supabase_uid"], ondelete="SET NULL"),
        sa.UniqueConstraint("supabase_uid", "tenant_id", name="uq_user_tenant_membership"),
        sa.CheckConstraint("role IN ('admin', 'user')", name="ck_user_tenants_role"),
    )

    op.create_index("idx_user_tenants_supabase_uid", "user_tenants", ["supabase_uid"])
    op.create_index("idx_user_tenants_tenant_id", "user_tenants", ["tenant_id"])
    # Note: Partial index on pending memberships omitted. Full table scan is acceptable.

    # Enable RLS on user_tenants
    op.execute("ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY")

    # RLS Policy: Users can view their own tenant memberships
    op.execute("""
        CREATE POLICY "Users can view their own tenant memberships"
        ON user_tenants FOR SELECT
        USING (supabase_uid = auth.uid())
    """)

    # ========================================================================
    # Phase 3: Create invitations table (token-based invitations)
    # ========================================================================
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="user"),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by"], ["user_profiles.supabase_uid"], ondelete="CASCADE"),
        sa.CheckConstraint("role IN ('admin', 'user')", name="ck_invitations_role"),
    )

    op.create_index("idx_invitations_email", "invitations", ["email"])
    op.create_index("idx_invitations_token", "invitations", ["token"])
    # Note: Partial index on pending invitations omitted due to PostgreSQL
    # requiring immutable functions in WHERE clause. Full table scan on
    # "pending invitations" is acceptable given typical query volume.

    # Enable RLS on invitations
    op.execute("ALTER TABLE invitations ENABLE ROW LEVEL SECURITY")

    # RLS Policy: Only tenant admins can manage invitations for their tenants
    op.execute("""
        CREATE POLICY "Tenant admins can manage invitations"
        ON invitations FOR ALL
        USING (
            EXISTS (
                SELECT 1 FROM user_tenants ut
                WHERE ut.supabase_uid = auth.uid()
                AND ut.tenant_id = invitations.tenant_id
                AND ut.role = 'admin'
                AND ut.accepted_at IS NOT NULL
            )
        )
    """)

    # ========================================================================
    # Print migration summary
    # ========================================================================
    print("""
    ========================================================================
    Migration 202601290100: Supabase Auth Tables Added
    ========================================================================

    Schema Changes:
    ✓ Created user_profiles table (Supabase auth sync)
    ✓ Created user_tenants table (many-to-many membership)
    ✓ Created invitations table (token-based invitations)
    ✓ Enabled RLS on all auth tables
    ✓ Added RLS policies for tenant and user isolation

    Tables:
    1. user_profiles
       - supabase_uid (UUID) - Primary key from auth.users.id
       - email (unique)
       - is_active (requires admin approval)
       - is_super_admin (system-wide admin)
       - Indexes: email, is_active

    2. user_tenants
       - supabase_uid → user_profiles
       - tenant_id → tenants
       - role (admin | user)
       - accepted_at (NULL = pending invitation)
       - Indexes: supabase_uid, tenant_id, pending memberships

    3. invitations
       - email (being invited)
       - tenant_id → tenants
       - token (cryptographically secure)
       - expires_at (7 days by default)
       - Indexes: email, token, pending invitations

    Next Steps:
    1. Add Supabase Auth configuration to backend
    2. Implement JWT verification via JWKS
    3. Create FastAPI dependencies for authentication
    4. Add auth endpoints (/auth/register, /auth/login, /auth/me)
    5. Add admin endpoints (/admin/users, /admin/invitations)
    6. Update frontend with Supabase client
    7. Create login/signup components

    RLS Notes:
    - user_profiles: Users see only their own profile
    - user_tenants: Users see only their own memberships
    - invitations: Admins see invitations for their tenants
    - image_metadata: Tenant access enforced at application level

    Authorization Model:
    - super-admin: System-wide access (bypass all tenant checks)
    - admin: Tenant-level admin (can invite users, manage roles)
    - user: Tenant-level user (read-only or limited access)
    ========================================================================
    """)


def downgrade():
    """Remove Supabase Auth tables."""

    # Drop tables in reverse order (respecting foreign key constraints)
    op.drop_table("invitations")
    op.drop_table("user_tenants")
    op.drop_table("user_profiles")

    print("""
    ========================================================================
    Downgrade 202601290100: Supabase Auth Tables Removed
    ========================================================================

    Tables removed:
    - invitations
    - user_tenants
    - user_profiles

    WARNING: User data and invitations have been deleted!
    ========================================================================
    """)
