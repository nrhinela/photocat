"""add_tenant_uuid_sync_triggers

Revision ID: 202602141120
Revises: 202602141050
Create Date: 2026-02-14 11:20:00.000000

Keep tenant_uuid synchronized from tenant_id for tenant-scoped tables.
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "202602141120"
down_revision: Union[str, None] = "202602141050"
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


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_tenant_uuid_from_tenant_id()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.tenant_id IS NULL THEN
                RETURN NEW;
            END IF;

            IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
                NEW.tenant_uuid := NULL;
            END IF;

            IF NEW.tenant_uuid IS NULL THEN
                SELECT tenant_uuid
                INTO NEW.tenant_uuid
                FROM tenants
                WHERE id = NEW.tenant_id;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    for table_name in TENANT_SCOPED_TABLES:
        op.execute(
            f"""
            CREATE TRIGGER trg_{table_name}_set_tenant_uuid
            BEFORE INSERT OR UPDATE OF tenant_id
            ON {table_name}
            FOR EACH ROW
            EXECUTE FUNCTION set_tenant_uuid_from_tenant_id();
            """
        )


def downgrade() -> None:
    for table_name in reversed(TENANT_SCOPED_TABLES):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table_name}_set_tenant_uuid ON {table_name}")

    op.execute("DROP FUNCTION IF EXISTS set_tenant_uuid_from_tenant_id()")
