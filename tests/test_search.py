"""Test search functionality."""

import pytest
from datetime import datetime, timedelta

from photocat.search import SearchQuery
from photocat.metadata import ImageMetadata, ImageTag, DetectedFace


def test_search_by_keywords(test_db, test_tenant):
    """Test searching by keywords."""
    # Create test image
    image = ImageMetadata(
        tenant_id=test_tenant.id,
        dropbox_path="/test/image.jpg",
        dropbox_id="dbid123",
        filename="image.jpg"
    )
    test_db.add(image)
    test_db.commit()
    
    # Add tags
    tag = ImageTag(
        image_id=image.id,
        tenant_id=test_tenant.id,
        keyword="sunset"
    )
    test_db.add(tag)
    test_db.commit()
    
    # Search
    query = SearchQuery(test_db, test_tenant.id)
    results = query.with_keywords(["sunset"]).execute()
    
    assert len(results) == 1
    assert results[0].filename == "image.jpg"


def test_search_by_person(test_db, test_tenant):
    """Test searching by detected person."""
    image = ImageMetadata(
        tenant_id=test_tenant.id,
        dropbox_path="/test/portrait.jpg",
        dropbox_id="dbid456",
        filename="portrait.jpg"
    )
    test_db.add(image)
    test_db.commit()
    
    face = DetectedFace(
        image_id=image.id,
        tenant_id=test_tenant.id,
        person_name="John Doe",
        confidence=0.95
    )
    test_db.add(face)
    test_db.commit()
    
    query = SearchQuery(test_db, test_tenant.id)
    results = query.with_person("John Doe").execute()
    
    assert len(results) == 1
    assert results[0].filename == "portrait.jpg"


def test_search_by_date_range(test_db, test_tenant):
    """Test searching by date range."""
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    
    image1 = ImageMetadata(
        tenant_id=test_tenant.id,
        dropbox_path="/test/old.jpg",
        dropbox_id="dbid1",
        filename="old.jpg",
        capture_timestamp=yesterday - timedelta(days=30)
    )
    
    image2 = ImageMetadata(
        tenant_id=test_tenant.id,
        dropbox_path="/test/recent.jpg",
        dropbox_id="dbid2",
        filename="recent.jpg",
        capture_timestamp=now
    )
    
    test_db.add_all([image1, image2])
    test_db.commit()
    
    query = SearchQuery(test_db, test_tenant.id)
    results = query.with_date_range(start_date=yesterday).execute()
    
    assert len(results) == 1
    assert results[0].filename == "recent.jpg"


def test_search_by_filename(test_db, test_tenant):
    """Test searching by filename pattern."""
    image = ImageMetadata(
        tenant_id=test_tenant.id,
        dropbox_path="/test/vacation_photo.jpg",
        dropbox_id="dbid789",
        filename="vacation_photo.jpg"
    )
    test_db.add(image)
    test_db.commit()
    
    query = SearchQuery(test_db, test_tenant.id)
    results = query.with_filename("vacation").execute()
    
    assert len(results) == 1
    assert results[0].filename == "vacation_photo.jpg"


def test_search_pagination(test_db, test_tenant):
    """Test search pagination."""
    # Create multiple images
    for i in range(10):
        image = ImageMetadata(
            tenant_id=test_tenant.id,
            dropbox_path=f"/test/image{i}.jpg",
            dropbox_id=f"dbid{i}",
            filename=f"image{i}.jpg"
        )
        test_db.add(image)
    test_db.commit()
    
    query = SearchQuery(test_db, test_tenant.id)
    results = query.limit(5).execute()
    
    assert len(results) == 5
    
    # Test offset
    results = query.offset(5).limit(5).execute()
    assert len(results) == 5


def test_tenant_isolation(test_db):
    """Test that search respects tenant isolation."""
    # Create images for different tenants
    image1 = ImageMetadata(
        tenant_id="tenant1",
        dropbox_path="/test/image1.jpg",
        dropbox_id="dbid1",
        filename="image1.jpg"
    )
    
    image2 = ImageMetadata(
        tenant_id="tenant2",
        dropbox_path="/test/image2.jpg",
        dropbox_id="dbid2",
        filename="image2.jpg"
    )
    
    test_db.add_all([image1, image2])
    test_db.commit()
    
    # Search for tenant1 only
    query = SearchQuery(test_db, "tenant1")
    results = query.execute()
    
    assert len(results) == 1
    assert results[0].tenant_id == "tenant1"
