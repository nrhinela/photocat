"""drop keyword_thresholds table

Revision ID: 202602181000
Revises: 202602172010
Create Date: 2026-02-18 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "202602181000"
down_revision: Union[str, None] = "202602172010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("keyword_thresholds")


def downgrade() -> None:
    op.create_table(
        "keyword_thresholds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("keyword_id", sa.Integer(), nullable=False),
        sa.Column("tag_type", sa.String(length=50), nullable=False),
        sa.Column("threshold_calc", sa.Float(), nullable=True),
        sa.Column("threshold_manual", sa.Float(), nullable=True),
        sa.Column("calc_method", sa.String(length=50), nullable=True),
        sa.Column("calc_sample_n", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="keyword_thresholds_tenant_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "keyword_id",
            "tag_type",
            name="uq_keyword_thresholds_keyword_tag_type",
        ),
    )
    op.create_index(
        "idx_keyword_thresholds_keyword_id",
        "keyword_thresholds",
        ["keyword_id"],
        unique=False,
    )
    op.create_index(
        "idx_keyword_thresholds_tenant",
        "keyword_thresholds",
        ["tenant_id"],
        unique=False,
    )

