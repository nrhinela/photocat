# PhotoCat Modularization Plan

**Status**: Proposed
**Date**: 2026-02-09
**Priority**: High - Critical for LLM compatibility per CLAUDE.md guidelines

## Executive Summary

The PhotoCat codebase has two critical files that violate the project's "small files for LLM compatibility" principle:

- **`frontend/components/photocat-app.js`**: 4,602 lines, 135 methods
- **`src/photocat/routers/images/core.py`**: 1,893 lines, 26 endpoints

This plan outlines a systematic refactoring to reduce these files to manageable sizes (~400-800 lines each) while maintaining functionality and test coverage.

## Refactoring Principles

1. **Behavior-Preserving by Default**: All modularization PRs are move-and-wire operations only. No functional changes unless explicitly scoped, documented, and tested separately.
2. **Atomic Commits**: Each extraction step is a single, revertible commit
3. **Test-First**: Tests updated/created before code is moved
4. **No Regressions**: Full test suite + manual QA passes before merging

---

## Phase 1: Frontend Modularization (Priority 1)

### Current State Analysis

**File**: `frontend/components/photocat-app.js` (4,602 lines)

**Method Breakdown by Feature**:
- Curate Home: 47 methods (filters, sorting, selection, loading)
- Curate Audit: 28 methods (hotspot, rating, filters)
- Curate Explore: 9 methods (hotspot, rating)
- Rating Dialogs: 7 methods (modals, apply rating)
- Navigation: 6 methods (tabs, routing, bootstrap)
- Lists: 3 methods (title generation)
- Other: 35 methods (user, tenant, queue, utilities)

**Problem**:
- Single file contains ALL application state and handlers for 8+ different tabs
- Impossible for LLMs to process efficiently
- High risk of merge conflicts
- Difficult to maintain and test

### Proposed Architecture

```
frontend/components/
├── photocat-app.js (800 lines - orchestrator only)
│   ├── Tab routing and rendering
│   ├── Global state (user, tenant, keywords)
│   ├── Modal coordination (editor, upload, list-editor)
│   └── Queue subscription
│
├── state/
│   ├── curate-home-state.js (600 lines)
│   │   ├── Filter state (keywords, ratings, sorting)
│   │   ├── Selection handlers (drag, multi-select)
│   │   ├── Image loading and pagination
│   │   └── Export: CurateHomeStateController class
│   │
│   ├── curate-audit-state.js (500 lines)
│   │   ├── Audit mode (permatags, machine tags, orphans)
│   │   ├── Hotspot state (action, keyword, rating)
│   │   ├── Selection and drag handlers
│   │   └── Export: CurateAuditStateController class
│   │
│   ├── curate-explore-state.js (300 lines)
│   │   ├── Explore mode state
│   │   ├── Hotspot handlers (simpler than audit)
│   │   ├── Rating dialog state
│   │   └── Export: CurateExploreStateController class
│   │
│   ├── search-state.js (200 lines)
│   │   ├── Search query state
│   │   ├── List draft state
│   │   └── Export: SearchStateController class
│   │
│   └── rating-modal-state.js (200 lines)
│       ├── Modal visibility (explore/audit)
│       ├── Apply rating logic
│       └── Export: RatingModalStateController class
│
└── shared/
    └── state/
        └── image-filter-panel.js (existing - no changes)
```

**State Directory Ownership Rules**:
- **`components/state/`**: Tab-specific state controllers that are tightly coupled to `photocat-app.js`. These manage the lifecycle and behavior of individual tabs (curate, audit, explore, search). One-to-one relationship with tabs.
- **`shared/state/`**: Reusable state utilities used by MULTIPLE tabs or components (e.g., `image-filter-panel.js` used by search, curate, and audit). Must have 2+ consumers before moving to shared.
- **Rule**: State starts in `components/state/`. Only move to `shared/state/` when a third component needs it (not sooner, to avoid premature abstraction).

### Refactoring Strategy

#### Step 1.1: Extract Base State Controller

**File**: `frontend/components/state/base-state-controller.js` (150 lines)

```javascript
export class BaseStateController {
  constructor(host) {
    this.host = host;
    host.addController(this);
  }

  // ReactiveController lifecycle
  hostConnected() {}
  hostDisconnected() {}

  requestUpdate() {
    this.host.requestUpdate();
  }

  // Dispatch custom event from parent
  dispatch(eventName, detail) {
    this.host.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  // Common utilities
  async withLoading(loadingProp, asyncFn) {
    this.host[loadingProp] = true;
    this.requestUpdate();
    try {
      return await asyncFn();
    } finally {
      this.host[loadingProp] = false;
      this.requestUpdate();
    }
  }
}
```

Use Lit's `ReactiveController` pattern instead of custom manager base classes. Benefits:
- Automatic lifecycle integration (`hostConnected`, `hostDisconnected`)
- Built-in `requestUpdate()` via `host.requestUpdate()`
- Less custom code to maintain
- Standard Lit pattern developers already know

**Revised Base Class**:
```javascript
export class BaseStateController {
  constructor(host) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    // Called when component connects to DOM
  }

  hostDisconnected() {
    // Cleanup when component disconnects
  }

  requestUpdate() {
    this.host.requestUpdate();
  }

  async withLoading(loadingProp, asyncFn) {
    this.host[loadingProp] = true;
    this.requestUpdate();
    try {
      return await asyncFn();
    } finally {
      this.host[loadingProp] = false;
      this.requestUpdate();
    }
  }
}
```

#### Step 1.2: Extract Curate Home State Controller

**File**: `frontend/components/state/curate-home-state.js` (600 lines)

**Responsibilities**:
- Manage curate filter state (keywords, ratings, date ranges)
- Handle sorting (orderBy, orderDirection, quickSort)
- Selection state and handlers
- Image loading and pagination
- Flash selection animations

**Public Interface**:
```javascript
export class CurateHomeStateController extends BaseStateController {
  // State initialization
  getDefaultState()
  snapshotState()
  restoreState(snapshot)

  // Filter management
  applyCurateFilters()
  handleKeywordSelect(keywordId)
  handleTagSourceChange(source)
  handleHideDeletedChange(value)
  handleNoPositivePermatagsChange(value)
  handleMinRating(rating)

  // Sorting
  handleOrderByChange(orderBy)
  handleOrderDirectionChange(direction)
  handleQuickSort(preset)

  // Selection
  startSelection()
  cancelPressState()
  flashSelection(imageIds)

  // Loading
  startLoading()
  finishLoading()
  async fetchImages(filterOverrides)

  // Image removal
  removeImagesByIds(imageIds)

  // Hotspot integration
  handleHotspotChanged(event)
  processTagDrop(imageIds, targetData)
}
```

**Migration Path**:
1. Create `curate-home-state.js` with class skeleton
2. Copy methods from `photocat-app.js` (lines ~1646-2600)
3. Update method signatures to use `this.host` for property access
4. In `photocat-app.js`, instantiate controller in constructor:
   ```javascript
   this._curateHomeState = new CurateHomeStateController(this);
   ```
5. Replace method calls: `this._handleCurateKeywordSelect()` → `this._curateHomeState.handleKeywordSelect()`
6. Update event handlers in template to use state controller

**Revised Step 1.2 Migration Path** (behavior-based):
1. **Slice 1: Filter State** (~150 lines)
   - Methods: `handleKeywordSelect`, `handleTagSourceChange`, `handleHideDeletedChange`, `handleNoPositivePermatagsChange`, `handleMinRating`
   - Test: Filter UI updates filter state correctly

2. **Slice 2: Sorting** (~100 lines)
   - Methods: `handleOrderByChange`, `handleOrderDirectionChange`, `handleQuickSort`
   - Test: Sort controls change image order

3. **Slice 3: Selection** (~150 lines)
   - Methods: `startSelection`, `cancelPressState`, `flashSelection`
   - Test: Multi-select, drag-select, flash animations work

4. **Slice 4: Loading & Pagination** (~200 lines)
   - Methods: `startLoading`, `finishLoading`, `fetchImages`, `applyCurateFilters`
   - Test: Images load with correct filters, pagination works

Each slice is tested independently before moving to the next.

#### Step 1.3: Extract Curate Audit State Controller

**File**: `frontend/components/state/curate-audit-state.js` (500 lines)

**Responsibilities**:
- Audit mode selection (permatags, machine tags, orphans)
- AI-enabled toggle and model selection
- Hotspot state (complex: keyword, action, rating, targets)
- Rating drag-and-drop
- Image removal and sync

**Public Interface**:
```javascript
export class CurateAuditStateController extends BaseStateController {
  // Mode management
  handleModeChange(mode)
  handleAiEnabledChange(enabled)
  handleAiModelChange(model)

  // Filters
  handleChipFiltersChanged(filters)
  handleKeywordChange(keywordId)
  handleHideDeletedChange(value)
  handleNoPositivePermatagsChange(value)
  handleMinRating(rating)

  // Hotspot management
  handleHotspotChanged(event)
  handleHotspotKeywordChange(keywordId)
  handleHotspotActionChange(action)
  handleHotspotTypeChange(type)
  handleHotspotRatingChange(rating)
  handleHotspotAddTarget()
  handleHotspotRemoveTarget(index)
  handleHotspotDragOver(event)
  handleHotspotDragLeave(event)
  handleHotspotDrop(imageIds)
  syncHotspotPrimary()

  // Rating
  handleRatingToggle()
  handleRatingDragOver(event)
  handleRatingDragLeave(event)
  handleRatingDrop(rating, imageIds)

  // Image management
  removeImagesByIds(imageIds)
  processTagDrop(imageIds, targetData)

  // Selection
  startSelection()
  cancelPressState()
}
```

#### Step 1.4: Extract Curate Explore State Controller

**File**: `frontend/components/state/curate-explore-state.js` (300 lines)

Simpler than Audit - fewer hotspot options, no complex modes.

#### Step 1.5: Extract Rating Modal State Controller

**File**: `frontend/components/state/rating-modal-state.js` (200 lines)

**Responsibilities**:
- Show/hide rating dialogs for explore and audit
- Apply rating to selected images
- Handle modal click outside to close

#### Step 1.6: Update PhotoCat App

**File**: `frontend/components/photocat-app.js` (reduced to 800 lines)

**Remaining Responsibilities**:
- Component lifecycle (constructor, connectedCallback, disconnectedCallback)
- Property definitions (static properties)
- Tab routing and active tab management
- Global state: user, tenant, keywords, lists
- Modal coordination: image-editor, upload-modal, list-editor, permatag-editor
- Command queue subscription
- Render method (delegate to tab components)

**Constructor Updates**:
```javascript
constructor() {
  super();

  // Initialize state controllers
  this._curateHomeState = new CurateHomeStateController(this);
  this._curateAuditState = new CurateAuditStateController(this);
  this._curateExploreState = new CurateExploreStateController(this);
  this._searchState = new SearchStateController(this);
  this._ratingModalState = new RatingModalStateController(this);

  // Existing handlers that remain
  this._curateSelectionHandlers = createSelectionHandlers(this, { ... });
  this._ratingDragHandlers = createRatingDragHandlers(this, { ... });
  // ... etc
}
```

**Template Updates**:
```javascript
// Before
<curate-home-tab
  @keyword-select=${this._handleCurateKeywordSelect}
  @order-by-change=${this._handleCurateOrderByChange}
  ...
></curate-home-tab>

// After
<curate-home-tab
  @keyword-select=${(e) => this._curateHomeState.handleKeywordSelect(e.detail.keywordId)}
  @order-by-change=${(e) => this._curateHomeState.handleOrderByChange(e.detail.orderBy)}
  ...
></curate-home-tab>
```

**Updated Constructor Pattern**:
```javascript
constructor() {
  super();

  // Initialize state controllers
  this._curateHomeState = new CurateHomeStateController(this);
  this._curateAuditState = new CurateAuditStateController(this);

  // Bind stable handler references for hot-path events
  this._handleCurateKeywordSelect = (e) =>
    this._curateHomeState.handleKeywordSelect(e.detail.keywordId);
  this._handleCurateOrderByChange = (e) =>
    this._curateHomeState.handleOrderByChange(e.detail.orderBy);
  // etc.
}
```

**Template (uses stable references)**:
```javascript
<curate-home-tab
  @keyword-select=${this._handleCurateKeywordSelect}
  @order-by-change=${this._handleCurateOrderByChange}
></curate-home-tab>
```

This avoids allocating new lambdas on every render while still delegating to state controllers.

### Testing Strategy

**For each state controller**:
1. Create unit test file (e.g., `curate-home-state.test.js`)
2. Mock the parent component interface
3. Test state transitions and method behavior
4. Ensure no regressions in functionality

**Integration Testing**:
1. Manual testing of each tab's functionality
2. Verify event handlers still work
3. Check state persistence across tab switches
4. Test selection, drag-and-drop, and rating features

**Golden Workflows** (E2E validation):
1. **Curate Home → Tag Images → View in Editor**
   - Load curate home tab
   - Apply keyword filter
   - Multi-select 5 images (drag selection)
   - Drag to tag target (add keyword)
   - Click one image to open editor
   - Verify tags appear in editor

2. **Curate Audit → Apply Hotspot → Rate Multiple**
   - Switch to audit tab
   - Select "Missing Permatags" mode
   - Configure hotspot (keyword + action)
   - Drag 10 images to hotspot
   - Verify tags applied
   - Multi-select those images
   - Apply 5-star rating via rating panel

3. **Search → Build Query → Create List**
   - Switch to search tab
   - Enter text query + date range + keyword filter
   - Verify results update
   - Multi-select 20 images
   - Create new list
   - Verify list appears with correct count

4. **Navigation → State Persistence**
   - Apply filters on curate home
   - Switch to search tab
   - Switch back to curate home
   - Verify filters still applied (state restored)

5. **Performance → Rapid Interactions**
   - Load 500+ image grid
   - Rapidly change filters 5 times
   - Drag-select across 50 images
   - No UI freezes, selections render correctly

**Pass Criteria**: All 5 workflows complete without errors or UI bugs.

### Rollout Plan

> Superseded by the milestone-based rollout plan below (source of truth).

**Updated Rollout Plan** (stop/go checkpoints):

**Milestone 1: Foundation + Curate Home** (~1-2 weeks)
- ✅ Create `BaseStateController` (ReactiveController-based)
- ✅ Extract `CurateHomeStateController` by behavior slices
- ✅ Update `photocat-app.js` integration
- ✅ Run golden workflows 1, 4, 5
- **CHECKPOINT**: All tests pass + workflows validated → Proceed to M2

**Milestone 2: Curate Audit** (~1-2 weeks)
- ✅ Extract `CurateAuditStateController`
- ✅ Update audit tab integration
- ✅ Run golden workflow 2
- **CHECKPOINT**: Audit tab fully functional → Proceed to M3

**Milestone 3: Curate Explore + Rating Modal** (~1 week)
- ✅ Extract `CurateExploreStateController`
- ✅ Extract `RatingModalStateController`
- ✅ Verify rating dialogs work in both explore and audit
- **CHECKPOINT**: Rating flows validated → Proceed to M4

**Milestone 4: Search + Cleanup** (~1 week)
- ✅ Extract `SearchStateController`
- ✅ Run golden workflow 3
- ✅ Final cleanup of `photocat-app.js` (remove dead code)
- ✅ Full regression suite
- **CHECKPOINT**: All golden workflows pass → Phase 1 complete

**Milestone 5: Documentation** (~2-3 days)
- Update CLAUDE.md with state controller patterns
- Document ownership rules (components/state vs shared/state)
- Create migration guide for future extractions

**Timeline**: 4-6 weeks total, with go/no-go decisions at each milestone.

---

## Phase 2: Backend Modularization (Priority 2)

### Current State Analysis

**File**: `src/photocat/routers/images/core.py` (1,893 lines)

**Endpoint Breakdown**:
1. **Listing & Stats** (5 endpoints, ~600 lines):
   - `list_dropbox_folders` (30 lines)
   - `list_images` (550 lines - COMPLEX query builder)
   - `get_image_stats` (200 lines)
   - `get_image` (117 lines)
   - `get_image_asset` (34 lines)

2. **Asset Management** (7 endpoints, ~500 lines):
   - `get_asset` (43 lines)
   - `list_asset_variants` (53 lines)
   - `upload_asset_variant` (56 lines)
   - `update_asset_variant` (57 lines)
   - `delete_asset_variant` (36 lines)
   - `inspect_asset_variant` (56 lines)
   - `get_asset_variant_content` (39 lines)

3. **File Serving** (2 endpoints, ~200 lines):
   - `get_thumbnail` (61 lines)
   - `get_full_image` (96 lines)

4. **Metadata Operations** (2 endpoints, ~400 lines):
   - `refresh_image_metadata` (137 lines)
   - `propagate_dropbox_tags` (97 lines)

5. **Rating** (1 endpoint, ~18 lines):
   - `update_image_rating` (18 lines)

6. **Utility Functions** (9 functions, ~175 lines):
   - `_serialize_asset_variant`
   - `_user_display_name_from_fields`
   - `_build_user_name_map`
   - `_get_image_and_asset_or_409`
   - `_resolve_storage_or_409`
   - `_resolve_dropbox_ref`
   - `_extract_dropbox_tag_text`
   - `get_keyword_name`
   - `get_keyword_category_name`

### Proposed Architecture

```
src/photocat/routers/images/
├── _shared.py (NEW - cross-router utilities)
│   ├── _get_image_and_asset_or_409
│   ├── _resolve_storage_or_409
│   ├── _user_display_name_from_fields
│   ├── _build_user_name_map
│   └── get_keyword_name, get_keyword_category_name
│
├── core.py (400 lines - image listing and retrieval only)
│   ├── list_images (simplified)
│   ├── get_image
│   ├── get_image_asset
│   └── get_asset
│
├── stats.py (250 lines - NEW)
│   └── get_image_stats
│
├── asset_variants.py (400 lines - NEW)
│   ├── list_asset_variants
│   ├── upload_asset_variant
│   ├── update_asset_variant
│   ├── delete_asset_variant
│   ├── inspect_asset_variant
│   ├── get_asset_variant_content
│   └── Utilities: _serialize_asset_variant, _build_user_name_map
│
├── file_serving.py (300 lines - NEW)
│   ├── get_thumbnail
│   ├── get_full_image
│   └── Utilities: _resolve_storage_or_409, _get_image_and_asset_or_409
│
├── dropbox_sync.py (500 lines - NEW)
│   ├── list_dropbox_folders
│   ├── refresh_image_metadata
│   ├── propagate_dropbox_tags
│   └── Utilities: _resolve_dropbox_ref, _extract_dropbox_tag_text
│
├── rating.py (100 lines - NEW)
│   └── update_image_rating
│
└── query_builder.py (existing - may need updates for list_images)
```

```
src/photocat/routers/images/
├── _shared.py (NEW - cross-router utilities)
│   ├── _get_image_and_asset_or_409
│   ├── _resolve_storage_or_409
│   ├── _user_display_name_from_fields
│   ├── _build_user_name_map
│   └── get_keyword_name, get_keyword_category_name
```

**Migration Strategy Update**:
- **Step 2.0** (new first step): Extract `_shared.py` with common utilities
- All subsequent router extractions import from `_shared.py` instead of duplicating utilities
- Prevents import cycles by establishing shared dependencies upfront

### Refactoring Strategy

#### Step 2.1: Extract Asset Variants Router

**File**: `src/photocat/routers/images/asset_variants.py` (400 lines)

**Contents**:
- All asset derivative CRUD endpoints
- `_serialize_asset_variant` helper
- Import shared helpers from `_shared.py` (no duplication)

**Migration**:
1. Create new file with router:
   ```python
   router = APIRouter(prefix="/images", tags=["images"])
   ```
2. Copy 7 asset variant endpoints
3. Import required helpers from `_shared.py`
4. Update imports in `api.py`
5. Remove from `core.py`

**Compatibility Shim Pattern** (for one release cycle):
```python
# In core.py (after moving functions to asset_variants.py)
from photocat.routers.images.asset_variants import (
    list_asset_variants as _list_asset_variants,
    upload_asset_variant as _upload_asset_variant,
)
import warnings

# Deprecated re-exports for backwards compatibility
def list_asset_variants(*args, **kwargs):
    warnings.warn(
        "Importing list_asset_variants from core.py is deprecated. "
        "Import from photocat.routers.images.asset_variants instead.",
        DeprecationWarning,
        stacklevel=2
    )
    return _list_asset_variants(*args, **kwargs)
```

**Timeline**:
- Migration PR: Add shims with deprecation warnings
- Next release: Remove shims entirely
- Gives internal code time to update imports safely

#### Step 2.2: Extract File Serving Router

**File**: `src/photocat/routers/images/file_serving.py` (300 lines)

**Contents**:
- `get_thumbnail` - Serve thumbnail from GCS or Dropbox
- `get_full_image` - Serve full-res from GCS or Dropbox
- Utilities: `_resolve_storage_or_409`, `_get_image_and_asset_or_409`

**Migration**:
1. Create new router
2. Copy endpoints
3. Copy storage resolution utilities
4. Test thumbnail and full image serving

#### Step 2.3: Extract Dropbox Sync Router

**File**: `src/photocat/routers/images/dropbox_sync.py` (500 lines)

**Contents**:
- `list_dropbox_folders` - List folders from Dropbox
- `refresh_image_metadata` - Refresh EXIF from Dropbox
- `propagate_dropbox_tags` - Push tags back to Dropbox
- Utilities: `_resolve_dropbox_ref`, `_extract_dropbox_tag_text`

**Migration**:
1. Create new router
2. Copy endpoints
3. Copy Dropbox utilities
4. Test Dropbox integration

#### Step 2.4: Extract Stats Router

**File**: `src/photocat/routers/images/stats.py` (250 lines)

**Contents**:
- `get_image_stats` - Complex aggregation query
- `get_keyword_name`, `get_keyword_category_name` utilities

**Migration**:
1. Create new router
2. Copy stats endpoint
3. Copy keyword utilities
4. Test stats aggregation

#### Step 2.5: Extract Rating Router

**File**: `src/photocat/routers/images/rating.py` (100 lines)

**Contents**:
- `update_image_rating` - Update rating (currently 18 lines, room to grow)

**Rationale**: Separate file for future enhancements (bulk rating, rating history, etc.)

#### Step 2.6: Simplify Core Router

**File**: `src/photocat/routers/images/core.py` (reduced to 400 lines)

**Remaining Contents**:
- `list_images` - Main image listing (may need refactoring to use query_builder)
- `get_image` - Single image retrieval
- `get_image_asset` - Get asset for image
- `get_asset` - Direct asset retrieval

**Improvements**:
- Move complex query building to `query_builder.py`
- Reduce `list_images` from 550 → ~200 lines

**Revised Backend Migration Order** (safest → riskiest):
1. **Week 1**: Extract low-risk routers (no query logic)
   - `_shared.py` (utilities)
   - `rating.py` (simple 18-line endpoint)
   - `file_serving.py` (file streaming, no complex queries)

2. **Week 2**: Extract medium-risk routers
   - `asset_variants.py` (CRUD, straightforward queries)
   - `dropbox_sync.py` (external API calls, isolated)

3. **Week 3**: Extract stats router (complex but isolated)
   - `stats.py` (aggregation queries, but self-contained)

4. **Week 4**: **Simplify `list_images` LAST** (highest risk)
   - Refactor complex query building to use `query_builder.py`
   - Extensive testing (pagination, filters, tenant isolation)
   - Performance benchmarking

This order minimizes risk by tackling the most complex/critical endpoint last.

#### Step 2.7: Update API Registration

**File**: `src/photocat/api.py`

```python
# Before
from photocat.routers.images import core, tagging, ml_training, people_tagging, permatags
app.include_router(core.router)

# After
from photocat.routers.images import (
    core,
    stats,
    asset_variants,
    file_serving,
    dropbox_sync,
    rating,
    tagging,
    ml_training,
    people_tagging,
    permatags,
)

app.include_router(core.router)
app.include_router(stats.router)
app.include_router(asset_variants.router)
app.include_router(file_serving.router)
app.include_router(dropbox_sync.router)
app.include_router(rating.router)
# ... existing routers
```

**API Contract Preservation Checklist** (for each router extraction):
1. ✅ Endpoint paths unchanged: `/api/v1/images/{id}/variants` → same path in new router
2. ✅ HTTP methods unchanged: `GET`, `POST`, `PUT`, `DELETE` preserved
3. ✅ `operation_id` unchanged: FastAPI auto-generates from function name, so keep function names identical
4. ✅ Request/response schemas unchanged: Same Pydantic models
5. ✅ Query parameters unchanged: Same parameter names, types, defaults
6. ✅ OpenAPI spec diff: Before/after extraction, run `diff` on generated OpenAPI JSON - should be identical except for `tags` grouping

**Automated Verification**:
```bash
# Before extraction
curl http://localhost:8080/openapi.json > openapi_before.json

# After extraction
curl http://localhost:8080/openapi.json > openapi_after.json

# Compare (ignoring tag changes)
diff <(jq 'del(.tags)' openapi_before.json) \
     <(jq 'del(.tags)' openapi_after.json)
# Should output: no differences (or only minor metadata)
```

### Testing Strategy

**For each new router**:
1. Copy existing tests from `test_images.py` (if they exist)
2. Create new test file (e.g., `test_asset_variants.py`)
3. Test all endpoints in isolation
4. Test with tenant isolation
5. Test error cases (404, 409, 500)

**Integration Testing**:
1. Verify API still works end-to-end
2. Test frontend integration (no broken API calls)
3. Performance testing (ensure no regressions)

### Rollout Plan

> Use the revised backend migration order above as source of truth:
1. `_shared.py`, `rating.py`, `file_serving.py`
2. `asset_variants.py`, `dropbox_sync.py`
3. `stats.py`
4. `list_images` simplification in `core.py` (last)

---

## Phase 3: Additional Modularization (Lower Priority)

### Other Large Files to Consider

1. **`src/photocat/cli.py`** (1,239 lines, 54 commands)
   - Already has `cli/commands/` subfolder
   - Move remaining commands to appropriate modules
   - Reduce to ~200 lines (just CLI group registration)

2. **`frontend/components/image-editor.js`** (2,447 lines)
   - Extract panels: metadata, tagging, variants, actions
   - Reduce to ~800 lines (modal shell + coordination)

3. **`frontend/components/search-tab.js`** (2,531 lines)
   - Reference implementation - be careful!
   - Extract search query builder → shared module
   - Keep image rendering pattern intact

4. **`src/photocat/routers/filtering.py`** (1,006 lines)
   - Split into: `filter_parser.py`, `filter_query.py`, `filter_validation.py`

---

## Success Metrics

### Before Refactoring
- `photocat-app.js`: 4,602 lines, 135 methods
- `routers/images/core.py`: 1,893 lines, 26 endpoints
- **Total "problematic" lines**: 6,495

### After Refactoring (Target)
- `photocat-app.js`: 800 lines, ~25 methods
- `routers/images/core.py`: 400 lines, 4 endpoints
- **Total refactored into**: ~10-12 focused modules averaging 300-600 lines each
- **Reduction**: 6,495 → ~5,000 total lines (but distributed for LLM compatibility)

### Quality Metrics
- ✅ No files over 1,000 lines (except reference implementations)
- ✅ All tests passing
- ✅ No performance regressions
- ✅ Improved code navigation (smaller, focused files)
- ✅ Better LLM comprehension (per CLAUDE.md principle)

### Operational Metrics (tracked for 2 weeks post-merge)

**Performance Metrics** (baseline vs post-refactor):
- `GET /api/v1/images` p95 latency: < 5% regression
- `GET /api/v1/images/{id}` p95 latency: < 5% regression
- `GET /api/v1/images/stats` p95 latency: < 5% regression
- Frontend initial load time: < 10% regression
- Tab switch latency: < 10% regression

**Quality Metrics**:
- Regression defect rate: < 2 P0/P1 bugs per phase
- Hotfix rate: 0 emergency patches required
- Test coverage: maintained or improved (capture baseline before Phase 1 starts)

**Developer Experience Metrics**:
- PR cycle time: 50% reduction (faster reviews due to smaller files)
- Time to locate code: 40% reduction (better file organization)
- Merge conflict rate: 30% reduction (less contention on giant files)

**Measurement Tools**:
- Performance: GCP Cloud Monitoring, Lighthouse CI
- Quality: GitHub Issues labeled "regression"
- DX: GitHub PR metrics, developer survey

---

## Risks and Mitigation

### Risk 1: Breaking Changes During Refactoring
**Mitigation**:
- One module at a time
- Comprehensive testing after each extraction
- Keep git commits small and atomic
- Ability to rollback each step independently

### Risk 2: Event Handler Breakage (Frontend)
**Mitigation**:
- Create mapping document of old → new method paths
- Test each event type after migration
- Manual QA of all tab interactions

### Risk 3: Import Cycles (Backend)
**Mitigation**:
- Careful dependency analysis before splitting
- Use dependency injection where needed
- Keep utilities in separate files

### Risk 4: Merge Conflicts During Development
**Mitigation**:
- Coordinate refactoring during low-activity period
- Communicate plan to all developers
- Use feature branches for each phase

### Risk 5: Auth/Tenant Parity Drift During Endpoint Moves
**Mitigation**:
- Add parity tests for auth role checks and tenant isolation before and after each router extraction
- Explicitly diff old/new dependencies for each moved endpoint
- Include one negative test per endpoint for cross-tenant access

---

## Next Steps

1. **Review and Approve**: Team reviews this plan
2. **Prioritize**: Confirm Phase 1 (frontend) as highest priority
3. **Schedule**: Use milestone checkpoints (Phase 1 target: 4-6 weeks, Phase 2 target: 4 weeks)
4. **Execute**: Follow rollout plan with milestone checkpoints
5. **Document**: Update CLAUDE.md with new architectural patterns

## Definition of Done (per milestone)

**Code Migration Complete**:
- ✅ All methods/functions moved to new modules
- ✅ No code duplication (except compatibility shims with deprecation warnings)
- ✅ Imports updated across codebase
- ✅ ESLint/Pylint/Ruff passes with no new warnings

**Testing Complete**:
- ✅ Unit tests created or updated for all extracted modules
- ✅ Integration tests pass (full test suite)
- ✅ Golden workflows validated (all 5 pass)
- ✅ API contract verified (OpenAPI spec diff clean)

**Ownership Clarified**:
- ✅ Module ownership documented (which team owns which state controller)
- ✅ CODEOWNERS file updated (if applicable)
- ✅ Deprecation warnings added to old import paths

**Temporary Adapters Tracked**:
- ✅ All compatibility shims documented in DEPRECATIONS.md
- ✅ Removal tickets created for next release
- ✅ No untracked "temporary" code left behind

**Documentation Updated**:
- ✅ CLAUDE.md updated with new patterns
- ✅ Architecture diagrams updated
- ✅ Migration guide written for future extractions
- ✅ Inline code comments updated (no stale references)

**Operational Readiness**:
- ✅ Performance benchmarks recorded (baseline for comparison)
- ✅ Monitoring alerts verified (no false positives from refactor)
- ✅ Rollback plan documented (how to revert if needed)

---

## Appendix A: File Size Target Guidelines

Based on CLAUDE.md principle of "small files for LLM compatibility":

- **Ideal**: 200-500 lines (easy to reason about)
- **Acceptable**: 500-1,000 lines (focused single responsibility)
- **Problematic**: 1,000-2,000 lines (needs review)
- **Critical**: 2,000+ lines (must refactor)

---

## Appendix B: Method Distribution Example

**Current photocat-app.js** (135 methods):
```
Curate Home:     47 methods (35%)
Curate Audit:    28 methods (21%)
Other:           27 methods (20%)
Curate Explore:   9 methods (7%)
Rating:           7 methods (5%)
Navigation:       6 methods (4%)
Lists:            3 methods (2%)
Search:           1 method  (1%)
Hotspot:          1 method  (1%)
Queue:            6 methods (4%)
```

**After refactoring** (25 methods in photocat-app.js):
```
photocat-app.js:      25 methods (navigation, modals, global state)
curate-home-state:    47 methods (moved)
curate-audit-state:   28 methods (moved)
curate-explore-state:  9 methods (moved)
rating-modal-state:    7 methods (moved)
search-state:          3 methods (moved)
Utilities:            16 methods (shared/moved)
```

---

## Appendix C: Decision Log

1. Behavior-preserving modularization is the default; behavior changes require explicit scope and tests.
2. Ownership boundaries were set for `components/state/` vs `shared/state/` to prevent state drift.
3. Frontend state modules were standardized on Lit `ReactiveController`.
4. Curate Home extraction was switched from line-range migration to behavior-slice migration.
5. Template event wiring now uses stable handler references (no hot-path inline lambdas).
6. A required golden-workflows checklist was added as a stop/go gate after each extraction.
7. Frontend rollout moved from week-based to milestone checkpoints.
8. Backend shared helpers were centralized in `routers/images/_shared.py` before router splitting.
9. Backend extraction added one-release compatibility shims with explicit deprecation path.
10. Backend rollout order was adjusted to run `list_images` simplification last.
11. API-contract parity checks, operational metrics, and per-milestone definition-of-done were added.

---

**Document Version**: 1.2
**Last Updated**: 2026-02-09
**Owner**: Development Team
