"""Add indexes to speed keyword counting queries.

Revision ID: 202601271530
Revises: 202601230100
Create Date: 2026-01-27 15:30:00.000000
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "202601271530"
down_revision = "202601230100"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "idx_image_metadata_tenant_rating",
        "image_metadata",
        ["tenant_id", "rating"],
    )
    op.create_index(
        "idx_permatag_image_keyword_signum",
        "permatags",
        ["image_id", "keyword_id", "signum"],
    )
    op.create_index(
        "idx_machine_tags_tenant_type_keyword",
        "machine_tags",
        ["tenant_id", "tag_type", "keyword_id", "image_id"],
    )
    op.create_index(
        "idx_photo_list_items_list_photo",
        "photo_list_items",
        ["list_id", "photo_id"],
    )


def downgrade():
    op.drop_index("idx_photo_list_items_list_photo", table_name="photo_list_items")
    op.drop_index("idx_machine_tags_tenant_type_keyword", table_name="machine_tags")
    op.drop_index("idx_permatag_image_keyword_signum", table_name="permatags")
    op.drop_index("idx_image_metadata_tenant_rating", table_name="image_metadata")
