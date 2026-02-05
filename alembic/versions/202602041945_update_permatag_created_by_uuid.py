"""update_permatag_created_by_uuid

Revision ID: 202602041945
Revises: 202602041430
Create Date: 2026-02-04 19:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202602041945"
down_revision: Union[str, None] = "202602041430"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UUID_REGEX = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute(
            f"""
            ALTER TABLE permatags
            ALTER COLUMN created_by TYPE uuid
            USING CASE
                WHEN created_by ~* '{UUID_REGEX}' THEN created_by::uuid
                ELSE NULL
            END
            """
        )
    else:
        op.alter_column("permatags", "created_by", type_=sa.String(length=36), nullable=True)

    op.create_foreign_key(
        "fk_permatags_created_by_user_profiles",
        "permatags",
        "user_profiles",
        ["created_by"],
        ["supabase_uid"],
        ondelete="SET NULL",
    )
    op.create_index("idx_permatags_created_by", "permatags", ["created_by"])



def downgrade() -> None:
    op.drop_index("idx_permatags_created_by", table_name="permatags")
    op.drop_constraint("fk_permatags_created_by_user_profiles", "permatags", type_="foreignkey")

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute("ALTER TABLE permatags ALTER COLUMN created_by TYPE varchar(255) USING created_by::text")
    else:
        op.alter_column("permatags", "created_by", type_=sa.String(length=255), nullable=True)
