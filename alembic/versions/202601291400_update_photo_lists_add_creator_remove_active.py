"""Update photo_lists: add creator reference, remove active column

This migration:
1. Adds created_by_uid column to track who created each list (nullable initially for existing lists)
2. Removes is_active column and the constraint that only one list can be active per tenant
3. Updates the table docstring

Revision ID: 202601291400
Revises: 202601290100
Create Date: 2026-01-29 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "202601291400"
down_revision = "202601290100"
branch_labels = None
depends_on = None


def upgrade():
    """Add created_by_uid to photo_lists and remove is_active column."""

    # Add created_by_uid column (foreign key to user_profiles)
    op.add_column(
        "photo_lists",
        sa.Column(
            "created_by_uid",
            postgresql.UUID(as_uuid=True),
            nullable=True  # Nullable initially for existing lists
        )
    )

    # Add foreign key constraint
    op.create_foreign_key(
        "fk_photo_lists_created_by_uid",
        "photo_lists",
        "user_profiles",
        ["created_by_uid"],
        ["supabase_uid"],
        ondelete="SET NULL"
    )

    # Create index on created_by_uid for query performance
    op.create_index(
        "idx_photo_lists_created_by_uid",
        "photo_lists",
        ["created_by_uid"]
    )

    # Drop the is_active column
    op.drop_column("photo_lists", "is_active")


def downgrade():
    """Revert: remove created_by_uid and restore is_active column."""

    # Drop the index
    op.drop_index("idx_photo_lists_created_by_uid", table_name="photo_lists")

    # Drop the foreign key constraint
    op.drop_constraint("fk_photo_lists_created_by_uid", "photo_lists", type_="foreignkey")

    # Drop the created_by_uid column
    op.drop_column("photo_lists", "created_by_uid")

    # Restore the is_active column
    op.add_column(
        "photo_lists",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false")
        )
    )
