"""Router for keyword operations."""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional

from photocat.dependencies import get_db, get_tenant
from photocat.tenant import Tenant
from photocat.metadata import ImageTag, ImageMetadata
from photocat.models.config import PhotoList, PhotoListItem
from photocat.config.db_config import ConfigManager

router = APIRouter(
    prefix="/api/v1",
    tags=["keywords"]
)


@router.get("/keywords")
async def get_available_keywords(
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
    list_id: Optional[int] = None,
    rating: Optional[int] = None,
    rating_operator: str = "eq",
    hide_zero_rating: bool = False
):
    """Get all available keywords from config for faceted search with counts.

    Counts reflect active filters (list, rating) so dropdown matches actual results.
    """
    config_mgr = ConfigManager(db, tenant.id)
    all_keywords = config_mgr.get_all_keywords()

    # Build filter_ids based on active filters (same logic as images endpoint)
    filter_ids = None

    if list_id is not None:
        lst = db.query(PhotoList).filter_by(id=list_id, tenant_id=tenant.id).first()
        if lst:
            list_image_ids = db.query(PhotoListItem.photo_id).filter(
                PhotoListItem.list_id == list_id
            ).all()
            filter_ids = {row[0] for row in list_image_ids}

    if rating is not None:
        rating_query = db.query(ImageMetadata.id).filter(
            ImageMetadata.tenant_id == tenant.id
        )
        if rating_operator == "gte":
            rating_query = rating_query.filter(ImageMetadata.rating >= rating)
        elif rating_operator == "gt":
            rating_query = rating_query.filter(ImageMetadata.rating > rating)
        else:
            rating_query = rating_query.filter(ImageMetadata.rating == rating)
        rating_image_ids = rating_query.all()
        rating_ids = {row[0] for row in rating_image_ids}
        if filter_ids is None:
            filter_ids = rating_ids
        else:
            filter_ids = filter_ids.intersection(rating_ids)

    if hide_zero_rating:
        zero_rating_ids = db.query(ImageMetadata.id).filter(
            ImageMetadata.tenant_id == tenant.id,
            ImageMetadata.rating == 0
        ).all()
        zero_ids = {row[0] for row in zero_rating_ids}
        if filter_ids is None:
            all_image_ids = db.query(ImageMetadata.id).filter(
                ImageMetadata.tenant_id == tenant.id
            ).all()
            filter_ids = {row[0] for row in all_image_ids} - zero_ids
        else:
            filter_ids = filter_ids - zero_ids

    # Get counts for each keyword, filtered by active filters
    query = db.query(
        ImageTag.keyword,
        func.count(func.distinct(ImageTag.image_id)).label('count')
    ).filter(
        ImageTag.tenant_id == tenant.id
    )

    # Apply filter_ids if any filters are active
    if filter_ids is not None:
        query = query.filter(ImageTag.image_id.in_(filter_ids))

    keyword_counts = query.group_by(
        ImageTag.keyword
    ).all()

    # Create a dictionary of keyword -> count
    counts_dict = {kw: count for kw, count in keyword_counts}

    # Group by category with counts
    by_category = {}
    for kw in all_keywords:
        cat = kw['category']
        keyword = kw['keyword']
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append({
            'keyword': keyword,
            'count': counts_dict.get(keyword, 0)
        })

    return {
        "tenant_id": tenant.id,
        "keywords_by_category": by_category,
        "all_keywords": [kw['keyword'] for kw in all_keywords]
    }
