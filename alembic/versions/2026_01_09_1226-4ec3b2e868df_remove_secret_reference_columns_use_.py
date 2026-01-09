"""remove_secret_reference_columns_use_convention

Revision ID: 4ec3b2e868df
Revises: cf6c36078b8e
Create Date: 2026-01-09 12:26:47.411991

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ec3b2e868df'
down_revision: Union[str, None] = 'cf6c36078b8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop dropbox_app_secret_ref and dropbox_access_token_ref columns.
    
    Secret Manager paths will now be constructed from tenant_id using convention:
    - dropbox-app-secret-{tenant_id}
    - dropbox-token-{tenant_id}
    """
    op.drop_column('tenants', 'dropbox_app_secret_ref')
    op.drop_column('tenants', 'dropbox_access_token_ref')


def downgrade() -> None:
    """Re-add the columns if needed."""
    op.add_column('tenants', sa.Column('dropbox_app_secret_ref', sa.String(255), nullable=True))
    op.add_column('tenants', sa.Column('dropbox_access_token_ref', sa.String(255), nullable=True))
