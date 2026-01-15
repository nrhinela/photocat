"""Router for keyword and category management endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from photocat.dependencies import get_db
from photocat.models.config import KeywordCategory, Keyword

router = APIRouter(
    prefix="/api/v1/admin/keywords",
    tags=["admin-keywords"]
)


# ============================================================================
# Keyword Category Endpoints
# ============================================================================

@router.get("/categories", response_model=list)
async def list_keyword_categories(
    tenant_id: str = None,
    db: Session = Depends(get_db)
):
    """List all keyword categories for a tenant."""
    if not tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-ID header required")

    categories = db.query(KeywordCategory).filter(
        KeywordCategory.tenant_id == tenant_id
    ).order_by(KeywordCategory.sort_order).all()

    return [{
        "id": cat.id,
        "tenant_id": cat.tenant_id,
        "name": cat.name,
        "parent_id": cat.parent_id,
        "sort_order": cat.sort_order,
        "keyword_count": db.query(Keyword).filter(Keyword.category_id == cat.id).count()
    } for cat in categories]


@router.post("/categories", response_model=dict)
async def create_keyword_category(
    category_data: dict,
    tenant_id: str = None,
    db: Session = Depends(get_db)
):
    """Create a new keyword category."""
    if not tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-ID header required")

    if not category_data.get("name"):
        raise HTTPException(status_code=400, detail="name is required")

    # Get max sort_order for this tenant
    max_sort = db.query(func.max(KeywordCategory.sort_order)).filter(
        KeywordCategory.tenant_id == tenant_id
    ).scalar() or -1

    category = KeywordCategory(
        tenant_id=tenant_id,
        name=category_data["name"],
        parent_id=category_data.get("parent_id"),
        sort_order=category_data.get("sort_order", max_sort + 1)
    )

    db.add(category)
    db.commit()
    db.refresh(category)

    return {
        "id": category.id,
        "tenant_id": category.tenant_id,
        "name": category.name,
        "parent_id": category.parent_id,
        "sort_order": category.sort_order
    }


@router.put("/categories/{category_id}", response_model=dict)
async def update_keyword_category(
    category_id: int,
    category_data: dict,
    db: Session = Depends(get_db)
):
    """Update a keyword category."""
    category = db.query(KeywordCategory).filter(KeywordCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if "name" in category_data:
        category.name = category_data["name"]
    if "parent_id" in category_data:
        category.parent_id = category_data["parent_id"]
    if "sort_order" in category_data:
        category.sort_order = category_data["sort_order"]

    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)

    return {
        "id": category.id,
        "name": category.name,
        "parent_id": category.parent_id,
        "sort_order": category.sort_order
    }


@router.delete("/categories/{category_id}", response_model=dict)
async def delete_keyword_category(
    category_id: int,
    db: Session = Depends(get_db)
):
    """Delete a keyword category and all its keywords."""
    category = db.query(KeywordCategory).filter(KeywordCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Delete all keywords in this category
    db.query(Keyword).filter(Keyword.category_id == category_id).delete()

    # Delete the category
    db.delete(category)
    db.commit()

    return {"status": "deleted", "category_id": category_id}


# ============================================================================
# Keyword Endpoints
# ============================================================================

@router.get("/categories/{category_id}/keywords", response_model=list)
async def list_keywords_in_category(
    category_id: int,
    db: Session = Depends(get_db)
):
    """List all keywords in a category."""
    keywords = db.query(Keyword).filter(
        Keyword.category_id == category_id
    ).order_by(Keyword.sort_order).all()

    return [{
        "id": kw.id,
        "category_id": kw.category_id,
        "keyword": kw.keyword,
        "prompt": kw.prompt,
        "sort_order": kw.sort_order
    } for kw in keywords]


@router.post("/categories/{category_id}/keywords", response_model=dict)
async def create_keyword(
    category_id: int,
    keyword_data: dict,
    db: Session = Depends(get_db)
):
    """Create a new keyword in a category."""
    if not keyword_data.get("keyword"):
        raise HTTPException(status_code=400, detail="keyword is required")

    # Verify category exists
    category = db.query(KeywordCategory).filter(KeywordCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Get max sort_order for this category
    max_sort = db.query(func.max(Keyword.sort_order)).filter(
        Keyword.category_id == category_id
    ).scalar() or -1

    keyword = Keyword(
        category_id=category_id,
        keyword=keyword_data["keyword"],
        prompt=keyword_data.get("prompt", ""),
        sort_order=keyword_data.get("sort_order", max_sort + 1)
    )

    db.add(keyword)
    db.commit()
    db.refresh(keyword)

    return {
        "id": keyword.id,
        "category_id": keyword.category_id,
        "keyword": keyword.keyword,
        "prompt": keyword.prompt,
        "sort_order": keyword.sort_order
    }


@router.put("/{keyword_id}", response_model=dict)
async def update_keyword(
    keyword_id: int,
    keyword_data: dict,
    db: Session = Depends(get_db)
):
    """Update a keyword."""
    keyword = db.query(Keyword).filter(Keyword.id == keyword_id).first()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    if "keyword" in keyword_data:
        keyword.keyword = keyword_data["keyword"]
    if "prompt" in keyword_data:
        keyword.prompt = keyword_data["prompt"]
    if "sort_order" in keyword_data:
        keyword.sort_order = keyword_data["sort_order"]
    if "category_id" in keyword_data:
        keyword.category_id = keyword_data["category_id"]

    keyword.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(keyword)

    return {
        "id": keyword.id,
        "category_id": keyword.category_id,
        "keyword": keyword.keyword,
        "prompt": keyword.prompt,
        "sort_order": keyword.sort_order
    }


@router.delete("/{keyword_id}", response_model=dict)
async def delete_keyword(
    keyword_id: int,
    db: Session = Depends(get_db)
):
    """Delete a keyword."""
    keyword = db.query(Keyword).filter(Keyword.id == keyword_id).first()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    db.delete(keyword)
    db.commit()

    return {"status": "deleted", "keyword_id": keyword_id}
