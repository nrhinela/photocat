# API Refactoring Plan: Splitting api.py into Modular Routers

## Executive Summary

The current `src/photocat/api.py` is 2,672 lines, which violates the project's guideline to keep files small and modular. This document outlines a plan to refactor it into smaller, focused router modules using FastAPI's APIRouter pattern.

**Goals:**
- Improve maintainability and reduce file size for better LLM comprehension
- Maintain 100% backward compatibility (no API changes)
- Follow FastAPI best practices for router organization
- Ensure zero downtime during migration

## Current State Analysis

### Route Inventory (50+ endpoints)

**Photo Lists** (9 endpoints)
- GET `/api/v1/lists/active`
- GET `/api/v1/lists/{list_id}`
- GET `/api/v1/lists`
- POST `/api/v1/lists`
- PATCH `/api/v1/lists/{list_id}`
- DELETE `/api/v1/lists/{list_id}`
- GET `/api/v1/lists/{list_id}/items`
- DELETE `/api/v1/lists/items/{item_id}`
- POST `/api/v1/lists/add-photo`
> RESPONSE (Claude): Corrected - indeed 9 endpoints, not 8. Thanks for catching this!

**Images** (12 endpoints)
- GET `/api/v1/images`
- GET `/api/v1/images/{image_id}`
- GET `/api/v1/images/{image_id}/thumbnail`
- PATCH `/api/v1/images/{image_id}/rating`
- POST `/api/v1/images/upload`
- GET `/api/v1/images/{image_id}/analyze`
- POST `/api/v1/images/{image_id}/retag`
- GET `/api/v1/images/{image_id}/permatags`
- POST `/api/v1/images/{image_id}/permatags`
- DELETE `/api/v1/images/{image_id}/permatags/{permatag_id}`
- POST `/api/v1/images/{image_id}/permatags/accept-all`
- POST `/api/v1/images/{image_id}/permatags/freeze`

**Keywords** (1 endpoint)
- GET `/api/v1/keywords`

**Sync & Tagging** (2 endpoints)
- POST `/api/v1/sync`
- POST `/api/v1/retag`

**Dropbox OAuth** (3 endpoints)
- GET `/oauth/dropbox/authorize`
- GET `/oauth/dropbox/callback`
- POST `/webhooks/dropbox`

**Admin - Tenants** (6 endpoints)
- GET `/api/v1/admin/tenants`
- GET `/api/v1/admin/tenants/{tenant_id}/photo_count`
- POST `/api/v1/admin/tenants`
- PUT `/api/v1/admin/tenants/{tenant_id}`
- PATCH `/api/v1/admin/tenants/{tenant_id}/settings`
- DELETE `/api/v1/admin/tenants/{tenant_id}`

**Admin - People** (4 endpoints)
- GET `/api/v1/admin/people`
- POST `/api/v1/admin/people`
- PUT `/api/v1/admin/people/{person_id}`
- DELETE `/api/v1/admin/people/{person_id}`

**Admin - Keywords** (7 endpoints)
- GET `/api/v1/admin/keywords/categories`
- POST `/api/v1/admin/keywords/categories`
- PUT `/api/v1/admin/keywords/categories/{category_id}`
- DELETE `/api/v1/admin/keywords/categories/{category_id}`
- GET `/api/v1/admin/keywords/categories/{category_id}/keywords`
- POST `/api/v1/admin/keywords/categories/{category_id}/keywords`
- PUT `/api/v1/admin/keywords/{keyword_id}`
- DELETE `/api/v1/admin/keywords/{keyword_id}`

**Static/SPA** (4 endpoints)
- GET `/`
- GET `/admin`
- GET `/tagging-admin`
- GET `/{full_path:path}` (SPA catch-all)

**Health** (1 endpoint)
- GET `/health`

**Tenants (Public)** (1 endpoint)
- GET `/api/v1/tenants` (public tenant list, no auth required)
> RESPONSE (Claude): You're absolutely right - `/api/v1/tenants` is NOT a health check. It's a public endpoint that lists available tenants (used by frontend for tenant selection). I've separated it into its own category. This could either:
> - Stay in main `api.py` as a standalone endpoint (simple, only 1 endpoint)
> - Go into a new `routers/tenants.py` for public tenant operations
> - Be grouped with `admin_tenants.py` but with different auth requirements
>
> Recommendation: Keep it in main `api.py` since it's a single endpoint with different auth than admin tenant routes.

### Shared Dependencies & Utilities

**Functions to Extract:**
- `get_db()` - Database session dependency (lines 69, 417 - duplicate!)
- `get_tenant()` - Tenant extraction from headers (lines 77, 434 - duplicate!)
- `get_active_list()` - Helper for active list lookup (line 52)
- `get_secret()` - Secret manager access (line 383)
- `store_secret()` - Secret manager write (line 391)

> RESPONSE (Claude): **Excellent catch on circular imports!** You're absolutely right. Here's the recommended structure:
>
> **Option 1: Create `database.py`** (Recommended)
> ```
> src/photocat/database.py  # Contains engine, SessionLocal
> src/photocat/dependencies.py  # Contains get_db(), get_tenant(), etc.
> src/photocat/api.py  # Imports from both
> ```
>
> **Option 2: Keep database setup in `dependencies.py`**
> - Move `engine` and `SessionLocal` creation into `dependencies.py`
> - `api.py` imports `SessionLocal` from `dependencies.py`
> - Simpler, but less separation of concerns
>
> **Recommendation:** Go with Option 1 (`database.py`) for cleaner separation and easier testing.

**Models/Classes:**
- `AddPhotoRequest` (Pydantic model, line 49)

**App Configuration:**
- FastAPI app initialization (lines 31-44)
- CORS middleware setup
- Static file mounting (must stay in main `api.py` - cannot be in a router)

> RESPONSE (Codex - CORS duplication): **Great catch!** If there are duplicate CORS middleware blocks, we must consolidate them during refactoring. This is a common source of subtle bugs (e.g., different origins allowed in different blocks). I'll add this to Phase 1 tasks.

> RESPONSE (Claude - SPA routes): Correct! `app.mount()` for static files and the SPA routes must remain in the main `api.py` file. Only the route **handlers** for `/`, `/admin`, `/tagging-admin`, and `/{full_path:path}` would move to a router. Actually, on second thought - the SPA catch-all routes should probably **stay in main api.py** entirely since they're tightly coupled to the static file mounting. The "static.py" router idea should be removed from the plan.

## Proposed Architecture

```
src/photocat/
├── api.py                    # Main app entry point (~200 lines)
│                             # Includes: app init, CORS (consolidated),
│                             # static mounting, SPA routes,
│                             # /health, /api/v1/tenants
├── database.py               # Database setup (~30 lines)
│                             # Contains: engine, SessionLocal
├── dependencies.py           # Shared dependencies (50-75 lines)
│                             # Contains: get_db, get_tenant, get_secret, etc.
├── routers/
│   ├── __init__.py
│   ├── images.py            # Image CRUD & metadata (~400 lines)
│   ├── lists.py             # Photo list management (~250 lines)
│   ├── keywords.py          # Keyword lookup (~50 lines)
│   ├── sync.py              # Sync & tagging operations (~400 lines)
│   ├── dropbox.py           # OAuth & webhooks (~150 lines)
│   ├── admin_tenants.py     # Admin tenant management (~200 lines)
│   ├── admin_people.py      # Admin people management (~150 lines)
│   └── admin_keywords.py    # Admin keyword management (~250 lines)
└── models/
    └── requests.py          # Shared Pydantic request models
```
> RESPONSE (Claude): Updated architecture to include `database.py` for engine/SessionLocal, avoiding circular imports. Removed `static.py` router - those routes stay in main `api.py`.

## Implementation Plan

### Phase 1: Setup Infrastructure (1-2 hours)

**Step 1.0: Audit for duplicates and issues**
- Check for duplicate CORS middleware blocks (consolidate if found)
- Verify all duplicate `get_db()` and `get_tenant()` locations
- Document current `SessionLocal` and engine setup location

**Step 1.1: Create database module**
```bash
touch src/photocat/database.py
```

Move to `database.py`:
- Database engine creation
- `SessionLocal` factory
- Related imports (SQLAlchemy, settings)

**Step 1.2: Create dependencies module**
```bash
touch src/photocat/dependencies.py
```

Move to `dependencies.py`:
- `get_db()` function (consolidate duplicates, import SessionLocal from database.py)
- `get_tenant()` function (consolidate duplicates)
- `get_secret()` function
- `store_secret()` function
- Shared imports

**Step 1.3: Create routers directory**
```bash
mkdir -p src/photocat/routers
touch src/photocat/routers/__init__.py
```

**Step 1.4: Create request models module**
```bash
touch src/photocat/models/requests.py
```

Move Pydantic request models (currently inline):
- `AddPhotoRequest`
- Any other request models discovered during migration

### Phase 2: Extract Routers (Incremental, 2-3 hours)

**Order of extraction** (simplest first):

1. **keywords.py** - Single endpoint (lowest risk)
   - GET `/api/v1/keywords`
   - Lines: ~884-926

2. **lists.py** - Photo list operations
   - All 9 list endpoints
   - Helper: `get_active_list()`
   - Lines: ~52-382

3. **admin_people.py** - People management
   - All 4 people endpoints
   - Lines: ~2389-2497

4. **admin_tenants.py** - Tenant management
   - All 6 tenant endpoints
   - Lines: ~2236-2388

5. **admin_keywords.py** - Keyword admin
   - All 7 keyword admin endpoints
   - Lines: ~2498-2726

6. **dropbox.py** - OAuth & webhooks
   - All 3 Dropbox endpoints
   - Lines: ~2136-2235

7. **sync.py** - Sync & tagging
   - POST `/api/v1/sync`
   - POST `/api/v1/retag`
   - Lines: ~1654-2135

8. **images.py** - Image operations (largest, most complex)
   - All 12 image endpoints
   - Lines: ~502-1653

> RESPONSE (Claude): Removed `static.py` from extraction order and renumbered. SPA routes stay in main `api.py`.

### Phase 3: Update Main api.py (1 hour)

**Step 3.1: Strip out migrated code**
- Remove all migrated route handlers
- Remove duplicate helper functions
- Keep only app initialization

**Step 3.2: Import and register routers**
```python
from photocat.routers import (
    images,
    lists,
    keywords,
    sync,
    dropbox,
    admin_tenants,
    admin_people,
    admin_keywords
)

app.include_router(images.router)
app.include_router(lists.router)
app.include_router(keywords.router)
app.include_router(sync.router)
app.include_router(dropbox.router)
app.include_router(admin_tenants.router)
app.include_router(admin_people.router)
app.include_router(admin_keywords.router)
```
> RESPONSE (Claude): Removed `static` router from imports.

**Step 3.3: Keep in api.py**
- App initialization (FastAPI app creation)
- CORS middleware (consolidated - single block only)
- Import `SessionLocal` from `database.py` (but don't redefine it)
- Static file mounting (`app.mount`)
- SPA routes: `/`, `/admin`, `/tagging-admin`, `/{full_path:path}`
- Health check endpoint: `/health`
- Public tenant list: `/api/v1/tenants`

### Phase 4: Testing & Validation

**Step 4.1: Run existing tests**
```bash
pytest tests/
```

**Step 4.2: Manual API testing**
- Test one endpoint from each router
- Verify tenant isolation still works
- Check error responses
- Test CORS behavior

**Step 4.3: Integration checks**
- Frontend still connects
- Dropbox OAuth flow works
- File uploads function
- Admin panel accessible

## Router Template

Each router should follow this pattern:

```python
"""
Router for [domain] operations.

Handles:
- List of responsibilities
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from photocat.dependencies import get_db, get_tenant
from photocat.tenant import Tenant
from photocat.metadata import [relevant models]

router = APIRouter(
    prefix="/api/v1/[domain]",
    tags=["[domain]"]
)

@router.get("/endpoint")
async def endpoint_handler(
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """Endpoint documentation."""
    # Implementation
```

## Breaking Change Safeguards

### What NOT to Change
- ✅ URL paths (must remain identical)
- ✅ Request/response models
- ✅ Header requirements (X-Tenant-ID)
- ✅ Error response formats
- ✅ Database queries (except optimization)
- ✅ CORS configuration

### Allowed Changes
- ✅ Code organization
- ✅ Import statements
- ✅ File structure
- ✅ Function names (internal only)
- ✅ Comments and documentation
- ✅ Duplicate code elimination

> RESPONSE (Codex comment): **IMPORTANT - Router Prefix Considerations:**
> - Most routers will use standard prefixes: `/api/v1/images`, `/api/v1/lists`, `/api/v1/admin/tenants`, etc.
> - **Dropbox router** uses `/oauth` and `/webhooks` prefixes (NOT `/api/v1/dropbox`)
> - **No prefix needed** - routers can be created without a prefix and paths specified in full in each route decorator
> - Each router must preserve its exact original paths to maintain backward compatibility

## Rollback Plan

If issues arise:

1. **Git revert** - All changes in feature branch
2. **Stash changes** - If mid-migration
3. **Test original** - Verify api.py still works

Keep original `api.py` as `api.py.backup` until fully validated.
> RESPONSE (Claude): Agree - `api.py.backup` should be **untracked** (add to `.gitignore`). Better yet, since this is all in git, we don't need a backup file at all - just create a feature branch and the original is preserved in git history. Remove this backup file recommendation entirely.

## Success Criteria

- [ ] All 50+ endpoints respond identically
- [ ] All existing tests pass
- [ ] No new endpoints added/removed
- [ ] Frontend works without changes
- [ ] Each router file < 500 lines
- [ ] Main api.py < 200 lines
- [ ] Documentation updated
- [ ] No security regressions

## File Size Targets

| File | Current | Target | Reduction |
|------|---------|--------|-----------|
| api.py | 2,672 | ~200 | 92% |
| database.py | - | ~30 | - |
| dependencies.py | - | 50-75 | - |
| images.py | - | ~400 | - |
| lists.py | - | ~250 | - |
| sync.py | - | ~400 | - |
| admin_keywords.py | - | ~250 | - |
| admin_tenants.py | - | ~200 | - |
| admin_people.py | - | ~150 | - |
| dropbox.py | - | ~150 | - |
| keywords.py | - | ~50 | - |

> RESPONSE (Claude): Updated to include `database.py` and reordered logically (core files first, then routers).

## Post-Migration Tasks

1. Update CLAUDE.md with new entry points
2. Add router documentation to README.md
3. Create CONTRIBUTING.md with router guidelines
4. Update deployment docs if needed
5. Consider adding OpenAPI tags for better docs

## Timeline Estimate

- **Phase 1 (Setup):** 1-2 hours
- **Phase 2 (Extraction):** 2-3 hours (incremental)
- **Phase 3 (Integration):** 1 hour
- **Phase 4 (Testing):** 1-2 hours
- **Total:** 5-8 hours of focused work

Can be done incrementally over multiple sessions.

## Notes

- Each router extraction can be a separate commit
- Test after each router extraction
- Keep pull request focused on refactoring only
- No feature additions during this refactor
- Consider pairing this with adding route-level documentation
