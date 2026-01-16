"""add keyword models table

Revision ID: 202601151800
Revises: 202601111700
Create Date: 2026-01-15 18:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "202601151800"
down_revision = "202601111700_add_photo_lists"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "keyword_models",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.String(length=255), nullable=False),
        sa.Column("keyword", sa.String(length=255), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("positive_centroid", postgresql.ARRAY(sa.Float()), nullable=False),
        sa.Column("negative_centroid", postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "idx_keyword_models_tenant_keyword",
        "keyword_models",
        ["tenant_id", "keyword", "model_name"],
        unique=True,
    )


def downgrade():
    op.drop_index("idx_keyword_models_tenant_keyword", table_name="keyword_models")
    op.drop_table("keyword_models")
