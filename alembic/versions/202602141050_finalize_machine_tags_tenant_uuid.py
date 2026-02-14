"""finalize_machine_tags_tenant_uuid

Revision ID: 202602141050
Revises: 202602131700
Create Date: 2026-02-14 10:50:00.000000

Backfill machine_tags.tenant_uuid and add its index as a follow-up step.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202602141050"
down_revision: Union[str, None] = "202602131700"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BATCH_SIZE = 5000


def upgrade() -> None:
    op.execute("SET LOCAL statement_timeout = 0")
    bind = op.get_bind()

    while True:
        updated_rows = bind.execute(
            sa.text(
                """
                WITH batch AS (
                    SELECT target.ctid AS ctid, tenants.tenant_uuid AS tenant_uuid
                    FROM machine_tags AS target
                    JOIN tenants ON target.tenant_id = tenants.id
                    WHERE target.tenant_uuid IS NULL
                    LIMIT :batch_size
                ),
                updated AS (
                    UPDATE machine_tags AS target
                    SET tenant_uuid = batch.tenant_uuid
                    FROM batch
                    WHERE target.ctid = batch.ctid
                    RETURNING 1
                )
                SELECT count(*) FROM updated
                """
            ),
            {"batch_size": BATCH_SIZE},
        ).scalar_one()
        if updated_rows == 0:
            break

    op.create_index("idx_machine_tags_tenant_uuid", "machine_tags", ["tenant_uuid"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_machine_tags_tenant_uuid", table_name="machine_tags")
