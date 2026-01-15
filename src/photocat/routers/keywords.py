"""Router for keyword operations."""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from photocat.dependencies import get_db, get_tenant
from photocat.tenant import Tenant
from photocat.metadata import ImageTag
from photocat.config.db_config import ConfigManager

router = APIRouter(
    prefix="/api/v1",
    tags=["keywords"]
)


@router.get("/keywords")
async def get_available_keywords(
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """Get all available keywords from config for faceted search with counts."""
    config_mgr = ConfigManager(db, tenant.id)
    all_keywords = config_mgr.get_all_keywords()

    # Get counts for each keyword
    keyword_counts = db.query(
        ImageTag.keyword,
        func.count(func.distinct(ImageTag.image_id)).label('count')
    ).filter(
        ImageTag.tenant_id == tenant.id
    ).group_by(
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
