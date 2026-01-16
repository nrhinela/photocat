"""Drop old image_tags and trained_image_tags tables after full migration.

This is the final cleanup step after verifying:
1. machine_tags table is populated with all migrated data
2. All queries have been updated to use machine_tags
3. Tests pass with new schema
4. Production validation is complete

Only run after PR 4 testing confirms everything works.

Revision ID: 202601160200
Revises: 202601160100_migrate_tags_to_machine_tags
Create Date: 2026-01-16 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202601160200"
down_revision = "202601160100_migrate_tags_to_machine_tags"
branch_labels = None
depends_on = None


def upgrade():
    # Drop constraints and indexes first
    op.drop_index("idx_tenant_keyword", table_name="image_tags")
    op.drop_index("idx_trained_tags_unique", table_name="trained_image_tags")
    op.drop_index("idx_trained_tags_tenant_image", table_name="trained_image_tags")

    # Drop the old tables
    op.drop_table("image_tags")
    op.drop_table("trained_image_tags")


def downgrade():
    # Restore image_tags table
    op.create_table(
        "image_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_metadata.id"), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False, index=True),
        sa.Column("keyword", sa.String(length=255), nullable=False, index=True),
        sa.Column("category", sa.String(length=255)),
        sa.Column("confidence", sa.Float()),
        sa.Column("manual", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("idx_tenant_keyword", "image_tags", ["tenant_id", "keyword"])

    # Restore trained_image_tags table
    op.create_table(
        "trained_image_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False, index=True),
        sa.Column("keyword", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255)),
        sa.Column("confidence", sa.Float()),
        sa.Column("model_name", sa.String(length=100)),
        sa.Column("model_version", sa.String(length=50)),
        sa.Column("created_at", sa.DateTime(), default=sa.func.now()),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("idx_trained_tags_tenant_image", "trained_image_tags", ["tenant_id", "image_id"])
    op.create_index("idx_trained_tags_unique", "trained_image_tags",
                   ["tenant_id", "image_id", "keyword", "model_name"], unique=True)
