"""add trained image tags table

Revision ID: 202601151900
Revises: 202601151800
Create Date: 2026-01-15 19:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202601151900"
down_revision = "202601151800"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trained_image_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False),
        sa.Column("keyword", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "idx_trained_tags_tenant_image",
        "trained_image_tags",
        ["tenant_id", "image_id"],
        unique=False,
    )
    op.create_index(
        "idx_trained_tags_unique",
        "trained_image_tags",
        ["tenant_id", "image_id", "keyword", "model_name"],
        unique=True,
    )


def downgrade():
    op.drop_index("idx_trained_tags_unique", table_name="trained_image_tags")
    op.drop_index("idx_trained_tags_tenant_image", table_name="trained_image_tags")
    op.drop_table("trained_image_tags")
