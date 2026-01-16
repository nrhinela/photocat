# Tag Consolidation Architecture Design

## Overview

Currently, PhotoCat stores keyword assignments across three separate tables:
- `permatags` - User-verified tag decisions (ground truth)
- `image_tags` - General-purpose tag assignments
- `trained_image_tags` - Cached ML model outputs

This design proposes consolidating machine-generated tags into a single `machine_tags` table while keeping `permatags` independent, creating a sustainable architecture for supporting multiple tagging algorithms.

## Problem Statement

The current three-table approach creates friction when introducing new algorithms:
1. **Per-algorithm tables**: Each new tagging method (CLIP, visual similarity, facial recognition, etc.) requires a new database table
2. **Schema migrations**: Every algorithm addition triggers database migration + model changes
3. **Query duplication**: Keywords endpoint, images endpoint, and comparison logic all manually merge results from multiple tables
4. **Boilerplate code**: Each table gets its own ORM model, query patterns, and cleanup logic

Example: Adding CLIP model would currently require:
- New `ClipImageTag` table
- New migration
- New ORM model class
- Updated query logic in 3+ router endpoints

## Proposed Solution

### Two-Table Architecture

**Keep `permatags` unchanged** as the ground truth table for human-verified decisions.

**Consolidate `image_tags` + `trained_image_tags` → `machine_tags`** with algorithm metadata.

### Data Model

#### Permatag Table (Unchanged)

```python
class Permatag(Base):
    """Ground truth human-verified tag decisions."""

    __tablename__ = "permatags"

    id = Column(Integer, primary_key=True)
    image_id = Column(Integer, ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(255), nullable=False, index=True)

    keyword = Column(String(255), nullable=False, index=True)
    category = Column(String(255))  # Parent category from hierarchy

    # Binary decision: approved (+1) or rejected (-1)
    signum = Column(Integer, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(255))  # Optional: track who made decision

    # Relationships
    image = relationship("ImageMetadata", back_populates="permatags")

    __table_args__ = (
        Index("idx_permatag_tenant_image", "tenant_id", "image_id"),
        Index("idx_permatag_keyword", "keyword"),
    )
```

#### MachineTag Table (New)

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

    model_name = Column(String(100), nullable=False)  # e.g., 'siglip-so400m-patch14', 'clip-vit-large'
    # Default to tag_type if not specified; ensures uniqueness constraint is not bypassed by NULLs

    model_version = Column(String(50))  # Version of the model that generated this tag

    # Audit trail
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # updated_at tracks when tags are refreshed (used with ON CONFLICT upsert)

    # Relationships
    image = relationship("ImageMetadata", back_populates="machine_tags")

    __table_args__ = (
        # Per-image lookup with algorithm filter
        Index("idx_machine_tags_per_image", "tenant_id", "image_id", "tag_type"),

        # Faceted search: count images by keyword per algorithm
        Index("idx_machine_tags_facets", "tenant_id", "tag_type", "keyword"),

        # Prevent duplicate outputs from same algorithm for same image/keyword/model
        # Includes tenant_id to isolate multi-tenant uniqueness
        # model_name is non-null, so this constraint is never bypassed
        Index("idx_machine_tags_unique",
              "tenant_id", "image_id", "keyword", "tag_type", "model_name",
              unique=True),
    )
```

#### ImageMetadata Relationships (Updated)

```python
class ImageMetadata(Base):
    # ... existing fields ...

    # Relationships (updated)
    permatags = relationship("Permatag", back_populates="image", cascade="all, delete-orphan")
    machine_tags = relationship("MachineTag", back_populates="image", cascade="all, delete-orphan")
    # Note: 'tags' relationship will be removed (was for ImageTag)
```

## Migration Strategy

### Phase 1: Create New Table

Create `machine_tags` table with migration:

```python
# Migration: add_machine_tags_consolidation
def upgrade():
    op.create_table(
        "machine_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=False, index=True),
        sa.Column("keyword", sa.String(length=255), nullable=False, index=True),
        sa.Column("category", sa.String(length=255)),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("tag_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("model_name", sa.String(length=100)),
        sa.Column("model_version", sa.String(length=50)),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_index("idx_machine_tags_image_tenant", "machine_tags", ["image_id", "tenant_id"])
    op.create_index("idx_machine_tags_tenant_keyword", "machine_tags", ["tenant_id", "keyword"])
    op.create_index("idx_machine_tags_type_model", "machine_tags", ["tag_type", "model_name"])
    op.create_index("idx_machine_tags_unique", "machine_tags",
                   ["image_id", "keyword", "tag_type", "model_name"], unique=True)
```

### Phase 2: Data Migration

Migrate existing data in a second migration. **Important**: Populate `model_name` for both sources to ensure uniqueness constraint is not bypassed.

```python
def upgrade():
    # Copy from image_tags (preserve as 'siglip' since that's current zero-shot model)
    # Use a known model name to avoid NULL uniqueness bypass
    op.execute("""
        INSERT INTO machine_tags
            (image_id, tenant_id, keyword, category, confidence, tag_type, model_name, created_at, updated_at)
        SELECT
            image_id, tenant_id, keyword, category, COALESCE(confidence, 0.0),
            'siglip',
            'siglip-so400m-patch14',  -- Current known model; adjust if different
            created_at,
            NOW()
        FROM image_tags
    """)

    # Copy from trained_image_tags (preserve as 'trained')
    # Keep existing model_name if present; default to tag_type if null
    op.execute("""
        INSERT INTO machine_tags
            (image_id, tenant_id, keyword, category, confidence, tag_type, model_name, model_version, created_at, updated_at)
        SELECT
            image_id, tenant_id, keyword, category, COALESCE(confidence, 0.0),
            'trained',
            COALESCE(model_name, 'trained'),  -- Fallback to 'trained' if model_name is null
            model_version,
            created_at,
            NOW()
        FROM trained_image_tags
    """)
```

### Phase 3: Code Updates

Update ORM models and queries to use new table.

### Phase 4: Drop Old Tables

Once code is fully migrated and tested, drop `image_tags` and `trained_image_tags` in a final migration.

## Key Design Decisions

### Primary Tag Source for Search and Display

With multiple algorithms in one table, we must define which `tag_type` drives:
- Keyword dropdown counts and faceting
- `calculate_tags()` baseline
- Search result relevance

**Decision**: Introduce a tenant-level configuration:

```python
# In settings.py or tenant config table
class TenantSettings(Base):
    tenant_id = Column(String(255), primary_key=True)
    # Which machine tag algorithm to use for search facets and "current tags"
    active_machine_tag_type = Column(String(50), default='siglip')
```

Then filter consistently in queries:

```python
# Keywords endpoint (keywords.py)
active_tags = db.query(MachineTag).filter(
    MachineTag.tenant_id == tenant.id,
    MachineTag.tag_type == tenant.settings.active_machine_tag_type  # Use primary source
).all()
```

This allows:
- Switching primary algorithm (e.g., from SigLIP to CLIP) via config, not code
- Still displaying all algorithms in comparison view
- Clear semantics about which tags drive facet counts

### Tag Refresh Semantics (Upsert)

When recomputing tags for an algorithm (e.g., refreshing trained models), use PostgreSQL `ON CONFLICT` to update existing tags rather than delete+insert:

```python
from sqlalchemy.dialects.postgresql import insert

for tag in new_tags:
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
```

**Benefits**:
- `created_at` is preserved (tag age not reset on refresh)
- `updated_at` tracks when tag was last refreshed
- Avoids churn in database (same tags don't get new IDs)
- Other algorithms' tags are not affected

## Query Pattern Changes

### Before: Multiple Table Queries

```python
# Keyword endpoint (keywords.py:103-112)
all_tags = db.query(ImageTag).filter(
    ImageTag.tenant_id == tenant.id,
    ImageTag.image_id.in_(effective_images)
).all()

all_permatags = db.query(Permatag).filter(
    Permatag.tenant_id == tenant.id,
    Permatag.image_id.in_(effective_images)
).all()

# ML training endpoint (images.py:619-622)
cached_trained = db.query(TrainedImageTag).filter(
    TrainedImageTag.tenant_id == tenant.id,
    TrainedImageTag.image_id.in_(image_ids)
).all()
```

### After: Unified Machine Tag Query

```python
# Single query for all algorithm outputs
all_machine_tags = db.query(MachineTag).filter(
    MachineTag.tenant_id == tenant.id,
    MachineTag.image_id.in_(effective_images)
).all()

# Permatags still queried separately (unchanged)
all_permatags = db.query(Permatag).filter(
    Permatag.tenant_id == tenant.id,
    Permatag.image_id.in_(effective_images)
).all()

# Filter by algorithm type as needed in application logic
siglip_tags = [t for t in all_machine_tags if t.tag_type == 'siglip']
trained_tags = [t for t in all_machine_tags if t.tag_type == 'trained']
```

## Code Impact Analysis

### No Changes Required

- **learning.py** (tagging algorithms):
  - `build_keyword_models()` - queries only `Permatag`, unaffected
  - `ensure_image_embedding()` - no tag queries, unaffected
  - `recompute_trained_tags_for_image()` - will insert into `machine_tags` instead of `trained_image_tags`, but same logic

- **tagging.py** (tag calculation):
  - `calculate_tags()` - function signature unchanged, still receives machine_tags + permatags lists

### Minimal Changes Required

- **routers/keywords.py**:
  - Change `db.query(ImageTag)` → `db.query(MachineTag)`
  - Change `db.query(TrainedImageTag)` → remove (now in MachineTag query)
  - Logic for merging tags with permatag overrides unchanged

- **routers/images.py**:
  - Change three separate table queries → single MachineTag query
  - Change tag reorganization logic (tags_by_image, trained_by_image, etc.) to filter by tag_type
  - No changes to endpoint responses or business logic

- **routers/lists.py**:
  - Same pattern as keywords.py

- **routers/sync.py**:
  - Change `db.query(ImageTag).delete()` → `db.query(MachineTag).delete()` when resetting tags for reprocessing

- **cli.py**:
  - Change `db.query(ImageTag).filter(...).delete()` → `db.query(MachineTag).filter(...).delete()`

### Metadata Model Updates

- **metadata/__init__.py**:
  - Add `MachineTag` class (new)
  - Update `ImageMetadata` relationship from `tags` → `machine_tags`
  - Keep `Permatag` class unchanged

## Adding New Algorithms

With this design, adding a new tagging algorithm becomes straightforward:

### Example: Add CLIP Model

```python
# In tagging.py or new clip_tagger.py
def tag_image_with_clip(image_data: bytes, keywords: List[dict]) -> List[Tuple[str, float]]:
    # ... CLIP processing ...
    return [(keyword, confidence), ...]

# In routers/images.py or sync.py (wherever images are processed)
clip_results = tag_image_with_clip(image_bytes, candidate_keywords)

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

db.commit()
```

No schema changes. No migrations. Just insert with new `tag_type`.

### Example: Query All CLIP Tags for Image

```python
clip_tags = db.query(MachineTag).filter(
    MachineTag.image_id == image_id,
    MachineTag.tag_type == 'clip'
).all()
```

### Example: Update Model Version

```python
# Refresh all 'clip' tags with new model version
db.query(MachineTag).filter(
    MachineTag.tenant_id == tenant.id,
    MachineTag.tag_type == 'clip'
).delete()

# Re-tag all images with new CLIP model...
```

## Benefits

### Scalability
- Add new algorithms without schema changes
- No per-algorithm boilerplate (models, migrations, queries)
- Tag type acts as algorithm registry

### Clarity
- Permatags remain the authoritative "ground truth" table
- Clear separation: human decisions vs. algorithm outputs
- No confusing NULL fields for algorithm-specific data in permatags

### Backward Compatibility
- Existing training workflows unchanged
- Tag calculation logic (`calculate_tags()`) unchanged
- Permatag API endpoints unchanged

### Query Flexibility
- Single query gets all algorithm outputs
- Filter by `tag_type` for algorithm-specific operations
- Easy to compare algorithm outputs for the same image

### Maintainability
- Fewer code paths to maintain (2 table patterns instead of 3)
- Clearer data model semantics
- Reduced duplication in query logic

## Open Questions / Future Considerations

1. **Algorithm comparison endpoint**: Should we add `/api/v1/images/{id}/algorithm-comparison` to visualize outputs from all algorithms for a single image?

2. **Tag confidence thresholds**: Should `machine_tags` confidence filtering (e.g., only show tags > 0.25) be configurable per tag_type?

3. **Model deprecation**: When a model version becomes outdated, should we archive old tags or regenerate them? Consider adding `deprecated` flag to MachineTag?

4. **Permatag influence on training**: Should negatively permatags explicitly exclude images from positive centroids in `build_keyword_models()`? (Current behavior may be unclear.)

## Reviewer Feedback & Resolutions

### 1. ✅ Uniqueness + Tenant Scope

**Issue**: Proposed unique index lacks `tenant_id` and has nullable `model_name`, allowing duplicates in Postgres.

**Resolution**:
- Made `model_name` non-nullable (defaults to tag_type algorithm name)
- Added `tenant_id` to unique constraint
- Updated index: `(tenant_id, image_id, keyword, tag_type, model_name)`

### 2. ✅ Primary Tag Source for Search & Display

**Issue**: With multiple algorithms in one table, ambiguous which `tag_type` drives facets and `calculate_tags()`.

**Resolution**:
- Introduced tenant-level `active_machine_tag_type` setting (default: `siglip`)
- All queries filter by this setting when computing "current tags"
- Allows algorithm switching via config without code changes
- See "Primary Tag Source for Search and Display" section above.

### 3. ✅ Migration Fidelity for Legacy Tags

**Issue**: Migration leaves `model_name`/`model_version` null for `image_tags`, violating non-null constraint and causing uniqueness bypass.

**Resolution**:
- Populate `model_name` for `image_tags` with known current model (`siglip-so400m-patch14`)
- For `trained_image_tags`, keep existing `model_name` or default to `'trained'` if null
- Updated migration SQL in Phase 2 section above.

### 4. ✅ Indexes for Common Filters

**Issue**: Queries filter by `(tenant_id, tag_type, keyword)` for facets or `(tenant_id, image_id, tag_type)` per-image, but indexes don't cover these combinations.

**Resolution**:
- Added `idx_machine_tags_facets` on `(tenant_id, tag_type, keyword)` for dropdown counts
- Added `idx_machine_tags_per_image` on `(tenant_id, image_id, tag_type)` for per-image filtering
- Dropped old partial indexes that didn't include all filter columns.

### 5. ✅ Replace vs Upsert Semantics

**Issue**: Delete+insert on recompute loses `created_at` semantics and creates database churn.

**Resolution**:
- Use PostgreSQL `ON CONFLICT ... DO UPDATE` for refreshes
- Preserve `created_at` (tag origin date)
- Add `updated_at` to track refresh timestamp
- See "Tag Refresh Semantics (Upsert)" section above for implementation.

## Implementation Timeline

1. **PR 1**: Add `machine_tags` table via migration (no code changes yet)
2. **PR 2**: Migrate `image_tags` + `trained_image_tags` data to `machine_tags`, update ORM models
3. **PR 3**: Update router queries to use `MachineTag` instead of `ImageTag` + `TrainedImageTag`
4. **PR 4**: Testing and validation
5. **PR 5**: Drop old `image_tags` and `trained_image_tags` tables (cleanup migration)

This allows for staged rollout and easy rollback if issues arise.

## Conclusion

Consolidating machine-generated tags into a single table with algorithm metadata provides a clean, scalable architecture for supporting multiple tagging algorithms while maintaining the clarity and integrity of human-verified decisions in the separate `permatags` table.
