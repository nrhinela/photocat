"""add_image_embeddings_hash_expr_index

Revision ID: 202602101215
Revises: 202602091200
Create Date: 2026-02-10 12:15:00.000000

Adds a functional index used by duplicate-embedding queries:
  WHERE tenant_id = ?
  GROUP BY md5(embedding::text)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202602101215"
down_revision: Union[str, None] = "202602091200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "idx_image_embeddings_tenant_md5_embedding",
            "image_embeddings",
            ["tenant_id", sa.text("md5((embedding)::text)")],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "idx_image_embeddings_tenant_md5_embedding",
            table_name="image_embeddings",
            postgresql_concurrently=True,
            if_exists=True,
        )
