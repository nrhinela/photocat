"""add covering index for ml score image query

Revision ID: 202602191545
Revises: 202602191200
Create Date: 2026-02-19 15:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202602191545"
down_revision: Union[str, None] = "202602191200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        op.execute(
            sa.text(
                """
                CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_machine_tags_tenant_type_keyword_model_asset_inc_confidence
                ON machine_tags (tenant_id, tag_type, keyword_id, model_name, asset_id)
                INCLUDE (confidence)
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        op.execute(
            sa.text(
                """
                DROP INDEX CONCURRENTLY IF EXISTS
                    idx_machine_tags_tenant_type_keyword_model_asset_inc_confidence
                """
            )
        )
