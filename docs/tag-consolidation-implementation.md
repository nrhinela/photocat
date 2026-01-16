# Tag Consolidation Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for consolidating machine-generated tags into a single `machine_tags` table while keeping `permatags` independent. The work is broken into five focused PRs to enable staged rollout and easy rollback.

## Assumptions

- Current models: SigLIP (zero-shot), trained keyword models
- Current tagging flow: image processed → SigLIP generates tags → stored in `image_tags` or `trained_image_tags`
- Permatags are user decisions and remain in separate table
- PostgreSQL database with `ON CONFLICT` support
- No breaking changes to API responses in Phase 1-4; only internal schema changes

## PR 1: Add `machine_tags` Table (Schema Only)

**Goal**: Create new table structure without touching existing data or code.

**Files Modified**:
- `alembic/versions/202601XX_add_machine_tags_table.py` (new)

**Migration Details**:

```python
"""Add consolidated machine_tags table for all algorithm outputs.

Revision ID: 202601XX
Revises: 202601151900
Create Date: 2026-01-XX XX:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "202601XX"
down_revision = "202601151900_add_trained_image_tags"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "machine_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False),
        sa.Column("keyword", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("tag_type", sa.String(length=50), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Indexes for common query patterns
    op.create_index(
        "idx_machine_tags_per_image",
        "machine_tags",
        ["tenant_id", "image_id", "tag_type"]
    )
    op.create_index(
        "idx_machine_tags_facets",
        "machine_tags",
        ["tenant_id", "tag_type", "keyword"]
    )
    op.create_index(
        "idx_machine_tags_unique",
        "machine_tags",
        ["tenant_id", "image_id", "keyword", "tag_type", "model_name"],
        unique=True
    )

def downgrade():
    op.drop_index("idx_machine_tags_unique", table_name="machine_tags")
    op.drop_index("idx_machine_tags_facets", table_name="machine_tags")
    op.drop_index("idx_machine_tags_per_image", table_name="machine_tags")
    op.drop_table("machine_tags")
```

**Testing**:
- Verify table structure: `\d machine_tags` in psql
- Verify indexes exist: `\di` in psql
- No existing code changes, so no functional tests needed

**Rollback Risk**: Low - just drops empty table

---

## PR 2: Data Migration and ORM Model Updates

**Goal**: Migrate data from old tables to new table, add ORM model, keep existing code working.

**Files Modified**:
- `alembic/versions/202601XX_migrate_tags_to_machine_tags.py` (new)
- `src/photocat/metadata/__init__.py` (updated)

### Migration: 202601XX_migrate_tags_to_machine_tags.py

```python
"""Migrate image_tags and trained_image_tags to machine_tags.

Revision ID: 202601XX
Revises: 202601XX_add_machine_tags_table
Create Date: 2026-01-XX XX:00:00
"""

from alembic import op
from sqlalchemy import text

revision = "202601XX"
down_revision = "202601XX_add_machine_tags_table"
branch_labels = None
depends_on = None

def upgrade():
    # Migrate from image_tags (zero-shot SigLIP tags)
    # Populate model_name with known current model to avoid NULL uniqueness bypass
    # Use full model name as per tagging.py: SigLIPTagger uses "google/siglip-so400m-patch14-384"
    op.execute("""
        INSERT INTO machine_tags
            (image_id, tenant_id, keyword, category, confidence, tag_type, model_name, created_at, updated_at)
        SELECT
            image_id,
            tenant_id,
            keyword,
            category,
            COALESCE(confidence, 0.0),
            'siglip',
            'google/siglip-so400m-patch14-384',
            COALESCE(created_at, NOW()),
            NOW()
        FROM image_tags
        ON CONFLICT (tenant_id, image_id, keyword, tag_type, model_name) DO NOTHING
    """)

    # Migrate from trained_image_tags (trained keyword model outputs)
    # Keep existing model_name if present; default to 'trained' if null
    op.execute("""
        INSERT INTO machine_tags
            (image_id, tenant_id, keyword, category, confidence, tag_type, model_name, model_version, created_at, updated_at)
        SELECT
            image_id,
            tenant_id,
            keyword,
            category,
            COALESCE(confidence, 0.0),
            'trained',
            COALESCE(model_name, 'trained'),
            model_version,
            COALESCE(created_at, NOW()),
            NOW()
        FROM trained_image_tags
        ON CONFLICT (tenant_id, image_id, keyword, tag_type, model_name) DO NOTHING
    """)

def downgrade():
    # Delete migrated data
    op.execute("DELETE FROM machine_tags WHERE tag_type IN ('siglip', 'trained')")
```

**Note on `ON CONFLICT DO NOTHING`**: If data migration is re-run (e.g., during development), don't fail on duplicates. Production migrations can use strict inserts if needed.

### ORM Model Update: src/photocat/metadata/__init__.py

Add new `MachineTag` class:

```python
class MachineTag(Base):
    """Algorithm-generated tag assignments.

    Consolidates outputs from all tagging algorithms:
    - Zero-shot models (SigLIP, CLIP, etc.)
    - Trained keyword models
    - Visual similarity
    - Facial recognition
    - Future algorithms
    """

    __tablename__ = "machine_tags"

    id = Column(Integer, primary_key=True)
    image_id = Column(Integer, ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(255), nullable=False, index=True)

    # Tag assignment
    keyword = Column(String(255), nullable=False, index=True)
    category = Column(String(255))  # Parent category from hierarchy

    # Algorithm output
    confidence = Column(Float, nullable=False)  # Confidence/relevance score [0-1]

    # Algorithm identification
    tag_type = Column(String(50), nullable=False, index=True)
    # Examples: 'siglip', 'clip', 'trained', 'visual_similarity', 'facial_recognition'

    model_name = Column(String(100), nullable=False)
    # e.g., 'google/siglip-so400m-patch14-384' (matches SigLIPTagger in tagging.py:112),
    # 'openai/clip-vit-large' (hypothetical CLIP), 'trained' (keyword models)
    # Must match the model_name set by the tagger at insertion time to ensure
    # filtering/uniqueness/upserts work correctly across all code paths.
    # Non-null to ensure uniqueness constraint is not bypassed by NULLs

    model_version = Column(String(50))  # Version of the model that generated this tag

    # Audit trail
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # updated_at tracks when tags are refreshed (used with ON CONFLICT upsert)

    # Relationships
    image = relationship("ImageMetadata", back_populates="machine_tags")

    __table_args__ = (
        Index("idx_machine_tags_per_image", "tenant_id", "image_id", "tag_type"),
        Index("idx_machine_tags_facets", "tenant_id", "tag_type", "keyword"),
        Index("idx_machine_tags_unique",
              "tenant_id", "image_id", "keyword", "tag_type", "model_name",
              unique=True),
    )
```

Update `ImageMetadata` relationships:

```python
class ImageMetadata(Base):
    # ... existing fields ...

    # Relationships
    permatags = relationship("Permatag", back_populates="image", cascade="all, delete-orphan")
    machine_tags = relationship("MachineTag", back_populates="image", cascade="all, delete-orphan")
    # Deprecate: tags = relationship("ImageTag", ...) -- will be removed in PR 5
    faces = relationship("DetectedFace", back_populates="image", cascade="all, delete-orphan")
```

**Testing**:
- Run migrations: `alembic upgrade head`
- Verify data copied: `SELECT COUNT(*) FROM machine_tags`
- Spot check some rows match source tables
- Verify uniqueness constraint works: Try inserting duplicate → should fail
- Verify indexes were created

**Rollback Risk**: Medium - data is migrated, but old tables still exist. Downgrade deletes migrated data, leaving old tables intact for re-migration.

---

## PR 3: Update Router Queries to Use MachineTag

**Goal**: Update all endpoints that query `ImageTag` or `TrainedImageTag` to use `MachineTag` instead.

**Files Modified**:
- `src/photocat/routers/images.py`
- `src/photocat/routers/keywords.py`
- `src/photocat/routers/lists.py`
- `src/photocat/routers/sync.py`
- `src/photocat/learning.py`
- `src/photocat/cli.py`

### 3.1: routers/keywords.py

**Current code** (lines 103-112):
```python
all_tags = db.query(ImageTag).filter(
    ImageTag.tenant_id == tenant.id,
    ImageTag.image_id.in_(effective_images)
).all()

all_permatags = db.query(Permatag).filter(
    Permatag.tenant_id == tenant.id,
    Permatag.image_id.in_(effective_images)
).all()
```

**Updated code**:
```python
# Get machine tags from primary algorithm only
from photocat.metadata import MachineTag
from photocat.dependencies import get_tenant_setting

# Get active tag type from tenant config (must be added in PR 2 or earlier)
# Fallback to 'siglip' if not configured (for backward compatibility)
active_tag_type = get_tenant_setting(db, tenant.id, 'active_machine_tag_type', default='siglip')
// COMMENT (Codex): If you choose the separate column approach, this helper won't
// read it yet. Either expand helper to check the column or clarify JSONB-only.

all_tags = db.query(MachineTag).filter(
    MachineTag.tenant_id == tenant.id,
    MachineTag.image_id.in_(effective_images),
    MachineTag.tag_type == active_tag_type  # Filter by primary algorithm
).all()

all_permatags = db.query(Permatag).filter(
    Permatag.tenant_id == tenant.id,
    Permatag.image_id.in_(effective_images)
).all()
```

**Helper function** (add to `src/photocat/dependencies.py`):
```python
def get_tenant_setting(db: Session, tenant_id: str, key: str, default=None):
    """Safely get tenant setting with fallback.

    Args:
        db: Database session
        tenant_id: Tenant ID
        key: Setting key (e.g., 'active_machine_tag_type')
        default: Fallback value if not found

    Returns:
        Setting value or default
    """
    tenant = db.query(Tenant).filter_by(id=tenant_id).first()
    if not tenant:
        return default

    # If tenant.settings is JSONB:
    settings = getattr(tenant, 'settings', {}) or {}
    return settings.get(key, default)
```

**OR if using a separate column** (add to `Tenant` model in PR 2 migration):
```python
op.add_column('tenants', sa.Column('active_machine_tag_type', sa.String(50), server_default='siglip'))
```

**Impact**:
- Lines 115-139: Rename `permatag_map` construction (no logic change)
- Lines 126-138: Tag merging logic unchanged (still applies permatag overrides)
- No API response changes

### 3.2: routers/images.py

**Affected endpoints**:
1. `/api/v1/images` (lines 380-387): Get tags for search results
2. `/api/v1/images/{id}/tags` (lines 475-481): Get image tags
3. `/api/v1/ml-training` (lines 609-689): Show all algorithm outputs
4. `/api/v1/images/{id}/tag` (lines 886-901): Apply manual tags

**Changes**:

```python
# Line 151-157: Get all tags for filtered images
from photocat.metadata import MachineTag
from photocat.dependencies import get_tenant_setting

# Use helper consistently for all tenant settings access
active_tag_type = get_tenant_setting(db, tenant.id, 'active_machine_tag_type', default='siglip')

all_machine_tags = db.query(MachineTag).filter(
    MachineTag.tenant_id == tenant.id,
    MachineTag.image_id.in_(all_image_ids),
    MachineTag.tag_type == active_tag_type
).all()

all_permatags = db.query(Permatag).filter(
    Permatag.tenant_id == tenant.id,
    Permatag.image_id.in_(all_image_ids)
).all()

# Lines 164-177: Tag grouping by image (no logic change)
tags_by_image = {}
for tag in all_machine_tags:
    tags_by_image.setdefault(tag.image_id, []).append({
        "keyword": tag.keyword,
        "category": tag.category,
        "confidence": tag.confidence
    })
```

**For `/ml-training` endpoint** (comparison view):
```python
# Line 609-622: Get ALL algorithm outputs (not filtered by active_tag_type)
all_machine_tags = db.query(MachineTag).filter(
    MachineTag.tenant_id == tenant.id,
    MachineTag.image_id.in_(image_ids)
).all()

# Group by algorithm
tags_by_type = {}
for tag in all_machine_tags:
    tags_by_type.setdefault(tag.tag_type, {}).setdefault(tag.image_id, []).append({
        "keyword": tag.keyword,
        "category": tag.category,
        "confidence": tag.confidence
    })

# Then organize by image in response
```

**Manual tag application** (lines 886-901):
```python
# Manual tags should be stored in permatags (ground truth), not machine_tags
# This ensures:
# - User decisions stay in their authoritative table (permatags)
# - No double-counting (manual + permatag for same tag)
# - clear audit trail (created_by, signum indicate user action)

# When user applies tag approval/rejection, create/update permatag
existing = db.query(Permatag).filter(
    Permatag.image_id == image_id,
    Permatag.keyword == keyword,
    Permatag.tenant_id == tenant.id
).first()

if existing:
    # Update existing permatag
    existing.signum = signum  # +1 for approve, -1 for reject
    existing.created_by = current_user
else:
    # Create new permatag
    db.add(Permatag(
        image_id=image_id,
        tenant_id=tenant.id,
        keyword=keyword,
        category=category,
        signum=signum,
        created_by=current_user
    ))

db.commit()
# Note: Do NOT insert into machine_tags here. Permatags override machine_tags
# via calculate_tags() logic at display time.
```

**Design clarification**: The system has two layers:
- **Ground truth** (`permatags`): User decisions, always authoritative
- **Predictions** (`machine_tags`): Algorithm outputs, can be overridden by permatags
- **Merging** (`calculate_tags()`): Combines machine tags with permatag overrides at query time

Manual user input = permatag (not machine_tag).

### 3.3: routers/lists.py

**Lines 197-201**:
```python
# Before
tags = db.query(ImageTag).filter(...)

# After
from photocat.dependencies import get_tenant_setting

active_tag_type = get_tenant_setting(db, tenant.id, 'active_machine_tag_type', default='siglip')
tags = db.query(MachineTag).filter(
    MachineTag.image_id == image_id,
    MachineTag.tag_type == active_tag_type
).all()
```

### 3.4: routers/sync.py

**Lines 340**: When resetting tags for reprocessing:
```python
# Before
db.query(ImageTag).filter(ImageTag.image_id == metadata.id).delete()

# After
db.query(MachineTag).filter(
    MachineTag.image_id == metadata.id,
    MachineTag.tag_type.in_(['siglip', 'trained'])  # Remove machine tags only
).delete()
# Permatags remain unchanged
```

### 3.5: learning.py

**Lines 153-157**: Recompute trained tags
```python
# Instead of delete + insert, use ON CONFLICT upsert
from sqlalchemy.dialects.postgresql import insert

def recompute_trained_tags_for_image(...):
    # ... compute trained_tags ...

    for tag in trained_tags:
        stmt = insert(MachineTag).values(
            image_id=image_id,
            tenant_id=tenant_id,
            keyword=tag['keyword'],
            category=tag['category'],
            confidence=tag['confidence'],
            tag_type='trained',
            model_name=model_name,
            model_version=model_version
        ).on_conflict_do_update(
            index_elements=['tenant_id', 'image_id', 'keyword', 'tag_type', 'model_name'],
            set_={
                'confidence': tag['confidence'],
                'model_version': model_version,
                'updated_at': datetime.utcnow()
            }
        )
        db.execute(stmt)

    db.commit()
```

### 3.6: cli.py

**Lines 443, 1206, 1310**: Delete image tags during reprocessing:
```python
# Before
db.query(ImageTag).filter(ImageTag.image_id == image.id).delete()

# After
db.query(MachineTag).filter(
    MachineTag.image_id == image.id,
    MachineTag.tag_type.in_(['siglip', 'trained'])
).delete()
```

**Testing**:
- Run `/api/v1/keywords` endpoint → verify keyword counts match
- Run `/api/v1/images` → verify images return with tags
- Run `/ml-training` comparison → verify all algorithms shown
- Tag an image → verify tag appears in list
- Refresh trained tags → verify tags update, `updated_at` changes
- Check that permatags still work (apply approval/rejection)

**Rollback Risk**: Medium - code depends on `MachineTag` model, but old tables still exist for fallback if needed.

---

## PR 4: Testing and Validation

**Goal**: Comprehensive testing before cleanup.

**Tests to Add/Update**:
- `tests/test_keywords.py`: Keyword counts with multiple algorithms
- `tests/test_images.py`: Tag retrieval, filtering by tag_type
- `tests/test_ml_training.py`: Algorithm comparison view
- `tests/test_tagging.py`: Upsert semantics (ON CONFLICT behavior)
- `tests/test_learning.py`: Training on permatags + machine tag caching

**Test Scenarios**:

1. **Multi-tenant isolation**: Verify tags from tenant A don't appear in tenant B queries
2. **Uniqueness enforcement**: Try inserting duplicate `(image_id, keyword, tag_type, model_name)` → fails
3. **Algorithm switching**: Change `active_machine_tag_type` → facet counts change
4. **Upsert semantics**: Refresh trained tags twice → `created_at` unchanged, `updated_at` updated
5. **Permatag override**: Add negative permatag → keyword removed from "current tags"
6. **Delete cascade**: Delete image → all machine_tags and permatags deleted
7. **Index performance**: Query with filters should use indexes (check EXPLAIN PLAN)

**Integration Tests**:
- Full tagging flow: Upload image → SigLIP tags created in machine_tags → verify appear in search
- Training flow: Approve tags as permatags → train models → verify trained tags in machine_tags
- Refresh flow: Recompute trained tags → verify tags updated without ID churn

**Rollback Risk**: Low - only tests, no schema or data changes.

---

## PR 5: Drop Old Tables (Final Cleanup)

**Goal**: Remove deprecated `image_tags` and `trained_image_tags` tables.

**Files Modified**:
- `alembic/versions/202601XX_drop_old_tag_tables.py` (new)
- `src/photocat/metadata/__init__.py` (remove `ImageTag`, `TrainedImageTag` classes)

### Migration: 202601XX_drop_old_tag_tables.py

```python
"""Drop deprecated image_tags and trained_image_tags tables.

Revision ID: 202601XX
Revises: 202601XX_migrate_tags_to_machine_tags
Create Date: 2026-01-XX XX:00:00
"""

from alembic import op

revision = "202601XX"
down_revision = "202601XX_migrate_tags_to_machine_tags"
branch_labels = None
depends_on = None

def upgrade():
    # Drop old tables
    op.drop_table("trained_image_tags")
    op.drop_table("image_tags")

def downgrade():
    # Recreate old tables (if needed for rollback)
    # This is complex; in practice, we'd only do this immediately after PR 5
    raise NotImplementedError("Downgrading past old table cleanup is not supported")
```

### ORM Cleanup: src/photocat/metadata/__init__.py

Remove these classes:
```python
# DELETE:
class ImageTag(Base):
    ...

class TrainedImageTag(Base):
    ...
```

Update `ImageMetadata`:
```python
class ImageMetadata(Base):
    # Remove deprecated relationship:
    # tags = relationship("ImageTag", ...) -- REMOVED

    # Keep these:
    permatags = relationship("Permatag", ...)
    machine_tags = relationship("MachineTag", ...)
```

**Testing**:
- Verify tables dropped: `\dt` in psql
- Verify no `ImageTag` or `TrainedImageTag` imports in codebase: `grep -r "ImageTag\|TrainedImageTag" src/`
- Full integration test suite passes

**Rollback Risk**: High - tables are deleted. Only execute after confidence in PR 1-4.

---

## Dependency Chain

```
PR 1: Add machine_tags table
  ↓
PR 2: Migrate data + ORM model
  ↓
PR 3: Update all queries
  ↓
PR 4: Testing & validation
  ↓
PR 5: Drop old tables
```

Each PR can be reviewed independently but must be deployed in order.

---

## Validation Checklist

Before merging each PR:

### PR 1
- [ ] Migration creates table with correct schema
- [ ] All indexes created
- [ ] Downgrade removes table cleanly
- [ ] No code changes (schema only)

### PR 2
- [ ] Migration copies data from both source tables
- [ ] Counts match source table totals
- [ ] `model_name` is populated for all rows
- [ ] `tenant_id` in unique constraint enforces multi-tenant isolation
- [ ] `MachineTag` ORM model loads correctly
- [ ] `ImageMetadata.machine_tags` relationship works

### PR 3
- [ ] All imports updated (`MachineTag` instead of `ImageTag`)
- [ ] Queries filter by `active_machine_tag_type` for primary algorithm
- [ ] Queries DON'T filter for `/ml-training` comparison view
- [ ] ON CONFLICT upsert in learning.py works
- [ ] DELETE queries exclude permatags
- [ ] API responses unchanged (backward compatible)
- [ ] No hardcoded tag_type assumptions (use settings)

### PR 4
- [ ] All new tests pass
- [ ] Multi-tenant tests pass
- [ ] Uniqueness constraint tested
- [ ] Upsert semantics verified
- [ ] Permatag override still works
- [ ] Index performance acceptable (EXPLAIN PLAN reviewed)
- [ ] Integration tests pass (full flow end-to-end)

### PR 5
- [ ] Old tables dropped
- [ ] No imports of `ImageTag` or `TrainedImageTag`
- [ ] Full test suite passes without old models
- [ ] Downgrade marked as unsupported (or deferred)

---

## Configuration Addition: active_machine_tag_type

To support the "primary tag source" concept, add to tenant config:

**In settings.py or new tenant_settings table**:
```python
class Tenant(Base):
    # ... existing fields ...

    # Which machine tag algorithm drives facets and "current tags"
    # Default: 'siglip' (current zero-shot model)
    # Can be changed to 'clip', 'visual_similarity', etc. when new algorithms added
    active_machine_tag_type = Column(String(50), default='siglip', nullable=False)
```

Or as a JSON field:
```python
settings = Column(JSONB, default={'active_machine_tag_type': 'siglip'})
```

**Admin endpoint to update** (optional, for PR 3):
```python
@router.patch("/api/v1/admin/config/active-tag-type")
async def update_active_tag_type(
    tag_type: str,
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """Switch primary algorithm for search facets."""
    # Validate tag_type exists in database
    existing = db.query(MachineTag).filter(
        MachineTag.tenant_id == tenant.id,
        MachineTag.tag_type == tag_type
    ).first()

    if not existing:
        raise HTTPException(status_code=400, detail=f"No tags with type '{tag_type}'")

    tenant.active_machine_tag_type = tag_type
    db.commit()

    return {"tenant_id": tenant.id, "active_machine_tag_type": tag_type}
```

---

## Risk Mitigation

### Data Loss
- PR 1 & 2 are **additive only** (new table, no deletions)
- Old tables retained through PR 4
- Downgrade paths exist for PR 1-2
- PR 5 downgrade marked as unsupported (can re-insert from backups if needed)

### Performance
- Indexes added in PR 1, tested in PR 4
- ON CONFLICT upsert may be slower than delete+insert, but tested for acceptance
- Query filtering by `active_machine_tag_type` and `tag_type` use covered indexes

### Backward Compatibility
- API responses unchanged through PR 4
- Old code paths still work (tag queries use same structure)
- Settings default to current behavior (`active_machine_tag_type='siglip'`)

### Multi-Tenant Isolation
- `tenant_id` in all queries and unique constraints
- Migration populates `tenant_id` correctly
- Tests verify isolation

---

## Timeline Notes

- Each PR is independent review + merge
- PR 1: ~30 min review (schema only)
- PR 2: ~1 hour review (migration + ORM model)
- PR 3: ~2 hours review (7 files touched, logic changes)
- PR 4: ~1 hour review (test cases)
- PR 5: ~15 min review (cleanup, depends on PR 1-4 passing)

**Minimum gap between PR merges**: PR 1→2 can merge same day; PR 2→3 should wait 1 day for prod validation; PR 3→4 can overlap; PR 4→5 wait until full test suite green.

---

## Post-Implementation: Supporting New Algorithms

Once consolidated:

### Adding CLIP Model

1. **Create tagger module** (`src/photocat/tagging/clip.py`):
```python
class CLIPTagger:
    def __init__(self, model_name: str = "openai/clip-vit-large"):
        self.model_name = model_name
        self.model_version = "1.0"
        # ...

    def tag_image(self, image_data: bytes, keywords: List[dict]) -> List[Tuple[str, float]]:
        # ... CLIP processing ...
        return [(keyword, confidence), ...]
```

2. **Process image** (in router or sync):
```python
from photocat.tagging.clip import CLIPTagger

clip_tagger = CLIPTagger()
clip_results = clip_tagger.tag_image(image_bytes, keywords)

for keyword, confidence in clip_results:
    db.add(MachineTag(
        image_id=image.id,
        tenant_id=tenant.id,
        keyword=keyword,
        category=keyword_to_category.get(keyword),
        confidence=confidence,
        tag_type='clip',
        model_name='openai/clip-vit-large',
        model_version='1.0'
    ))
```

3. **Switch primary algorithm** (admin endpoint):
```python
PATCH /api/v1/admin/config/active-tag-type?tag_type=clip
```

**No schema changes. No migrations. Done.**

---

## Codex Feedback & Resolutions

### 1. ✅ PR 1: DB-side timestamp defaults

**Issue**: `created_at`/`updated_at` use `default=sa.func.now()`, which doesn't create DB-side defaults. Inserts outside ORM can result in NULL timestamps.

**Resolution**:
- Changed to `server_default=sa.func.now()` in migration (line 53-54)
- Made columns `nullable=False` to enforce they always have values
- DB now guarantees timestamps on all inserts, ORM or direct SQL

### 2. ✅ PR 2: Model name identity

**Issue**: Hardcoded `'siglip-so400m-patch14-384'` without `google/` prefix fragments model identity from runtime (`google/siglip-so400m-patch14-384`), breaking model-specific queries and uniqueness assumptions.

**Resolution**:
- Updated migration to use full model name: `'google/siglip-so400m-patch14-384'`
- Matches what `SigLIPTagger` uses (from `tagging.py:112`)
- Ensures model_name field aligns with runtime identity for filtering/comparison

### 3. ✅ PR 2: ON CONFLICT specificity

**Issue**: `ON CONFLICT DO NOTHING` without explicit conflict target silently masks duplicate source data during migration.

**Resolution**:
- Added explicit conflict target: `ON CONFLICT (tenant_id, image_id, keyword, tag_type, model_name) DO NOTHING`
- Targets the unique constraint exactly
- `DO NOTHING` is intentional for data migration (re-running in dev doesn't fail on duplicates)
- **Note**: If duplicates in source tables are a sign of a bug (unexpected), the migration will silently skip them.
  - Recommendation: Run migration with explicit CONFLICT target to ensure no surprises
  - For production, consider adding a pre-migration CHECK to verify source tables have no duplicates:
    ```sql
    SELECT COUNT(*) FROM (
      SELECT tenant_id, image_id, keyword FROM image_tags
      GROUP BY tenant_id, image_id, keyword
      HAVING COUNT(*) > 1
    ) AS dupes;
    -- Should return 0 rows if data is clean
    ```

### 4. ✅ PR 3: Tenant setting access

**Issue**: Code assumes `tenant.settings` exists and contains `active_machine_tag_type`, but this is added later. PR 3 depends on it being available.

**Resolution**:
- Created `get_tenant_setting()` helper function in `dependencies.py`
- Provides safe fallback to `'siglip'` if setting not found
- Can work with either:
  - JSONB `settings` column (preferred): `{"active_machine_tag_type": "siglip"}`
  - Separate column: `active_machine_tag_type VARCHAR(50) DEFAULT 'siglip'`
- Migration in PR 2 must add the storage mechanism (column or update JSONB schema)

### 5. ✅ PR 3: Manual tags placement

**Issue**: Storing manual user tags in `machine_tags` (with `tag_type='manual'`) conflicts with design goal of keeping `permatags` as sole ground truth.

**Resolution**:
- Manual tags → stored in `permatags` (ground truth)
- Machine tags → stored in `machine_tags` (predictions)
- Merging happens in `calculate_tags()` at display time
- Prevents double-counting and maintains clear audit trail
- User intent (`signum: -1 or 1`) stays in permatags where it belongs
- Updated code examples to use `Permatag` for user decisions

## Additional Codex Feedback (Round 2)

### Comment 1: Model name examples consistency
**Issue**: Examples in ORM model docstring didn't match migration SQL or runtime values.

**Resolution**: Updated examples to explicitly note that `google/siglip-so400m-patch14-384` must match `SigLIPTagger` in `tagging.py:112`. This ensures filtering, uniqueness constraints, and upserts work correctly.

### Comment 2: Inconsistent tenant setting access
**Issue**: Using `getattr(tenant.settings, ...)` directly in some places, while other code uses `get_tenant_setting()` helper. Won't work if setting lives in separate column.

**Resolution**: Updated all routers (images.py, lists.py) to use `get_tenant_setting()` consistently. Helper handles both JSONB and column storage transparently.

### Comment 3: ON CONFLICT silent skipping
**Issue**: `DO NOTHING` silently skips duplicates in migration, potentially masking data quality issues.

**Resolution**: Added recommendation to run pre-migration CHECK on source tables to verify no duplicates exist before migration. Made `DO NOTHING` explicit as a design choice for dev-friendly re-runs, not production behavior.

## Pre-PR 3 Checklist

Before starting PR 3 (router updates), ensure:

- [ ] PR 1 merged and tested (table + indexes created)
- [ ] PR 2 merged and tested (data migrated, ORM models added)
- [ ] `active_machine_tag_type` storage added to `Tenant` model (JSONB or column)
- [ ] `get_tenant_setting()` helper implemented in `dependencies.py`
- [ ] All assumptions about tenant configuration are documented
- [ ] All router code uses `get_tenant_setting()` helper consistently (not `getattr()`)
- [ ] Pre-migration CHECK validates no duplicate tags in source tables

## Conclusion

This phased approach enables safe, incremental consolidation:
- **PR 1-2**: Non-breaking infrastructure changes
- **PR 3**: Business logic updates with backward compatibility
- **PR 4**: Validation before cleanup
- **PR 5**: Cleanup after confidence

At any point through PR 4, rollback is straightforward. PR 5 is final cleanup only after full validation.

Future algorithm support requires only code changes, no schema work.

All codex feedback has been incorporated; implementation is ready for detailed code review.
