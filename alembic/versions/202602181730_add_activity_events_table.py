"""add activity_events table

Revision ID: 202602181730
Revises: 202602181000
Create Date: 2026-02-18 17:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "202602181730"
down_revision: Union[str, None] = "202602181000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activity_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_supabase_uid", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("request_path", sa.String(length=255), nullable=True),
        sa.Column("client_ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_supabase_uid"], ["user_profiles.supabase_uid"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_activity_events_created_at", "activity_events", ["created_at"], unique=False)
    op.create_index(
        "idx_activity_events_event_type_created_at",
        "activity_events",
        ["event_type", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_activity_events_tenant_created_at",
        "activity_events",
        ["tenant_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_activity_events_actor_created_at",
        "activity_events",
        ["actor_supabase_uid", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_activity_events_actor_created_at", table_name="activity_events")
    op.drop_index("idx_activity_events_tenant_created_at", table_name="activity_events")
    op.drop_index("idx_activity_events_event_type_created_at", table_name="activity_events")
    op.drop_index("idx_activity_events_created_at", table_name="activity_events")
    op.drop_table("activity_events")
