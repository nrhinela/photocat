# Tag Audit Bug Fix: NULL Rating Handling in Filter Logic

**Status**: Fixed ✅
**Date**: 2026-01-21
**Commit**: `b8b6f07`
**Related Issue**: Tag Audit showing "0 OF 0" images when filtering by permatags with `hide_zero_rating=true`

---

## Problem Statement

Tag Audit feature was displaying "0 OF 0" images when:
1. User selects a permatag keyword (e.g., "contact-juggling")
2. `hide_zero_rating` filter is enabled (enabled by default)
3. Expected: 2 images with that permatag should be shown
4. Actual: 0 images shown

### User-Visible Symptoms

Screenshot showing the issue:
- Keyword selector: "contact-juggling (2)" - indicating 2 images have this tag
- Tag Audit result: "HAS CONTACT-JUGGLING: 0 OF 0 - No images available"
- Query parameters: `hide_zero_rating=true&permatag_keyword=contact-juggling&permatag_signum=1`

---

## Root Cause Analysis

### Step 1: Query Builder Investigation ✓
Tested `build_image_query_with_subqueries()` with just permatag filter:
```python
base_query, sq_list, empty = build_image_query_with_subqueries(
    db, tenant,
    permatag_keyword='contact-juggling',
    permatag_signum=1
)
result = base_query.count()  # Returns 2 ✓
```

**Result**: Query builder works correctly with permatag filter alone.

### Step 2: Combined Filter Investigation ✗
Tested `build_image_query_with_subqueries()` with permatag + hide_zero_rating:
```python
base_query, sq_list, empty = build_image_query_with_subqueries(
    db, tenant,
    hide_zero_rating=True,
    permatag_keyword='contact-juggling',
    permatag_signum=1
)
result = base_query.count()  # Returns 0 ✗
```

**Result**: Combined filters return 0 results.

### Step 3: Image Rating Analysis
Checked the ratings of the 2 images with "contact-juggling" permatag:
```
Image ID 1306: rating=NULL, filename=PXL_20250208_002322541.jpg
Image ID 298:  rating=NULL, filename=KendalJBushPhoto34337.jpg
```

**Key Finding**: Both images have `rating=NULL` (not rated yet by user).

### Step 4: SQL NULL Comparison Issue
The `apply_hide_zero_rating_filter_subquery()` function uses:
```python
ImageMetadata.rating != 0  # Generates: rating != 0
```

In SQL, `NULL != 0` evaluates to `UNKNOWN` (which behaves like FALSE in a WHERE clause):
```sql
-- In SQL:
NULL != 0  → UNKNOWN
UNKNOWN in WHERE → row is NOT included
```

Therefore, the filter correctly includes:
- Ratings with value 1, 2, 3, etc.
- Ratings with value 0... wait, NO - it excludes 0

But it EXCLUDES:
- Ratings with value NULL ← **BUG: Should be included**

### Step 5: Original Materialized Version
The original `apply_hide_zero_rating_filter()` (materialized approach):
```python
zero_rating_ids = db.query(ImageMetadata.id).filter(
    ImageMetadata.tenant_id == tenant.id,
    ImageMetadata.rating == 0  # Gets only images with rating = 0
).all()
zero_ids = {row[0] for row in zero_rating_ids}

# Get all images
all_image_ids = db.query(ImageMetadata.id).filter(
    ImageMetadata.tenant_id == tenant.id
).all()
# Return: all_images - zero_rated_images
return {row[0] for row in all_image_ids} - zero_ids
```

This logic **implicitly includes NULL** because:
1. It gets images where `rating = 0` only
2. It subtracts those from ALL images
3. NULL images are NOT in the "where rating = 0" set
4. So NULL images end up in the result ✓

---

## The Fix

### Before (Incorrect)
```python
return db.query(ImageMetadata.id).filter(
    ImageMetadata.tenant_id == tenant.id,
    ImageMetadata.rating != 0  # Excludes NULL values
).subquery()
```

### After (Correct)
```python
from sqlalchemy import or_
return db.query(ImageMetadata.id).filter(
    ImageMetadata.tenant_id == tenant.id,
    or_(ImageMetadata.rating != 0, ImageMetadata.rating.is_(None))
).subquery()
```

**Logic**: Include images where rating is NOT zero OR rating IS NULL

---

## Verification

### Test 1: Permatag Filter Only
```python
base_query, sq, empty = build_image_query_with_subqueries(
    db, tenant,
    permatag_keyword='contact-juggling',
    permatag_signum=1
)
count = base_query.count()  # Expected: 2, Got: 2 ✓
```

### Test 2: Permatag + hide_zero_rating (After Fix)
```python
base_query, sq, empty = build_image_query_with_subqueries(
    db, tenant,
    hide_zero_rating=True,
    permatag_keyword='contact-juggling',
    permatag_signum=1
)
count = base_query.count()  # Expected: 2, Got: 2 ✓ (was 0 before)
```

### Test 3: Full Endpoint Scenario
```
GET /api/v1/images?hide_zero_rating=true&permatag_keyword=contact-juggling&permatag_signum=1

Before: {"images":[], "total":0}  ✗
After:  {"images":[{id:298,...}, {id:1306,...}], "total":2}  ✓
```

---

## Impact Analysis

### Affected Scenarios
1. **Tag Audit with Unrated Images**: Any permatag containing images with NULL ratings would show 0 results ✗
2. **Combined Filters**: Any query combining permatag + hide_zero_rating with unrated images ✗
3. **User Workflow**: Cannot verify/manage tags for images they haven't rated yet ✗

### Scope
- Affects all users of Tag Audit feature
- Only manifests when:
  - Using permatag filters AND
  - `hide_zero_rating` is enabled (default) AND
  - Images with those permatags have no rating (NULL)

### Severity
- **High**: Completely breaks workflow for unrated images
- **User-Visible**: Shows "0 OF 0" instead of correct count
- **Common Scenario**: Users tag first, rate later

---

## SQL Demonstration

### The NULL Problem in SQL
```sql
-- This query EXCLUDES NULL ratings:
SELECT id FROM images WHERE rating != 0;
-- Returns: 1, 2, 3, 4 (ratings 1,2,3)
-- Excludes: NULL ratings

-- This query INCLUDES NULL ratings:
SELECT id FROM images WHERE rating != 0 OR rating IS NULL;
-- Returns: 1, 2, 3, 4, 5 (ratings 1,2,3, and NULLs)
-- Correct behavior!
```

---

## Code Changes

### File: src/photocat/routers/filtering.py
**Function**: `apply_hide_zero_rating_filter_subquery()` (Lines 535-552)

**Change**: Added `or_()` clause to include NULL ratings

```python
from sqlalchemy import or_  # Added import

def apply_hide_zero_rating_filter_subquery(
    db: Session,
    tenant: Tenant
) -> Selectable:
    """Return subquery excluding images with zero rating (not materialized)."""
    return db.query(ImageMetadata.id).filter(
        ImageMetadata.tenant_id == tenant.id,
        or_(ImageMetadata.rating != 0, ImageMetadata.rating.is_(None))  # Fixed
    ).subquery()
```

---

## Test Results

### Before Fix
```
Test 1: Permatag only           → 2 images ✓
Test 2: Permatag + hide_zero    → 0 images ✗ FAIL
```

### After Fix
```
Test 1: Permatag only           → 2 images ✓
Test 2: Permatag + hide_zero    → 2 images ✓ FIXED
All 11 equivalence tests        → PASS ✓
```

---

## Lessons Learned

### SQL NULL Handling
In SQL, NULL comparisons behave differently:
- `NULL = 0` → UNKNOWN (not TRUE, not FALSE)
- `NULL != 0` → UNKNOWN (not TRUE, not FALSE)
- `NULL IS NULL` → TRUE ✓
- `value != 0 OR value IS NULL` → Matches non-zero and NULL values ✓

### SQLAlchemy Patterns
**Wrong**:
```python
filter(Model.column != value)  # Excludes NULL
```

**Right**:
```python
from sqlalchemy import or_
filter(or_(Model.column != value, Model.column.is_(None)))
```

### Testing Strategy
The issue only manifested with:
1. A specific data state (unrated images with permatags)
2. A specific filter combination (permatag + hide_zero_rating)
3. A specific use case (Tag Audit)

**Recommendation**: Add integration tests combining multiple filters with edge cases like NULL ratings.

---

## Related Issues

- Previous commits in this session identified 4 other critical bugs in Phase 2.2
- All related to SQLAlchemy subquery handling
- Now all 5 bugs have been identified and fixed

---

## Commit Information

- **Commit Hash**: `b8b6f07`
- **Files Modified**: 1 (src/photocat/routers/filtering.py)
- **Lines Changed**: 2 (added `or_()` clause)
- **Test Status**: All 11 tests passing
- **Production Ready**: Yes, ready for deployment

