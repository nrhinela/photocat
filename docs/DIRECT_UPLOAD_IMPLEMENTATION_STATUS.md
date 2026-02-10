# Direct Upload Implementation Status

## Scope
Implement Phase 1 direct uploads (no external provider) based on `DIRECT_UPLOAD_DESIGN.md`, with milestone tracking updated during execution.

## Milestones

| Milestone | Description | Status | Notes |
| --- | --- | --- | --- |
| M1 | Plan + tracking doc created | Completed | Tracking doc added and maintained during implementation |
| M2 | Backend persistent upload endpoint (`/api/v1/images/upload-and-ingest`) | Completed | Single-file multipart with validation, dedup policy, original + thumbnail + DB writes |
| M3 | Managed storage provider support | Completed | Added `ManagedStorageProvider` + provider dispatch support |
| M4 | Frontend upload-to-library UI + API wiring | Completed | New `upload-library-modal` with parallel uploads and per-file progress |
| M5 | Verification + cleanup | Completed | Python compile checks + frontend production build succeeded |

## Progress Log

- 2026-02-10: Started implementation. Creating milestone plan and beginning backend work.
- 2026-02-10: Implemented backend endpoint `POST /api/v1/images/upload-and-ingest` in `src/photocat/routers/images/tagging.py`.
- 2026-02-10: Added managed provider support in `src/photocat/storage/providers.py` and exports in `src/photocat/storage/__init__.py`.
- 2026-02-10: Added `frontend/components/upload-library-modal.js` and wired events through tagging admin and app overlays.
- 2026-02-10: Verified changes with `py_compile` on changed Python modules and `npm run build`.

## Delivered Changes

- Backend
  - New endpoint: `/api/v1/images/upload-and-ingest`
  - Validates:
    - supported extension
    - non-empty payload
    - 20 MB Phase 1 max file size
    - image content header via PIL verify
  - Supports dedup policy query param:
    - `keep_both` (default)
    - `skip_duplicate` (checks `ImageMetadata.content_hash`)
  - Persists:
    - original object to tenant storage bucket
    - thumbnail to tenant thumbnail bucket
    - `Asset` (`source_provider=managed`)
    - `ImageMetadata` row with EXIF-derived fields
  - Cleans up uploaded objects if DB persistence fails.

- Storage provider abstraction
  - Added `ManagedStorageProvider` for `source_provider=managed`:
    - `download_file()` reads original bytes from GCS by `source_key`
    - `get_entry()` exposes blob metadata in `ProviderEntry`
    - wired into `create_storage_provider()`

- Frontend
  - New dedicated modal: `upload-library-modal` (separate from test-tagging modal)
  - Features:
    - multi-file queue
    - dedup policy selector
    - parallel uploads (3 workers)
    - per-file progress (XHR upload progress events)
    - cancel uploads / remove queued items
  - UI wiring:
    - `tagging-admin` now has `Upload` and `Test` actions
    - new app handlers: open/close/complete for upload library modal
    - overlay rendering updated to include `upload-library-modal`
