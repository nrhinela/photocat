# MIGRATION3 Phase 2: Backend Refactoring - Implementation Plan

**Status**: Ready to Start
**Scope**: CLI decomposition, query optimization, endpoint refactoring
**Timeline**: 5-7 days
**Expected Impact**: 60% reduction in largest files, 3-4x query performance improvement

---

## Overview

Phase 2 decomposes two monolithic backend files and optimizes database query patterns:

### Large Files to Address

| File | Lines | Problem |
|------|-------|---------|
| `src/photocat/cli.py` | 1,042 | 8 commands all in one file; difficult to maintain/test |
| `src/photocat/routers/images/core.py` | 724 | 7 different filtering paths, N+1 queries |
| `src/photocat/routers/filtering.py` | 460 | Materialized sets loading 100k+ IDs into memory |

### Deliverables

- ✅ CLI split into 8 command modules (~100 LOC each)
- ✅ Query builder pattern for unified image filtering
- ✅ Database query optimization (subqueries vs materialized sets)
- ✅ Backward compatibility maintained throughout
- ✅ Test strategy for equivalence validation

---

## Task 2.1: CLI Decomposition (2 Days)

### Goal
Split 1,042-line `cli.py` into 8 focused command modules using command pattern.

### Current Structure
```
cli.py (1,042 lines)
├── ingest() - lines ~46-130
├── refresh_metadata() - lines ~150-400
├── build_embeddings() - lines ~466-511
├── train_keyword_models() - lines ~513-538
├── recompute_trained_tags() - lines ~540-646
├── list_images() - lines ~648-665
├── show_config() - lines ~667-695
├── retag() - lines ~698-817
└── sync_dropbox() - lines ~820-1039
```

### Target Structure
```
src/photocat/cli/
├── __init__.py              # Entry point with command group
├── base.py                  # Base command class (NEW)
├── commands/
│   ├── __init__.py
│   ├── ingest.py            # Ingest logic (100 LOC)
│   ├── metadata.py          # Metadata refresh (150 LOC)
│   ├── embeddings.py        # Embedding logic (100 LOC)
│   ├── training.py          # Training + recompute (200 LOC)
│   ├── tagging.py           # Retagging logic (150 LOC)
│   ├── sync.py              # Dropbox sync (250 LOC)
│   └── inspect.py           # List/show commands (100 LOC)
└── utils/
    ├── __init__.py
    └── progress.py          # Shared progress tracking (NEW)
```

### Implementation Steps

#### Step 1: Create Base Command Class (`cli/base.py`)

```python
"""Base command class for shared setup/teardown."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from photocat.settings import settings

class CliCommand:
    """Base class for all CLI commands."""

    def __init__(self):
        self.engine = None
        self.Session = None
        self.db = None

    def setup_db(self):
        """Initialize database connection."""
        self.engine = create_engine(settings.database_url)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def cleanup_db(self):
        """Close database connection."""
        if self.db:
            self.db.close()

    def run(self):
        """Execute command - override in subclasses."""
        raise NotImplementedError

    def __enter__(self):
        self.setup_db()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup_db()
```

#### Step 2: Create Individual Command Modules

Each module follows this pattern:

```python
# cli/commands/ingest.py
"""Image ingestion command."""

import click
from .base import CliCommand

@click.command(name='ingest')
@click.argument('directory', type=click.Path(exists=True))
@click.option('--tenant-id', default='demo')
@click.option('--recursive/--no-recursive', default=True)
def ingest_command(directory: str, tenant_id: str, recursive: bool):
    """Ingest images from local directory."""
    cmd = IngestCommand(directory, tenant_id, recursive)
    cmd.run()

class IngestCommand(CliCommand):
    def __init__(self, directory, tenant_id, recursive):
        super().__init__()
        self.directory = directory
        self.tenant_id = tenant_id
        self.recursive = recursive

    def run(self):
        self.setup_db()
        try:
            # Move ingest() logic here from cli.py:46-130
            self._ingest_images()
        finally:
            self.cleanup_db()

    def _ingest_images(self):
        # Implementation from original cli.py
        pass
```

#### Step 3: Update Main CLI Entry Point (`cli/__init__.py`)

```python
"""PhotoCat CLI entry point with command registration."""

import click
from .commands import ingest, metadata, embeddings, training, tagging, sync, inspect

@click.group()
def cli():
    """PhotoCat CLI for local development and testing."""
    pass

# Register commands (names must match existing CLI for backward compatibility)
cli.add_command(ingest.ingest_command, name='ingest')
cli.add_command(metadata.refresh_metadata_command, name='refresh-metadata')
cli.add_command(embeddings.build_embeddings_command, name='build-embeddings')
cli.add_command(training.train_keyword_models_command, name='train-keyword-models')
cli.add_command(training.recompute_trained_tags_command, name='recompute-trained-tags')
cli.add_command(tagging.retag_command, name='retag')
cli.add_command(sync.sync_dropbox_command, name='sync-dropbox')
cli.add_command(inspect.list_images_command, name='list-images')
cli.add_command(inspect.show_config_command, name='show-config')

if __name__ == '__main__':
    cli()
```

#### Step 4: Update `pyproject.toml` Entry Point

```toml
[project.scripts]
photocat = "photocat.cli:cli"  # Updated from photocat.cli:cli_group
```

### Files to Create/Modify

| File | Action | Status |
|------|--------|--------|
| `src/photocat/cli/` | NEW directory | - |
| `src/photocat/cli/__init__.py` | Create entry point | - |
| `src/photocat/cli/base.py` | Create base class | - |
| `src/photocat/cli/commands/__init__.py` | Create package | - |
| `src/photocat/cli/commands/ingest.py` | Extract logic | - |
| `src/photocat/cli/commands/metadata.py` | Extract logic | - |
| `src/photocat/cli/commands/embeddings.py` | Extract logic | - |
| `src/photocat/cli/commands/training.py` | Extract logic | - |
| `src/photocat/cli/commands/tagging.py` | Extract logic | - |
| `src/photocat/cli/commands/sync.py` | Extract logic | - |
| `src/photocat/cli/commands/inspect.py` | Extract logic | - |
| `src/photocat/cli/utils/__init__.py` | Create package | - |
| `src/photocat/cli/utils/progress.py` | Extract shared logic | - |
| `src/photocat/cli.py` | Delete (after extraction) | - |
| `pyproject.toml` | Update entry point | - |

### Verification Checklist

- [ ] Each command file ~100-250 LOC
- [ ] Base command class handles DB setup/teardown
- [ ] All original imports preserved in new modules
- [ ] Command names unchanged (backward compatible)
- [ ] `photocat ingest --help` works
- [ ] `photocat sync-dropbox --help` works
- [ ] All commands still functional with same parameters

---

## Task 2.2: Query Performance Optimization (2 Days)

### Goal
Replace materialized ID sets with SQLAlchemy subqueries to reduce memory usage and query count.

### Current Problem: Materialized Sets

`src/photocat/routers/filtering.py` (460 lines) loads entire result sets into Python:

```python
# INEFFICIENT - materializes 100k+ IDs into Python memory
def apply_list_filter(db, tenant, list_id, existing_filter=None):
    rows = db.query(PhotoListItem.image_id).filter(
        PhotoListItem.tenant_id == tenant.id,
        PhotoListItem.list_id == list_id
    ).all()

    result_ids = {row[0] for row in rows}  # ← 100k+ item set in memory

    if existing_filter is None:
        return result_ids
    return existing_filter.intersection(result_ids)
```

For large tenants with multiple filters:
- Filter 1 loads: 50k IDs → ~1.5 MB memory
- Filter 2 loads: 30k IDs → ~900 KB memory
- Filter 3 loads: 20k IDs → ~600 KB memory
- **Total**: 3.0+ MB just for ID sets + intersection operations in Python

### Solution: Use SQLAlchemy Subqueries

```python
# EFFICIENT - uses SQL subqueries (database handles intersection)
def apply_list_filter(db, tenant, list_id):
    """Return SQLAlchemy subquery (not materialized set)."""
    return db.query(PhotoListItem.image_id).filter(
        PhotoListItem.tenant_id == tenant.id,
        PhotoListItem.list_id == list_id
    ).subquery()

def apply_multiple_filters(db, tenant, criteria):
    """Combine filters using SQL logic."""
    query = db.query(ImageMetadata.id).filter(
        ImageMetadata.tenant_id == tenant.id
    )

    if 'list_id' in criteria:
        list_subquery = apply_list_filter(db, tenant, criteria['list_id'])
        query = query.filter(ImageMetadata.id.in_(list_subquery))

    if 'keywords' in criteria:
        kw_subquery = apply_keyword_filter(db, tenant, criteria['keywords'])
        query = query.filter(ImageMetadata.id.in_(kw_subquery))

    # Single query executes at database - no intermediate materialization
    return query
```

### Files to Modify

| File | Lines | Action |
|------|-------|--------|
| `src/photocat/routers/filtering.py` | 460 | Replace all `apply_*_filter()` to return subqueries |
| `src/photocat/routers/images/core.py` | 724 | Update `list_images()` to use subquery results |

### Implementation Approach

1. **Create helper in `filtering.py`**:
   ```python
   def create_image_subquery(db, tenant_id, criteria):
       """Build unified query with all filters as subqueries."""
       subquery = db.query(ImageMetadata.id).filter(...)
       return subquery
   ```

2. **Update filter functions**:
   - Change return type: `Set[int]` → `InstrumentedAttribute` (SQLAlchemy subquery)
   - No longer materialize in Python
   - Database handles the intersection

3. **Test with equivalence**:
   ```python
   # Old way (materialized)
   old_ids = old_apply_filters(db, tenant, criteria)

   # New way (subquery)
   new_query = new_apply_filters(db, tenant, criteria)
   new_ids = {row[0] for row in new_query.all()}

   assert old_ids == new_ids  # Same results
   ```

### Performance Expectation

- Memory: 3.0 MB → ~100 KB (3000x reduction for large tenant)
- Query count: 5+ queries → 1-2 queries (combined with subqueries)
- Time: Depends on index coverage; with proper indexes, 5-10x faster

---

## Task 2.3: Refactor list_images Endpoint (1.5 Days)

### Goal
Replace 724-line `images/core.py` with query builder pattern and eliminate duplicate filter logic.

### Current Problem: 7 Different Filtering Paths

```python
# images/core.py:37-523 contains 7 independent filtering paths:

# Path 1: Category filters (lines 105-223)
if category_filters:
    # Complex nested logic with keyword loading

# Path 2: Legacy keyword filters OR (lines 233-298)
elif keywords and keyword_operator == 'OR':
    # Different query building logic

# Path 3: Legacy keyword filters AND (lines 300-366)
elif keywords and keyword_operator == 'AND':
    # Yet another variant

# Path 4: Default no filters (lines 375-412)
else:
    # Fourth version of similar logic

# Repeat for each: response building, keyword loading, tag aggregation
```

Each path rebuilds `query`, `keywords_map`, response formatting independently.

### Solution: Query Builder Pattern

Create `src/photocat/routers/images/query_builder.py`:

```python
"""Unified query builder for image filtering."""

from sqlalchemy import and_, or_
from photocat.metadata import ImageMetadata, MachineTag, Permatag
from photocat.models.config import Keyword

class ImageQueryBuilder:
    """Build complex image queries with fluent interface."""

    def __init__(self, db, tenant_id):
        self.db = db
        self.tenant_id = tenant_id
        self.query = db.query(ImageMetadata).filter(
            ImageMetadata.tenant_id == tenant_id
        )
        self._filters_applied = []

    def add_category_filter(self, category_filters):
        """Add category filter with category-specific operators."""
        # Logic from current lines 105-223
        pass

    def add_keyword_filter(self, keywords, operator='AND'):
        """Add keyword filter with AND/OR logic."""
        # Logic from current lines 233-366
        pass

    def add_list_filter(self, list_id):
        """Add list membership filter."""
        # Logic from current lists filtering
        pass

    def add_rating_filter(self, min_rating=None, max_rating=None, operator='gte'):
        """Add rating range filter."""
        if min_rating:
            self.query = self.query.filter(ImageMetadata.rating >= min_rating)
        if max_rating:
            self.query = self.query.filter(ImageMetadata.rating <= max_rating)
        return self

    def add_reviewed_filter(self, reviewed):
        """Filter by review status."""
        if reviewed is not None:
            self.query = self.query.filter(ImageMetadata.reviewed == reviewed)
        return self

    def add_permatag_filters(self, keyword, category, signum, missing):
        """Filter by permatag properties."""
        # Logic from current permatag filtering
        pass

    def add_ml_tag_filters(self, keyword, tag_type):
        """Filter by ML tag properties."""
        # Logic from current ML tag filtering
        pass

    def add_ordering(self, order_by='date', direction='desc'):
        """Add order by clause."""
        if order_by == 'relevance':
            self.query = self.query.order_by(...)
        elif order_by == 'date':
            self.query = self.query.order_by(
                ImageMetadata.created_at.desc() if direction == 'desc'
                else ImageMetadata.created_at.asc()
            )
        return self

    def build(self):
        """Return final query."""
        return self.query
```

### Refactored list_images Endpoint

Replace 724-line function with:

```python
@router.get("/images")
async def list_images(
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
    # ... all parameters ...
):
    """List images with unified filtering."""

    # Build query using builder
    builder = ImageQueryBuilder(db, tenant.id)

    if category_filters:
        builder.add_category_filter(category_filters)

    if keywords:
        builder.add_keyword_filter(keywords, keyword_operator)

    if list_id:
        builder.add_list_filter(list_id)

    if min_rating or max_rating:
        builder.add_rating_filter(min_rating, max_rating)

    if reviewed is not None:
        builder.add_reviewed_filter(reviewed)

    if permatag_keyword or permatag_category or permatag_signum is not None:
        builder.add_permatag_filters(
            permatag_keyword, permatag_category,
            permatag_signum, permatag_missing
        )

    if ml_keyword or ml_tag_type:
        builder.add_ml_tag_filters(ml_keyword, ml_tag_type)

    builder.add_ordering(order_by, date_order)

    # Execute query
    query = builder.build()
    total = query.count()
    images = query.offset(offset).limit(limit).all()

    # Load keywords once for all images
    from photocat.config.db_utils import load_keywords_map
    keyword_ids = extract_keyword_ids(images)
    keywords_map = load_keywords_map(db, tenant.id, keyword_ids)

    # Build response
    return {
        "total": total,
        "images": format_image_response(images, keywords_map, ...),
        "tags": aggregate_tags(images, keywords_map)
    }
```

### Files to Create/Modify

| File | Lines | Action |
|------|-------|--------|
| `src/photocat/routers/images/query_builder.py` | NEW (~300) | Create query builder class |
| `src/photocat/routers/images/core.py` | 724 | Refactor list_images to use builder |

### Critical Testing Requirements

Test equivalence between old and new implementations:

```python
def test_list_images_equivalence():
    """Verify new query builder produces identical results."""

    # Same query with old code
    old_results = old_list_images(db, tenant, category_filters={...})

    # Same query with new code
    new_results = new_list_images(db, tenant, category_filters={...})

    # Validate
    assert old_results['total'] == new_results['total']
    assert len(old_results['images']) == len(new_results['images'])

    # Check ordering matches
    old_ids = [img['id'] for img in old_results['images']]
    new_ids = [img['id'] for img in new_results['images']]
    assert old_ids == new_ids
```

---

## Integration & Testing Strategy

### Backward Compatibility

All changes maintain backward compatibility:
- CLI command names unchanged
- API endpoints signatures unchanged
- Response formats identical
- Database schema unchanged

### Testing Plan

1. **CLI Refactoring**:
   - Unit tests for each command class
   - Integration test: `photocat <command> --help` works
   - Functional test: Run each command with demo data

2. **Query Optimization**:
   - Equivalence test: Old vs new filter results
   - Performance benchmark: Query time + memory usage
   - Edge cases: Empty filters, missing categories, zero ratings

3. **Endpoint Refactoring**:
   - Equivalence test: Same input → same output
   - Ordering preservation: Relevance/date ordering unchanged
   - Pagination: Total count accurate

### Success Metrics

- [ ] All Phase 2 tasks complete within 5-7 days
- [ ] CLI files: 1,042 lines → 7-8 files of 100-250 LOC each
- [ ] Query performance: 5-10x faster for large tenants (with proper indexes)
- [ ] Memory usage: 3000x reduction in filter set materialization
- [ ] Test coverage: All critical paths have equivalence tests
- [ ] Backward compatibility: All existing commands/endpoints work identically

---

## Deferred Items (Phase 3+)

- Frontend API modularization (Phase 1.2)
- Frontend component refactoring to Lit
- Frontend state management architecture
- Authentication system redesign

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Query builder bugs introduce data loss | Comprehensive equivalence tests before/after |
| CLI refactor breaks deployment | Maintain entry point compatibility in pyproject.toml |
| Performance regression | Benchmark with real data; add indexes if needed |
| Complex filter edge cases | Test 7+ filter combinations systematically |

---

## Next Steps

1. ✅ Phase 1 committed (3 utility files + docs)
2. → **Phase 2.1**: CLI decomposition (start with base.py + 1 command)
3. → **Phase 2.2**: Query optimization (refactor filtering.py subqueries)
4. → **Phase 2.3**: Endpoint refactoring (query_builder.py + list_images)
5. → **Verification**: Run full test suite, benchmark performance
6. → **Deployment**: Merge to main after Phase 2 validation
