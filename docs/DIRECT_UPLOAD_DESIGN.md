# Direct Upload Design (No External Provider)

## Goal
Enable users to upload photos directly from the browser into Zoltag without Dropbox/Drive, while storing:

- Original files (full resolution)
- Thumbnails
- Standard metadata (`Asset`, `ImageMetadata`)

The upload UX must support efficient multi-file uploads with progress and retries.

## Current System Fit
The design intentionally reuses existing components:

- Ingestion pipeline: `src/zoltag/sync_pipeline.py`
- Storage key helpers: `src/zoltag/tenant/__init__.py`
- Provider abstraction: `src/zoltag/storage/providers.py`
- Existing upload UI surface: `frontend/components/upload-modal.js`
- Current analyze-only endpoint: `src/zoltag/routers/images/tagging.py` (`POST /images/upload`)

<!-- REVIEW: sync_pipeline.py expects a ProviderEntry + StorageProvider instance. For Phase 1
     (server multipart), you can bypass the pipeline entirely and call ImageProcessor directly,
     then write Asset/ImageMetadata rows manually — the pipeline isn't really reused, it's
     reproduced inline. If you want true reuse, create a thin adapter that wraps the in-memory
     bytes as a ManagedStorageProvider before calling process_storage_entry(). -->
<!-- RESPONSE: Accepted. Phase 1 will use direct ImageProcessor + DB writes, and the doc should
     treat pipeline reuse as Phase 2 unless we add a ManagedStorageProvider adapter first. -->

<!-- REVIEW: The existing upload-modal.js is purely a test-tagging surface — it never saves to DB
     and has no progress tracking. Splitting it into "Test Tagging" vs "Upload to Library" in the
     same modal will make the component significantly more complex. Consider extracting the
     persistent-upload flow into a separate component and keeping upload-modal.js as-is. -->
<!-- RESPONSE: Accepted. Keep upload-modal.js as test-tagging only and build a separate
     upload-library component for persistent ingest. -->

## Core Design

### 1) Add a managed internal provider
Introduce a new storage provider identity:

- `source_provider = "managed"`
- `source_key = <GCS object key for original file>`

`managed` means "Zoltag-owned object in tenant storage bucket."

<!-- REVIEW: "managed" is a reasonable name. Alternatives: "web-upload", "direct". The main
     constraint is that once you pick a value it's in the DB forever; make sure it's added to
     any enum/validation lists in the codebase and documented. -->
<!-- RESPONSE: Accepted. We will keep "managed" and explicitly document/validate it in provider
     dispatch and any source-provider validation paths. -->

### 2) Persist originals + thumbnails
For each uploaded file:

1. Upload original bytes to tenant storage bucket using canonical key:
   - `tenants/{tenant_id}/assets/{asset_uuid}/{original_filename}`
2. Create/update `Asset` row with:
   - `source_provider="managed"`
   - `source_key=<object key>`
   - `thumbnail_key=<generated thumbnail key>`
3. Run existing feature extraction/EXIF path and write `ImageMetadata`
4. Store thumbnail in thumbnail bucket using existing helper key pattern

<!-- REVIEW: Step ordering matters. Persist the GCS object BEFORE writing the DB rows.
     If the DB write succeeds but GCS upload fails, you have a dangling Asset with no
     backing file. Preferred order: (1) upload to GCS → (2) write DB → (3) generate thumbnail.
     On failure after step 1, clean up the GCS object (or accept the orphan and rely on
     a periodic GCS reconciliation job). -->
<!-- RESPONSE: Accepted. Final order will be upload original -> write DB -> generate/write
     thumbnail, with explicit cleanup/reconciliation policy for post-upload failures. -->
<!-- REVIEW-2: Clarification on the accepted order — "upload original -> write DB -> generate
     thumbnail" is correct, but note that thumbnail generation requires reading the original
     back from GCS (or from the in-memory bytes still in scope). In Phase 1 (server multipart),
     the original bytes are still in memory when the upload handler runs, so pass them directly
     to ImageProcessor rather than re-downloading from GCS. This avoids an extra round-trip and
     keeps Phase 1 latency tight. -->
<!-- RESPONSE: Accepted. In Phase 1 multipart flow we will process thumbnails from in-memory
     bytes immediately after upload/write, avoiding a second GCS read. In Phase 2 async finalize,
     thumbnail generation will read from GCS since in-memory bytes are no longer available. -->

<!-- REVIEW: "Create/update Asset row" — the update case is the dedup path; keep
     it separate and don't conflate it with the happy path here. The base case is always
     insert-only. -->
<!-- RESPONSE: Accepted. The doc will separate insert-only happy path from dedup/update path. -->

<!-- REVIEW: Thumbnail should go into the *thumbnail* bucket (tenant.get_thumbnail_bucket()),
     not the main storage bucket. The Asset.thumbnail_key points there. The existing helper
     key pattern (tenant.get_asset_thumbnail_key()) already handles this. -->
<!-- RESPONSE: Accepted. Thumbnail writes remain in tenant thumbnail bucket with existing helper
     key generation. -->

### 3) Reuse provider abstraction for reads
Implement `ManagedStorageProvider` in `src/zoltag/storage/providers.py` so existing full-image routes can fetch managed originals through the same provider mechanism used by Dropbox/Drive.

<!-- REVIEW: This is the right call. The existing full-image serving routes
     (GET /images/{id}/full, GET /images/{id}/download) use resolve_image_storage() to dispatch
     to a provider. Without ManagedStorageProvider, managed uploads will return 409/404 from
     those routes. Implement download_file() as a GCS object read using the source_key.
     get_thumbnail() can return None (thumbnail is already in GCS, served directly). -->
<!-- RESPONSE: Accepted. ManagedStorageProvider is required in Phase 1 scope so uploads are
     immediately compatible with existing read/full-image routes. -->

## Upload API Design

### Preferred (Phase 2, scalable): direct-to-GCS

1. `POST /api/v1/uploads/sessions`
   - Input: list of files (name, size, mime, optional checksum)
   - Output per file:
     - upload URL (signed resumable)
     - planned `asset_id`
     - planned `source_key`
     - session/file token

2. Browser uploads files directly to GCS in parallel (3-6 concurrency).

3. `POST /api/v1/uploads/sessions/{session_id}/complete`
   - Confirms uploaded objects
   - Enqueues ingest jobs
   - Returns accepted/failed items

4. `GET /api/v1/uploads/sessions/{session_id}`
   - Returns status per file (`uploading`, `queued`, `processing`, `done`, `failed`)

<!-- REVIEW: The sessions API is well-designed. A few gaps to address:

     - Session expiry: sessions need a TTL (e.g. 24h). What happens to pre-created assets and
       signed URLs if the user abandons the session? Add a cleanup job or store sessions in a
       table with expires_at.

     - The "planned asset_id" in the session response leaks an internal UUID to the client before
       the file is committed. That's fine, but document that the asset only becomes visible after
       /complete succeeds.

     - Signed resumable URLs from GCS have a max lifetime of 7 days. For most upload flows
       1 hour is sufficient. Make this configurable.

     - /complete should be idempotent: if called twice for the same session, return the same
       result rather than enqueueing duplicate jobs. Use a unique constraint on
       (session_id, source_key) or check status before enqueuing. -->
<!-- RESPONSE: Accepted. Add explicit session TTL/expiry behavior, visibility semantics for
     planned asset IDs, configurable signed URL TTL, and idempotent complete semantics. -->

<!-- REVIEW: No UploadSession DB model is described. You'll need one to persist session state
     and file tokens for /complete and status polling. Columns at minimum:
     id, tenant_id, created_at, expires_at, status, files (JSONB or child table). -->
<!-- RESPONSE: Accepted. Add UploadSession persistence model (plus migration) as a formal
     Phase 2 prerequisite. -->

### Fast path (Phase 1, quick to ship): server multipart
Add `POST /api/v1/images/upload-and-ingest` (multipart) that writes originals + metadata synchronously/asynchronously. Keep response contract compatible with later session-based API.

<!-- REVIEW: A new endpoint path is cleaner than overloading the existing POST /images/upload,
     which has different semantics (analyze-only, no DB writes). Keeping them separate avoids
     adding a "save=true" flag that complicates the existing test-tagging flow.

     For Phase 1 the endpoint will block while writing to GCS + DB. On Cloud Run with a
     single instance and a 1Gi memory limit, uploading multiple large RAW files synchronously
     will hit the 30s timeout or memory limit. Consider accepting files one at a time in Phase 1
     and letting the frontend handle concurrency, rather than a multi-file multipart in a
     single request.

     Cloud Run has a request body size limit of 32MB by default (configurable up to 2GB for
     HTTP/2 streaming). For RAW files this will likely be a problem before Phase 2 ships. -->
<!-- RESPONSE: Accepted. Keep analyze-only and upload-and-ingest endpoints separate; for Phase 1
     prefer one-file-per-request with frontend concurrency and conservative upload caps. -->

## Frontend UX Design

## Entry point
Use the existing modal (`frontend/components/upload-modal.js`) and split actions:

- `Test Tagging` (current behavior)
- `Upload to Library` (new persistent flow)

<!-- REVIEW: As noted above, the modal handles two very different flows with different
     state machines. Recommend keeping upload-modal.js for test-tagging and building a
     separate upload-library-modal.js (or upload-panel.js). Shared file-picker logic can
     be extracted to a small utility. -->
<!-- RESPONSE: Accepted. We will split into distinct components and only share file-picker helpers. -->

## Upload UX requirements
- Multi-file select + drag/drop
- Per-file progress bar and aggregate progress
- Parallel uploads with bounded concurrency
- Retry failed files
- Cancel pending uploads
- Status chips per file: `queued`, `uploading`, `processing`, `done`, `failed`

<!-- REVIEW: These are the right requirements. Implementation notes:
     - For Phase 1 (server multipart), fetch() does not expose upload progress — use XMLHttpRequest
       with progress events instead, or the Streams API if targeting modern browsers only.
     - For Phase 2 (direct-to-GCS resumable), GCS supports Range-based progress queries on
       resumable upload sessions, or just use XHR progress on the PUT.
     - "Cancel pending uploads" requires aborting the XHR/fetch and calling a DELETE on the
       session or file token to release any pre-allocated asset_id. -->
<!-- RESPONSE: Accepted. Phase 1 progress will use XHR; cancel semantics will include client-side
     abort and server-side release/cleanup where applicable. -->

## Data and Model Considerations

### Asset uniqueness and idempotency
- Use per-file idempotency token (session file token) during finalize.
- If finalize is retried, avoid duplicate `Asset`/`ImageMetadata`.

<!-- REVIEW: The simplest idempotency mechanism is a unique constraint on
     (tenant_id, source_provider, source_key). Since source_key is server-generated and
     deterministic per session file token, a retry will hit the constraint and you can
     return the existing row instead of erroring. No separate idempotency token table needed. -->
<!-- RESPONSE: Accepted. Prefer DB uniqueness + retry-safe fetch-existing behavior over a separate
     idempotency-token store. -->

### Dedup strategy (recommended)
- Optional content hash compare (`tenant_id + hash`) before ingest completion.
- Configurable policy:
  - `keep_both`
  - `skip_duplicate`
  - `link_existing`

<!-- REVIEW: content_hash is already stored on ImageMetadata. A query on (tenant_id, content_hash)
     before inserting handles the dedup check with no schema changes. However, "link_existing"
     (two display names for one asset) adds complexity that isn't supported today — Asset has
     a 1:1 relationship with ImageMetadata. Start with keep_both and skip_duplicate only.
     link_existing can be deferred to Phase 3. -->
<!-- RESPONSE: Accepted. Initial dedup policies will be keep_both and skip_duplicate only; defer
     link_existing to a later model change. -->

### Metadata timestamps
For uploaded files, preserve timestamp strategy already used in analytics/insights:

- `capture_timestamp` from EXIF when present
- fallback to file/object modified time
- fallback to row creation time

<!-- REVIEW: This is correct and matches sync_pipeline.py's existing logic. The EXIF path
     is already handled by ImageProcessor.extract_features(). No changes needed here. -->
<!-- RESPONSE: Accepted. No design change required for timestamp derivation. -->

## Security and Isolation

- Tenant prefix enforcement on all object keys (server generated keys only).
- Validate mime type, extension, file size, and max file count.
- Use short-lived signed upload URLs.
- Authorize all session/finalize endpoints via tenant membership.
- Never accept client-provided arbitrary `source_key`.

<!-- REVIEW: Good list. Two additions:
     - Validate that the GCS object key in /complete actually starts with the expected tenant
       prefix (tenants/{tenant_id}/...) before treating it as confirmed. Signed URLs prevent
       writing to the wrong path, but defense-in-depth on /complete is cheap.
     - For Phase 1 (server multipart), also validate magic bytes / file header, not just MIME
       type and extension — browsers can send any Content-Type with any file. The existing
       ImageProcessor.is_supported() checks extension; add a header check. -->
<!-- RESPONSE: Accepted. Add tenant-prefix validation during finalize and file-signature checks
     for server multipart ingestion. -->

## Processing Model

Use async ingestion (Cloud Tasks or worker queue) after upload completion:

1. Validate object exists and readable.
2. Download/process image bytes.
3. Generate thumbnail + metadata.
4. Persist DB rows.
5. Emit completion status.

This keeps API latency stable for large batches.

<!-- REVIEW: There is no Cloud Tasks infrastructure in the current codebase — no
     CloudTasksClient usage, no queue definitions, no task handlers. This is a prerequisite
     for Phase 2 async ingestion, not a free assumption. You'll need to:
     - Add google-cloud-tasks to dependencies
     - Create the queue in GCP
     - Write a task handler endpoint (authenticated, not publicly accessible)
     - Handle retries and idempotency in the handler

     For Phase 1, synchronous processing in the request handler is fine for the file sizes
     and volumes expected. Add a note that Phase 1 is synchronous and that async is a Phase 2
     concern. -->
<!-- RESPONSE: Accepted. Phase 1 is synchronous; Cloud Tasks and async task handler are explicit
     Phase 2 prerequisites. -->

## Observability

Track:

- Upload session duration
- Per-file upload duration
- Queue wait time
- Ingest processing time
- Failure rates by reason (`validation`, `storage`, `processing`, `db`)

Expose minimal admin/debug endpoint or logs keyed by session ID.

<!-- REVIEW: No observability infrastructure exists today (no metrics, no structured logging
     beyond uvicorn's default output). For Phase 1, structured log lines in the upload handler
     (with tenant_id, session_id, file count, duration) are sufficient and zero-cost. Defer
     metrics and the admin endpoint to Phase 2 alongside the session model. -->
<!-- RESPONSE: Accepted. Start with structured logs in Phase 1; add metrics/admin diagnostics
     in Phase 2. -->

## Rollout Plan

### Phase 1 (quick delivery)
- Add multipart persistent upload endpoint.
- Write originals to storage + thumbnails + DB rows.
- Basic multi-file UI with progress (XHR/fetch progress where available).

<!-- REVIEW: Add to Phase 1 scope: implement ManagedStorageProvider so uploaded files
     are immediately viewable/downloadable via existing image routes. Without it, uploaded
     assets will appear in the gallery but GET /images/{id}/full will 409. -->
<!-- RESPONSE: Accepted. ManagedStorageProvider is now considered Phase 1 mandatory scope. -->

### Phase 2 (production-grade scale)
- Add upload sessions + signed resumable URLs.
- Direct browser-to-GCS upload.
- Async finalize + status polling.

<!-- REVIEW: Phase 2 implicitly requires: UploadSession DB model + migration,
     Cloud Tasks queue + handler, and session TTL/cleanup job. List these as explicit
     prerequisites rather than leaving them implicit. -->
<!-- RESPONSE: Accepted. These are explicit Phase 2 prerequisites. -->

### Phase 3 (optimization)
- Dedup policy
- Optional background embeddings/tagging triggers
- Bulk retry and partial-failure recovery tooling

## Open Questions

1. Maximum single file size and total batch size limits?
2. Required dedup behavior for professional workflows?
3. Should uploads be available to all tenant users or admin/editor only?
4. Should ingest block on tagging/embeddings or defer them?

<!-- REVIEW: Suggested answers based on current constraints:
     1. Phase 1: cap at ~20MB/file and 10 files/request (Cloud Run body limit + memory).
        Phase 2: GCS resumable handles up to 5TB/file; set a practical per-tenant quota.
     2. Start with skip_duplicate using content_hash. Professional workflows rarely want
        silent deduplication — surface it to the user.
     3. Restrict to users with 'editor' or 'admin' role in the tenant. Viewers shouldn't
        be able to add to the library.
     4. Defer tagging/embeddings. Return the image_id immediately after DB write; tagging
     can be triggered by the existing /retag endpoint or a background job. Blocking on
     tagging would make upload latency unpredictable. -->
<!-- RESPONSE: Accepted as baseline defaults: conservative Phase 1 size limits, role-gated
     uploads for editor/admin, dedup surfaced to users, and deferred tagging/embeddings. -->
