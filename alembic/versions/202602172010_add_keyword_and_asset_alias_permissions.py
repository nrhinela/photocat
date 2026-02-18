"""add keyword and asset alias permissions

Revision ID: 202602172010
Revises: 202602171930
Create Date: 2026-02-17 20:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202602172010"
down_revision: Union[str, None] = "202602171930"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PERMISSIONS: tuple[tuple[str, str, str], ...] = (
    ("assets.read", "View assets and media metadata", "images"),
    ("assets.write", "Modify asset ratings, tags, notes, and variants", "images"),
    ("keywords.read", "View keyword categories and keywords", "keywords"),
    ("keywords.write", "Create and edit keyword categories and keywords", "keywords"),
)

ROLE_MAPPINGS: tuple[tuple[str, str], ...] = (
    ("user", "assets.read"),
    ("user", "keywords.read"),
    ("editor", "assets.read"),
    ("editor", "assets.write"),
    ("editor", "keywords.read"),
    ("editor", "keywords.write"),
    ("admin", "assets.read"),
    ("admin", "assets.write"),
    ("admin", "keywords.read"),
    ("admin", "keywords.write"),
)


def _values_clause(rows: tuple[tuple[str, ...], ...]) -> str:
    encoded_rows = []
    for row in rows:
        encoded = []
        for value in row:
            escaped = value.replace("'", "''")
            encoded.append(f"'{escaped}'")
        encoded_rows.append(f"({', '.join(encoded)})")
    return ",\n            ".join(encoded_rows)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    permission_values = _values_clause(PERMISSIONS)
    op.execute(
        sa.text(
            f"""
            INSERT INTO permission_catalog ("key", description, category)
            VALUES
                {permission_values}
            ON CONFLICT ("key") DO UPDATE
            SET
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                is_active = true,
                updated_at = now()
            """
        )
    )

    mapping_values = _values_clause(ROLE_MAPPINGS)
    op.execute(
        sa.text(
            f"""
            INSERT INTO tenant_role_permissions (role_id, permission_key, effect, created_at)
            SELECT
                tr.id,
                mapping.permission_key,
                'allow',
                now()
            FROM tenant_roles tr
            JOIN (
                VALUES
                    {mapping_values}
            ) AS mapping(role_key, permission_key)
                ON mapping.role_key = tr.role_key
            ON CONFLICT (role_id, permission_key) DO UPDATE
            SET effect = 'allow'
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        sa.text(
            """
            DELETE FROM tenant_role_permissions
            WHERE permission_key IN (
                'assets.read',
                'assets.write',
                'keywords.read',
                'keywords.write'
            )
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM permission_catalog
            WHERE key IN (
                'assets.read',
                'assets.write',
                'keywords.read',
                'keywords.write'
            )
            """
        )
    )

