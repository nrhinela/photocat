"""Tests for asset text index document construction and refresh behavior."""

import uuid

from sqlalchemy.orm import Session

from zoltag.metadata import Asset, AssetTextIndex, ImageMetadata
from zoltag.text_index import build_asset_text_document, rebuild_asset_text_index


TEST_TENANT_IDENTIFIER = "test_tenant"
TEST_TENANT_ID = uuid.uuid5(uuid.NAMESPACE_DNS, TEST_TENANT_IDENTIFIER)


def _create_asset_image(test_db: Session, tenant_id: uuid.UUID, image_id: int, filename: str, source_key: str) -> Asset:
    asset = Asset(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        filename=filename,
        source_provider="dropbox",
        source_key=source_key,
        thumbnail_key=f"thumbs/{filename}",
    )
    test_db.add(asset)
    test_db.flush()

    image = ImageMetadata(
        id=image_id,
        asset_id=asset.id,
        tenant_id=tenant_id,
        filename=filename,
        file_size=1024,
        width=100,
        height=100,
        format="JPEG",
    )
    test_db.add(image)
    test_db.flush()
    return asset


def test_build_asset_text_document_includes_source_key(test_db: Session):
    tenant_id = TEST_TENANT_ID
    source_key = "/Shows/BlueLight/IMG_1234-final.jpg"
    filename = "IMG_1234-final.jpg"
    asset = _create_asset_image(
        test_db,
        tenant_id=tenant_id,
        image_id=1,
        filename=filename,
        source_key=source_key,
    )
    test_db.commit()

    document = build_asset_text_document(
        test_db,
        tenant_id=tenant_id,
        asset_id=asset.id,
        include_embeddings=False,
    )

    assert document.components["source_key"] == source_key
    assert document.components["source_filename"] == filename
    assert f"source key {source_key}" in document.search_text
    assert f"source filename {filename}" in document.search_text


def test_rebuild_asset_text_index_refreshes_legacy_rows_missing_source_key(test_db: Session):
    tenant_id = TEST_TENANT_ID
    source_key = "/Dropbox/Favorites/My-Circus-Clip.mov"
    filename = "My-Circus-Clip.mov"
    asset = _create_asset_image(
        test_db,
        tenant_id=tenant_id,
        image_id=2,
        filename=filename,
        source_key=source_key,
    )
    test_db.add(
        AssetTextIndex(
            asset_id=asset.id,
            tenant_id=tenant_id,
            search_text=f"asset {filename}",
            components={"filename": filename},
        )
    )
    test_db.commit()

    result = rebuild_asset_text_index(
        test_db,
        tenant_id=tenant_id,
        include_embeddings=False,
        refresh=False,
    )

    assert result["processed"] == 1
    refreshed = test_db.query(AssetTextIndex).filter(AssetTextIndex.asset_id == asset.id).one()
    assert refreshed.components["source_key"] == source_key
    assert "source key " in refreshed.search_text
    assert source_key in refreshed.search_text
