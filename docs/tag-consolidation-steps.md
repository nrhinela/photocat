# Tag Consolidation: Implementation Steps & Token Estimates

## Overview

This document breaks down the tag consolidation work into discrete, actionable steps with token usage estimates for Claude Code operations. Total project: ~8-10 weeks, ~500K tokens.

---

## Phase 1: PR 1 - Add machine_tags Table (Schema Only)

**Duration**: 1-2 days | **Tokens**: ~2K

### Step 1.1: Create Migration File
**Task**: Write `alembic/versions/202601XX_add_machine_tags_table.py`

**What to do**:
- Create new Alembic migration file
- Add `machine_tags` table with 10 columns (id, image_id, tenant_id, keyword, category, confidence, tag_type, model_name, model_version, created_at, updated_at)
- Add server-side defaults for created_at/updated_at
- Create 3 indexes: idx_machine_tags_per_image, idx_machine_tags_facets, idx_machine_tags_unique
- Write downgrade() function

**Token usage**: ~500 tokens
- Read: Template migration files (~50 tokens)
- Write: New migration (~150 tokens)
- Verify against design doc (~300 tokens)

**Files touched**: 1 new file

---

### Step 1.2: Test Migration
**Task**: Verify schema creation locally

**What to do**:
- Start PostgreSQL locally (or use existing dev DB)
- Run `alembic upgrade head`
- Verify table: `\d machine_tags` in psql
- Verify indexes: `\di` in psql
- Run `alembic downgrade` and verify table drops
- Commit changes to git

**Token usage**: ~1K tokens
- Bash: Migration commands (~200 tokens)
- Verification queries (~300 tokens)
- Git commit message (~200 tokens)

**Files touched**: Git history

---

### Step 1.3: Code Review & Merge
**Task**: Get PR approved and merged

**What to do**:
- Create GitHub PR with title "PR 1: Add machine_tags table (schema only)"
- Validation checklist: Migration creates correct schema, all indexes, downgrade works, no code changes
- Address review feedback (usually minimal for schema-only PR)
- Merge to api-refactor branch

**Token usage**: ~500 tokens
- PR description (~200 tokens)
- Review response (~300 tokens)

**Rollback risk**: LOW (empty table, just drops)

---

## Phase 2: PR 2 - Data Migration & ORM Models

**Duration**: 2-3 days | **Tokens**: ~5K

### Step 2.1: Create Data Migration
**Task**: Write `alembic/versions/202601XX_migrate_tags_to_machine_tags.py`

**What to do**:
- Create migration to copy `image_tags` → `machine_tags` (tag_type='siglip', model_name='google/siglip-so400m-patch14-384')
- Create migration to copy `trained_image_tags` → `machine_tags` (tag_type='trained', keep/default model_name)
- Use explicit ON CONFLICT targets
- Write downgrade() to DELETE migrated data
- Verify counts match: `SELECT COUNT(*) FROM machine_tags WHERE tag_type = 'siglip'` vs `SELECT COUNT(*) FROM image_tags`

**Token usage**: ~1.5K tokens
- Read: Old migration files, source table schemas (~300 tokens)
- Write: Data migration SQL (~500 tokens)
- Verification queries (~300 tokens)
- Pre-migration CHECK query to verify no duplicates (~400 tokens)

**Files touched**: 1 new file

---

### Step 2.2: Add ORM Models
**Task**: Update `src/photocat/metadata/__init__.py`

**What to do**:
- Add `MachineTag` ORM class (30-40 lines)
  - Columns: id, image_id, tenant_id, keyword, category, confidence, tag_type, model_name, model_version, created_at, updated_at
  - Indexes: Same as migration
  - Relationship: back_populates="image"
- Update `ImageMetadata` relationship:
  - Add: `machine_tags = relationship("MachineTag", ...)`
  - Keep existing: `permatags`, `tags` (will remove in PR 5)
- Update imports at top of file

**Token usage**: ~1.5K tokens
- Read: Existing ORM models (Permatag, ImageTag, etc.) (~400 tokens)
- Write: New MachineTag class (~300 tokens)
- Update ImageMetadata (~200 tokens)
- Verify imports and relationships (~600 tokens)

**Files touched**: 1 modified file (metadata/__init__.py)

---

### Step 2.3: Test Data Migration
**Task**: Verify migration and ORM functionality

**What to do**:
- Run pre-migration CHECK query (verify no duplicates)
- Run `alembic upgrade head`
- Verify data copied correctly:
  - `SELECT COUNT(*) FROM machine_tags WHERE tag_type = 'siglip'` (should match image_tags count)
  - `SELECT COUNT(*) FROM machine_tags WHERE tag_type = 'trained'` (should match trained_image_tags count)
  - Spot check: `SELECT * FROM machine_tags LIMIT 5` (inspect fields)
- Test ORM: `db.query(MachineTag).first()` works
- Test relationship: `image.machine_tags` loads
- Test downgrade: `alembic downgrade` and verify tables empty
- Commit to git

**Token usage**: ~1.5K tokens
- SQL verification queries (~400 tokens)
- Python ORM tests (~300 tokens)
- Bash commands (~300 tokens)
- Debugging/troubleshooting (~500 tokens)

**Files touched**: Git history

---

### Step 2.4: Code Review & Merge
**Task**: Get PR approved and merged

**What to do**:
- Create GitHub PR: "PR 2: Migrate data to machine_tags + add ORM model"
- Validation checklist: Data counts match, model_name populated, uniqueness works, ORM loads, relationship works
- Address feedback
- Merge to api-refactor

**Token usage**: ~1K tokens
- PR description (~300 tokens)
- Review response (~400 tokens)
- Debugging if needed (~300 tokens)

**Rollback risk**: MEDIUM (data migrated, old tables still exist, downgrade deletes migrated data)

---

## Phase 3: PR 3 - Update Router Queries

**Duration**: 3-4 days | **Tokens**: ~8K

### Step 3.1: Implement get_tenant_setting() Helper
**Task**: Add helper function to `src/photocat/dependencies.py`

**What to do**:
- Add `get_tenant_setting(db, tenant_id, key, default=None)` function (10-15 lines)
- Handles both JSONB settings and separate column approaches
- Safe fallback to default if setting not found
- Import Tenant model, Session type hints

**Token usage**: ~800 tokens
- Read: Existing dependencies.py (~200 tokens)
- Write: Helper function (~300 tokens)
- Type hints and docstring (~300 tokens)

**Files touched**: 1 modified file (dependencies.py)

---

### Step 3.2: Update routers/keywords.py
**Task**: Replace ImageTag queries with MachineTag

**What to do**:
- Import: `from photocat.metadata import MachineTag` and `from photocat.dependencies import get_tenant_setting`
- Replace lines 103-112: Query ImageTag → Query MachineTag with tag_type filter
- Use `get_tenant_setting()` to get active_machine_tag_type
- Update tag grouping logic (same structure, just different source)
- Keep permatag query and override logic unchanged
- Test: `/api/v1/keywords` endpoint should return same results with same counts

**Token usage**: ~1K tokens
- Read: keywords.py (identify changes) (~300 tokens)
- Edit: Replace queries (~300 tokens)
- Test queries (~400 tokens)

**Files touched**: 1 modified file (routers/keywords.py)

---

### Step 3.3: Update routers/images.py
**Task**: Replace ImageTag + TrainedImageTag queries with MachineTag

**What to do**:
- Import MachineTag and get_tenant_setting
- Update `/api/v1/images` endpoint (lines ~151-157):
  - Query MachineTag with tag_type filter (primary algorithm)
  - Get active_machine_tag_type via helper
- Update `/api/v1/ml-training` endpoint (lines ~609-622):
  - Query MachineTag WITHOUT tag_type filter (show all algorithms)
  - Group by tag_type for comparison view
- Update `/api/v1/images/{id}/tag` endpoint (lines ~886-901):
  - Manual tags → use Permatag API (not machine_tags)
  - Create/update permatag with signum (+1/-1)
- Test: All endpoints return same data, manual tagging still works

**Token usage**: ~2K tokens
- Read: images.py (3 endpoints, 100+ lines each) (~600 tokens)
- Edit: Multiple query changes (~600 tokens)
- Test endpoints (~600 tokens)
- Verify manual tag logic (~200 tokens)

**Files touched**: 1 modified file (routers/images.py)

---

### Step 3.4: Update routers/lists.py
**Task**: Replace ImageTag queries with MachineTag

**What to do**:
- Import MachineTag and get_tenant_setting
- Lines ~197-201: Replace ImageTag query with MachineTag + tag_type filter
- Use helper to get active_machine_tag_type
- Test: `/api/v1/lists/{id}` returns same data

**Token usage**: ~600 tokens
- Read: lists.py (~150 tokens)
- Edit: Query replacement (~200 tokens)
- Test (~250 tokens)

**Files touched**: 1 modified file (routers/lists.py)

---

### Step 3.5: Update routers/sync.py
**Task**: Update cleanup logic to preserve permatags

**What to do**:
- Lines ~340: Replace `db.query(ImageTag).delete()` with filtered MachineTag delete
- Only delete machine tags: `WHERE tag_type IN ('siglip', 'trained')`
- Permatags should NOT be deleted during reprocessing
- Test: Sync reprocessing doesn't delete permatags

**Token usage**: ~600 tokens
- Read: sync.py (~150 tokens)
- Edit: Delete query (~200 tokens)
- Test sync logic (~250 tokens)

**Files touched**: 1 modified file (routers/sync.py)

---

### Step 3.6: Update learning.py
**Task**: Implement ON CONFLICT upsert for tag refresh

**What to do**:
- Import: `from sqlalchemy.dialects.postgresql import insert`
- Lines ~153-170: Replace delete+insert with ON CONFLICT upsert
- Use index elements: `['tenant_id', 'image_id', 'keyword', 'tag_type', 'model_name']`
- Update set: confidence, model_version, updated_at
- Preserve created_at on refresh
- Test: Trained tags refresh without ID churn

**Token usage**: ~1.2K tokens
- Read: learning.py (~300 tokens)
- Understand current logic (~300 tokens)
- Write: Upsert pattern (~400 tokens)
- Test upsert semantics (~200 tokens)

**Files touched**: 1 modified file (learning.py)

---

### Step 3.7: Update cli.py
**Task**: Update cleanup logic in bulk operations

**What to do**:
- Lines ~443, ~1206, ~1310: Replace ImageTag deletes with MachineTag deletes
- Filter: `WHERE tag_type IN ('siglip', 'trained')`
- Preserve permatags
- Test: CLI reprocessing doesn't delete permatags

**Token usage**: ~600 tokens
- Read: cli.py (identify 3 locations) (~200 tokens)
- Edit: Delete queries (~200 tokens)
- Test CLI operations (~200 tokens)

**Files touched**: 1 modified file (cli.py)

---

### Step 3.8: Add active_machine_tag_type to Tenant
**Task**: Add configuration storage (choose approach: JSONB or column)

**Option A - JSONB (preferred)**:
- Update `Tenant` model in metadata/__init__.py:
  - Update JSONB schema documentation: `{"active_machine_tag_type": "siglip"}`
  - Update default in Tenant.__init__ if needed

**Option B - Separate column**:
- Create migration to add column: `active_machine_tag_type VARCHAR(50) DEFAULT 'siglip'`
- Add column to Tenant ORM model

**Token usage**: ~800 tokens
- Read: Tenant model (~200 tokens)
- Decide on approach (~200 tokens)
- Write: Column or JSONB docs (~300 tokens)
- Test: get_tenant_setting() retrieves value (~100 tokens)

**Files touched**: 1-2 modified files

---

### Step 3.9: Code Review & Merge
**Task**: Get PR approved and merged

**What to do**:
- Create GitHub PR: "PR 3: Update router queries to use MachineTag"
- Validation checklist:
  - All imports updated
  - Queries filter by active_machine_tag_type for primary algorithm
  - /ml-training doesn't filter (shows all)
  - ON CONFLICT upsert works
  - DELETE preserves permatags
  - Manual tags use Permatag API
  - API responses unchanged
  - All 7 files touched
- Address feedback
- Merge to api-refactor

**Token usage**: ~1.5K tokens
- PR description (~400 tokens)
- Review response/debugging (~800 tokens)
- Final verification (~300 tokens)

**Rollback risk**: MEDIUM (code depends on MachineTag, old tables still exist)

---

## Phase 4: PR 4 - Testing & Validation

**Duration**: 2-3 days | **Tokens**: ~6K

### Step 4.1: Write Unit Tests
**Task**: Add tests to `tests/test_tagging.py`, `tests/test_keywords.py`, `tests/test_images.py`, etc.

**What to do**:
- Test 1: Multi-tenant isolation (tags from tenant A hidden from B)
- Test 2: Uniqueness constraint (duplicate insert fails)
- Test 3: Algorithm switching (change active_machine_tag_type, counts change)
- Test 4: Upsert semantics (refresh preserves created_at, updates updated_at)
- Test 5: Permatag override (negative permatag removes tag)
- Test 6: Delete cascade (delete image removes all tags)
- Test 7: Index performance (EXPLAIN PLAN for common queries)

**Token usage**: ~2K tokens
- Read: Existing test structure (~300 tokens)
- Write: 7 test cases (~1000 tokens)
- Fixtures and mocks (~400 tokens)
- Assertion helpers (~300 tokens)

**Files touched**: 4-5 test files

---

### Step 4.2: Write Integration Tests
**Task**: Full flow tests

**What to do**:
- Test: Upload image → SigLIP tags → appear in search
- Test: Approve tags as permatags → train models → trained tags appear
- Test: Refresh trained tags → counts don't change, updated_at changes
- Test: `/ml-training` shows all algorithms
- Test: `/keywords` with filters (rating, list_id, reviewed) all work

**Token usage**: ~1.5K tokens
- Understand existing test fixtures (~300 tokens)
- Write: 5 integration tests (~800 tokens)
- Assertions and cleanup (~400 tokens)

**Files touched**: 1-2 test files

---

### Step 4.3: Run Full Test Suite
**Task**: Verify all tests pass

**What to do**:
- Run: `pytest tests/ -v`
- Check: 100% pass rate (or document known failures)
- Check: No regressions in existing tests
- Generate: Coverage report `pytest --cov=src/photocat`
- Document: Any performance regressions

**Token usage**: ~1K tokens
- Bash: Run tests, collect output (~200 tokens)
- Analyze failures (~400 tokens)
- Debugging if needed (~400 tokens)

**Files touched**: Git history (test results)

---

### Step 4.4: Performance Testing
**Task**: Verify query performance

**What to do**:
- EXPLAIN PLAN for common queries:
  - `SELECT * FROM machine_tags WHERE tenant_id = ? AND image_id IN (...) AND tag_type = ?`
  - `SELECT * FROM machine_tags WHERE tenant_id = ? AND tag_type = ? AND keyword = ?`
  - `SELECT * FROM machine_tags WHERE image_id = ? ORDER BY created_at`
- Verify indexes are used (Seq Scan → Index Scan)
- Load test: 10K images × 50 tags = 500K rows, query time < 100ms
- Document: Before/after query times

**Token usage**: ~1.2K tokens
- SQL EXPLAIN queries (~300 tokens)
- Load test generation (~400 tokens)
- Analysis and documentation (~500 tokens)

**Files touched**: Documentation

---

### Step 4.5: Code Review & Merge
**Task**: Get PR approved and merged

**What to do**:
- Create GitHub PR: "PR 4: Add comprehensive tests and validation"
- Validation checklist:
  - All unit tests pass
  - All integration tests pass
  - 100% coverage of tag operations
  - Multi-tenant isolation verified
  - Index performance acceptable
  - No regressions
- Address feedback
- Merge to api-refactor

**Token usage**: ~1.2K tokens
- PR description (~300 tokens)
- Review response (~600 tokens)
- Test debugging if needed (~300 tokens)

**Rollback risk**: LOW (only tests, no schema/data changes)

---

## Phase 5: PR 5 - Drop Old Tables (Final Cleanup)

**Duration**: 1 day | **Tokens**: ~2K

### Step 5.1: Create Cleanup Migration
**Task**: Write `alembic/versions/202601XX_drop_old_tag_tables.py`

**What to do**:
- Drop table: `trained_image_tags`
- Drop table: `image_tags`
- Add downgrade() that raises NotImplementedError (can't easily recreate tables)

**Token usage**: ~400 tokens
- Write: Migration (~200 tokens)
- Verify down_revision correct (~200 tokens)

**Files touched**: 1 new file

---

### Step 5.2: Clean Up ORM Models
**Task**: Remove deprecated classes from `src/photocat/metadata/__init__.py`

**What to do**:
- Delete: `ImageTag` class (15-20 lines)
- Delete: `TrainedImageTag` class (20-25 lines)
- Update: `ImageMetadata` - remove `tags` relationship
- Verify: No imports of deleted classes in codebase

**Token usage**: ~600 tokens
- Read: metadata/__init__.py (~150 tokens)
- Edit: Delete classes (~200 tokens)
- Grep: Verify no orphan imports (~250 tokens)

**Files touched**: 1 modified file

---

### Step 5.3: Final Cleanup
**Task**: Run migration and verify

**What to do**:
- Run: `alembic upgrade head`
- Verify: Tables dropped: `\dt` in psql
- Verify: No imports of deleted classes: `grep -r "ImageTag\|TrainedImageTag" src/`
- Run: Full test suite (should still pass)
- Commit to git

**Token usage**: ~800 tokens
- SQL verification (~200 tokens)
- Bash grep commands (~200 tokens)
- Test suite run (~300 tokens)
- Git commit (~100 tokens)

**Files touched**: Git history

---

### Step 5.4: Code Review & Merge
**Task**: Get PR approved and merged

**What to do**:
- Create GitHub PR: "PR 5: Drop old image_tags and trained_image_tags tables"
- Validation checklist:
  - Tables dropped
  - No orphan imports
  - Full test suite passes
  - Downgrade unsupported (documented)
- Address feedback (usually minimal)
- Merge to api-refactor and then main

**Token usage**: ~600 tokens
- PR description (~200 tokens)
- Review response (~300 tokens)
- Final verification (~100 tokens)

**Rollback risk**: HIGH (tables deleted, requires backups to restore)

---

## Post-Implementation: Future Algorithm Support

**Duration**: Per algorithm | **Tokens**: ~2-3K per algorithm

### Example: Add CLIP Model

#### Step 6.1: Implement CLIP Tagger
**Task**: Create `src/photocat/tagging/clip.py`

**What to do**:
- Copy SigLIPTagger structure
- Replace model with CLIP
- Update model_name: "openai/clip-vit-large"
- Test: tag_image() returns (keyword, confidence) tuples

**Token usage**: ~800 tokens

---

#### Step 6.2: Integrate into Processing Pipeline
**Task**: Update sync.py or image processing to call CLIP

**What to do**:
- Import CLIPTagger
- Call: `clip_results = clip_tagger.tag_image(image_bytes, keywords)`
- Loop: Insert into machine_tags with tag_type='clip'
- No migrations needed

**Token usage**: ~600 tokens

---

#### Step 6.3: Add Admin Endpoint (Optional)
**Task**: Allow switching primary algorithm

**What to do**:
- PATCH `/api/v1/admin/config/active-tag-type?tag_type=clip`
- Validate tag_type exists in DB
- Update tenant.active_machine_tag_type

**Token usage**: ~400 tokens

---

#### Step 6.4: Test & Deploy
**Task**: Test CLIP integration

**What to do**:
- Run tests with CLIP enabled
- Verify `/api/v1/ml-training` shows both siglip and clip tags
- Switch primary algorithm, verify counts change
- No PR needed if code already merged (just code + tests)

**Token usage**: ~400 tokens

---

## Token Summary by Phase

| Phase | Task | Tokens | Duration |
|-------|------|--------|----------|
| **PR 1** | Schema only | 2K | 1-2 days |
| **PR 2** | Data migration + ORM | 5K | 2-3 days |
| **PR 3** | Router queries (6 files) | 8K | 3-4 days |
| **PR 4** | Testing & validation | 6K | 2-3 days |
| **PR 5** | Cleanup | 2K | 1 day |
| **Future** | Per algorithm (CLIP, etc.) | 2-3K each | 1-2 days each |
| | | | |
| **TOTAL** | All 5 PRs | **23K** | **8-10 weeks** |
| **With 2 new algorithms** | Add CLIP + Visual Similarity | **27K** | **10-12 weeks** |

---

## Dependency Gates

- **PR 2 → PR 3**: Must have `active_machine_tag_type` storage implemented (column or JSONB)
- **PR 3 → PR 4**: All 7 files must compile without errors
- **PR 4 → PR 5**: All tests must pass; no rollback needed after PR 5
- **PR 5 → Production**: Verify backups exist before dropping tables

---

## Rollback by Phase

| Phase | Can Rollback? | Method | Risk |
|-------|---------------|--------|------|
| PR 1 | ✅ Yes | `alembic downgrade` | LOW |
| PR 2 | ✅ Yes | `alembic downgrade` (restores old tables) | MEDIUM |
| PR 3 | ✅ Yes | Revert commits, keeps old tables | MEDIUM |
| PR 4 | ✅ Yes | Revert test commits | LOW |
| PR 5 | ❌ No | Restore from backups | HIGH |

---

## Estimated Team Effort

Assuming 1 developer, 6 hours/day coding:

- **PR 1**: 4-6 hours (mostly testing)
- **PR 2**: 8-10 hours (migration + ORM + testing)
- **PR 3**: 16-20 hours (6 files × 2-3 hours each)
- **PR 4**: 12-14 hours (tests + integration + perf testing)
- **PR 5**: 2-3 hours (cleanup + final tests)
- **Total**: ~42-53 hours = **1-2 weeks** at 6h/day, **2-3 weeks** at 4h/day

---

## Assumptions & Notes

1. **PostgreSQL**: All SQL assumes PostgreSQL (ON CONFLICT, server defaults)
2. **Backward compatibility**: API responses unchanged through PR 4
3. **No breaking changes**: Old tables exist through PR 4 for safety
4. **Token estimates**: Based on average Claude operations (read file = 50-100 tokens, write = 100-300, test = 200-500)
5. **Future algorithms**: Add 2-3K tokens per new algorithm (no migrations needed)
