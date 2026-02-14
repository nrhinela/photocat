"""add_tenant_uuid_columns

Revision ID: 202602131700
Revises: 202602111130
Create Date: 2026-02-13 17:00:00.000000

Add an internal UUID identifier for tenants and propagate it to tenant-scoped
tables as a nullable bridge column for phased migration.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "202602131700"
down_revision: Union[str, None] = "202602111130"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TENANT_SCOPED_TABLES: list[str] = [
    "people",
    "assets",
    "image_metadata",
    "permatags",
    "detected_faces",
    "dropbox_cursors",
    "image_embeddings",
    "keyword_models",
    "machine_tags",
    "keyword_categories",
    "keywords",
    "photo_lists",
    "user_tenants",
    "invitations",
]

BATCH_SIZE = 5000
DEFERRED_HEAVY_TABLES = {"machine_tags"}


def _backfill_table_tenant_uuid(table_name: str, batch_size: int = BATCH_SIZE) -> None:
    bind = op.get_bind()

    while True:
        updated_rows = bind.execute(
            sa.text(
                f"""
                WITH batch AS (
                    SELECT target.ctid AS ctid, tenants.tenant_uuid AS tenant_uuid
                    FROM {table_name} AS target
                    JOIN tenants ON target.tenant_id = tenants.id
                    WHERE target.tenant_uuid IS NULL
                    LIMIT :batch_size
                ),
                updated AS (
                    UPDATE {table_name} AS target
                    SET tenant_uuid = batch.tenant_uuid
                    FROM batch
                    WHERE target.ctid = batch.ctid
                    RETURNING 1
                )
                SELECT count(*) FROM updated
                """
            ),
            {"batch_size": batch_size},
        ).scalar_one()

        if updated_rows == 0:
            break


def upgrade() -> None:
    # Avoid tenant-specific statement timeout during large backfills.
    op.execute("SET LOCAL statement_timeout = 0")

    # Add internal UUID to tenants first, backfill existing rows, then enforce.
    op.add_column(
        "tenants",
        sa.Column(
            "tenant_uuid",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.execute("UPDATE tenants SET tenant_uuid = gen_random_uuid() WHERE tenant_uuid IS NULL")
    op.alter_column(
        "tenants",
        "tenant_uuid",
        nullable=False,
        server_default=sa.text("gen_random_uuid()"),
    )
    op.create_index("idx_tenants_tenant_uuid", "tenants", ["tenant_uuid"], unique=True)

    # Add nullable bridge UUID columns to tenant-scoped tables.
    for table_name in TENANT_SCOPED_TABLES:
        op.add_column(
            table_name,
            sa.Column("tenant_uuid", postgresql.UUID(as_uuid=True), nullable=True),
        )
        if table_name in DEFERRED_HEAVY_TABLES:
            continue
        op.create_index(
            f"idx_{table_name}_tenant_uuid",
            table_name,
            ["tenant_uuid"],
            unique=False,
        )

    # Backfill bridge columns from existing tenant_id -> tenants.id mapping.
    # Skip very large tables in this revision to keep deploy-time migration latency low.
    for table_name in TENANT_SCOPED_TABLES:
        if table_name in DEFERRED_HEAVY_TABLES:
            continue
        _backfill_table_tenant_uuid(table_name)


def downgrade() -> None:
    for table_name in reversed(TENANT_SCOPED_TABLES):
        op.execute(f"DROP INDEX IF EXISTS idx_{table_name}_tenant_uuid")
        op.drop_column(table_name, "tenant_uuid")

    op.drop_index("idx_tenants_tenant_uuid", table_name="tenants")
    op.drop_column("tenants", "tenant_uuid")
