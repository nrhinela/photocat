"""Add machine_tags table for consolidated machine-generated tag storage.

This migration creates a unified table for all machine-generated image tags
(SigLIP, CLIP, trained models, etc.) with support for multiple algorithms.

Revision ID: 202601160000
Revises: 202601151900_add_trained_image_tags
Create Date: 2026-01-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202601160000"
down_revision = "202601151900"
branch_labels = None
depends_on = None


def upgrade():
    # Create machine_tags table
    op.create_table(
        "machine_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False),
        sa.Column("keyword", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("tag_type", sa.String(length=50), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id")
    )

    # Indexes for common query patterns
    op.create_index(
        "idx_machine_tags_per_image",
        "machine_tags",
        ["tenant_id", "image_id", "tag_type"]
    )

    op.create_index(
        "idx_machine_tags_facets",
        "machine_tags",
        ["tenant_id", "tag_type", "keyword"]
    )

    op.create_index(
        "idx_machine_tags_unique",
        "machine_tags",
        ["tenant_id", "image_id", "keyword", "tag_type", "model_name"],
        unique=True
    )

    # Index for tenant queries
    op.create_index(
        "idx_machine_tags_tenant",
        "machine_tags",
        ["tenant_id"]
    )


def downgrade():
    op.drop_index("idx_machine_tags_tenant", table_name="machine_tags")
    op.drop_index("idx_machine_tags_unique", table_name="machine_tags")
    op.drop_index("idx_machine_tags_facets", table_name="machine_tags")
    op.drop_index("idx_machine_tags_per_image", table_name="machine_tags")
    op.drop_table("machine_tags")
