"""enforce_nonempty_asset_keys

Revision ID: 202602082340
Revises: 202602082330
Create Date: 2026-02-08 23:40:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "202602082340"
down_revision: Union[str, None] = "202602082330"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET LOCAL statement_timeout = 0")
    op.execute("SET LOCAL lock_timeout = '30s'")

    op.execute(
        """
        DO $$
        DECLARE
            v_source_provider_bad bigint;
            v_source_key_bad bigint;
            v_thumbnail_key_bad bigint;
        BEGIN
            SELECT count(*) INTO v_source_provider_bad
            FROM assets
            WHERE source_provider IS NULL OR btrim(source_provider) = '';
            IF v_source_provider_bad > 0 THEN
                RAISE EXCEPTION
                    'Cannot enforce source_provider constraint: % rows are NULL/blank',
                    v_source_provider_bad;
            END IF;

            SELECT count(*) INTO v_source_key_bad
            FROM assets
            WHERE source_key IS NULL OR btrim(source_key) = '';
            IF v_source_key_bad > 0 THEN
                RAISE EXCEPTION
                    'Cannot enforce source_key constraint: % rows are NULL/blank',
                    v_source_key_bad;
            END IF;

            SELECT count(*) INTO v_thumbnail_key_bad
            FROM assets
            WHERE thumbnail_key IS NULL OR btrim(thumbnail_key) = '';
            IF v_thumbnail_key_bad > 0 THEN
                RAISE EXCEPTION
                    'Cannot enforce thumbnail_key constraint: % rows are NULL/blank',
                    v_thumbnail_key_bad;
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        ALTER TABLE assets
        ADD CONSTRAINT ck_assets_source_provider_not_blank
        CHECK (source_provider IS NOT NULL AND btrim(source_provider) <> '')
        NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE assets
        ADD CONSTRAINT ck_assets_source_key_not_blank
        CHECK (source_key IS NOT NULL AND btrim(source_key) <> '')
        NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE assets
        ADD CONSTRAINT ck_assets_thumbnail_key_not_blank
        CHECK (thumbnail_key IS NOT NULL AND btrim(thumbnail_key) <> '')
        NOT VALID
        """
    )

    op.execute("ALTER TABLE assets VALIDATE CONSTRAINT ck_assets_source_provider_not_blank")
    op.execute("ALTER TABLE assets VALIDATE CONSTRAINT ck_assets_source_key_not_blank")
    op.execute("ALTER TABLE assets VALIDATE CONSTRAINT ck_assets_thumbnail_key_not_blank")


def downgrade() -> None:
    op.execute("SET LOCAL statement_timeout = 0")
    op.execute("SET LOCAL lock_timeout = '30s'")

    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS ck_assets_thumbnail_key_not_blank")
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS ck_assets_source_key_not_blank")
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS ck_assets_source_provider_not_blank")

