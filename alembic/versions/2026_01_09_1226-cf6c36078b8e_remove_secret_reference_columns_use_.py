"""remove secret reference columns use convention

Revision ID: cf6c36078b8e
Revises: 509e3006fd14
Create Date: 2026-01-09 12:26:42.523223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cf6c36078b8e'
down_revision: Union[str, None] = '509e3006fd14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
