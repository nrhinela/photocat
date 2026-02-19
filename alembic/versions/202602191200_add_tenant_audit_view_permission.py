"""add tenant audit view permission

Revision ID: 202602191200
Revises: 202602181730
Create Date: 2026-02-19 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202602191200"
down_revision: Union[str, None] = "202602181730"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        sa.text(
            """
            INSERT INTO permission_catalog ("key", description, category)
            VALUES ('tenant.audit.view', 'View tenant activity audit events', 'tenant_admin')
            ON CONFLICT ("key") DO UPDATE
            SET
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                is_active = true,
                updated_at = now()
            """
        )
    )

    # Preserve existing access semantics by granting tenant.audit.view to any role
    # that currently allows tenant.users.view.
    op.execute(
        sa.text(
            """
            INSERT INTO tenant_role_permissions (role_id, permission_key, effect, created_at)
            SELECT
                trp.role_id,
                'tenant.audit.view',
                'allow',
                now()
            FROM tenant_role_permissions AS trp
            WHERE trp.permission_key = 'tenant.users.view'
              AND lower(coalesce(trp.effect, 'allow')) = 'allow'
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
            WHERE permission_key = 'tenant.audit.view'
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM permission_catalog
            WHERE "key" = 'tenant.audit.view'
            """
        )
    )
