"""FastAPI application entry point."""

from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, RedirectResponse
from typing import Optional, List
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from google.cloud import storage
from google.cloud import secretmanager
import io
import json

from photocat.tenant import Tenant, TenantContext
from photocat.settings import settings
from photocat.metadata import ImageMetadata, ImageTag, DropboxCursor
from photocat.image import ImageProcessor
from photocat.config import TenantConfig
from photocat.tagging import get_tagger
from photocat.dropbox import DropboxClient, DropboxWebhookValidator

app = FastAPI(
    title="PhotoCat",
    description="Multi-tenant image organization and search utility",
    version="0.1.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Database setup
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)


def get_secret(secret_id: str) -> str:
    """Get secret from Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{settings.gcp_project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode('UTF-8')


def store_secret(secret_id: str, value: str) -> None:
    """Store secret in Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    parent = f"projects/{settings.gcp_project_id}"
    
    try:
        # Try to create secret
        secret = client.create_secret(
            request={
                "parent": parent,
                "secret_id": secret_id,
                "secret": {"replication": {"automatic": {}}},
            }
        )
    except Exception:
        # Secret already exists
        pass
    
    # Add version
    parent_secret = f"projects/{settings.gcp_project_id}/secrets/{secret_id}"
    client.add_secret_version(
        request={
            "parent": parent_secret,
            "payload": {"data": value.encode('UTF-8')},
        }
    )


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_tenant(x_tenant_id: Optional[str] = Header(None)) -> Tenant:
    """Extract and validate tenant from request headers."""
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-ID header required")
    
    tenant = Tenant(id=x_tenant_id, name=f"Tenant {x_tenant_id}")
    TenantContext.set(tenant)
    
    return tenant


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the web interface."""
    html_file = static_dir / "index.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text())
    return {"name": "PhotoCat", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/v1/images")
async def list_images(
    tenant: Tenant = Depends(get_tenant),
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List images for tenant."""
    images = db.query(ImageMetadata).filter_by(
        tenant_id=tenant.id
    ).order_by(
        ImageMetadata.id.desc()
    ).limit(limit).offset(offset).all()
    
    total = db.query(ImageMetadata).filter_by(tenant_id=tenant.id).count()
    
    # Get tags for all images
    image_ids = [img.id for img in images]
    tags = db.query(ImageTag).filter(
        ImageTag.image_id.in_(image_ids),
        ImageTag.tenant_id == tenant.id
    ).all()
    
    # Group tags by image_id
    tags_by_image = {}
    for tag in tags:
        if tag.image_id not in tags_by_image:
            tags_by_image[tag.image_id] = []
        tags_by_image[tag.image_id].append({
            "keyword": tag.keyword,
            "category": tag.category,
            "confidence": round(tag.confidence, 2)
        })
    
    return {
        "tenant_id": tenant.id,
        "images": [
            {
                "id": img.id,
                "filename": img.filename,
                "width": img.width,
                "height": img.height,
                "format": img.format,
                "file_size": img.file_size,
                "dropbox_path": img.dropbox_path,
                "camera_make": img.camera_make,
                "camera_model": img.camera_model,
                "lens_model": img.lens_model,
                "iso": img.iso,
                "aperture": img.aperture,
                "capture_timestamp": img.capture_timestamp.isoformat() if img.capture_timestamp else None,
                "modified_time": img.modified_time.isoformat() if img.modified_time else None,
                "thumbnail_path": img.thumbnail_path,
                "tags_applied": img.tags_applied,
                "faces_detected": img.faces_detected,
                "tags": sorted(tags_by_image.get(img.id, []), key=lambda x: x['confidence'], reverse=True)
            }
            for img in images
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@app.get("/api/v1/images/{image_id}")
async def get_image(
    image_id: int,
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """Get image details with signed thumbnail URL."""
    image = db.query(ImageMetadata).filter_by(
        id=image_id,
        tenant_id=tenant.id
    ).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get tags
    tags = db.query(ImageTag).filter(
        ImageTag.image_id == image_id,
        ImageTag.tenant_id == tenant.id
    ).all()
    
    return {
        "id": image.id,
        "filename": image.filename,
        "width": image.width,
        "height": image.height,
        "format": image.format,
        "file_size": image.file_size,
        "dropbox_path": image.dropbox_path,
        "camera_make": image.camera_make,
        "camera_model": image.camera_model,
        "perceptual_hash": image.perceptual_hash,
        "thumbnail_path": image.thumbnail_path,
        "tags": [{"keyword": t.keyword, "category": t.category, "confidence": round(t.confidence, 2)} for t in tags],
        "exif_data": image.exif_data,
    }


@app.get("/api/v1/images/{image_id}/thumbnail")
async def get_thumbnail(
    image_id: int,
    db: Session = Depends(get_db)
):
    """Get image thumbnail from Cloud Storage with aggressive caching."""
    image = db.query(ImageMetadata).filter_by(
        id=image_id
    ).first()
    
    if not image or not image.thumbnail_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    
    try:
        storage_client = storage.Client(project=settings.gcp_project_id)
        bucket = storage_client.bucket(settings.thumbnail_bucket)
        blob = bucket.blob(image.thumbnail_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="Thumbnail not found in storage")
        
        thumbnail_data = blob.download_as_bytes()
        
        return StreamingResponse(
            iter([thumbnail_data]),
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "ETag": f'"{image.id}-{image.modified_time.timestamp() if image.modified_time else 0}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching thumbnail: {str(e)}")


@app.post("/api/v1/images/upload")
async def upload_images(
    files: List[UploadFile] = File(...),
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """Upload and process images in real-time."""
    processor = ImageProcessor(thumbnail_size=(settings.thumbnail_size, settings.thumbnail_size))
    storage_client = storage.Client(project=settings.gcp_project_id)
    thumbnail_bucket = storage_client.bucket(settings.thumbnail_bucket)
    
    results = []
    
    for file in files:
        try:
            # Check if file is an image
            if not processor.is_supported(file.filename):
                results.append({
                    "filename": file.filename,
                    "status": "skipped",
                    "message": "Unsupported file format"
                })
                continue
            
            # Read file data
            image_data = await file.read()
            
            # Extract features
            features = processor.extract_features(image_data)
            
            # Check for duplicate based on perceptual hash
            existing = db.query(ImageMetadata).filter(
                ImageMetadata.tenant_id == tenant.id,
                ImageMetadata.perceptual_hash == features['perceptual_hash']
            ).first()
            
            if existing:
                # Delete old thumbnail from Cloud Storage
                try:
                    if existing.thumbnail_path:
                        blob = thumbnail_bucket.blob(existing.thumbnail_path)
                        if blob.exists():
                            blob.delete()
                except Exception as e:
                    print(f"Error deleting old thumbnail: {e}")
                
                # Delete existing tags
                db.query(ImageTag).filter(ImageTag.image_id == existing.id).delete()
                
                # Delete existing metadata
                db.delete(existing)
                db.commit()
            
            # Upload thumbnail to Cloud Storage
            thumbnail_path = f"{tenant.id}/thumbnails/{Path(file.filename).stem}_thumb.jpg"
            blob = thumbnail_bucket.blob(thumbnail_path)
            blob.upload_from_string(features['thumbnail'], content_type='image/jpeg')
            
            # Create metadata record
            exif = features['exif']
            
            metadata = ImageMetadata(
                tenant_id=tenant.id,
                dropbox_path=f"/uploads/{file.filename}",
                dropbox_id=f"upload_{Path(file.filename).stem}",
                filename=file.filename,
                file_size=len(image_data),
                content_hash=None,
                width=features['width'],
                height=features['height'],
                format=features['format'],
                perceptual_hash=features['perceptual_hash'],
                color_histogram=features['color_histogram'],
                exif_data=exif,
                camera_make=exif.get('Make'),
                camera_model=exif.get('Model'),
                lens_model=exif.get('LensModel'),
                thumbnail_path=thumbnail_path,
                embedding_generated=False,
                faces_detected=False,
                tags_applied=False,
            )
            
            db.add(metadata)
            db.commit()
            db.refresh(metadata)
            
            # Apply automatic tags from keywords using CLIP
            try:
                config = TenantConfig.load(tenant.id)
                all_keywords = config.get_all_keywords()
                
                # Group keywords by category to avoid softmax suppression
                by_category = {}
                for kw in all_keywords:
                    cat = kw['category']
                    if cat not in by_category:
                        by_category[cat] = []
                    by_category[cat].append(kw)
                
                # Run CLIP separately for each category
                all_tags = []
                tagger = get_tagger(model_type=settings.tagging_model)
                
                for category, keywords in by_category.items():
                    category_tags = tagger.tag_image(
                        image_data,
                        keywords,
                        threshold=0.15
                    )
                    all_tags.extend(category_tags)
                
                tags_with_confidence = all_tags
                
                # Create tags for matching keywords
                keyword_to_category = {kw['keyword']: kw['category'] for kw in all_keywords}
                
                for keyword, confidence in tags_with_confidence:
                    tag = ImageTag(
                        image_id=metadata.id,
                        tenant_id=tenant.id,
                        keyword=keyword,
                        category=keyword_to_category[keyword],
                        confidence=confidence,
                        manual=False
                    )
                    db.add(tag)
                
                if tags_with_confidence:
                    metadata.tags_applied = True
                    
                db.commit()
            except Exception as e:
                print(f"Tagging error: {e}")
                import traceback
                traceback.print_exc()
            
            results.append({
                "filename": file.filename,
                "status": "success",
                "image_id": metadata.id,
                "thumbnail_url": f"/api/v1/images/{metadata.id}/thumbnail"
            })
            
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "message": str(e)
            })
    
    return {
        "tenant_id": tenant.id,
        "uploaded": len([r for r in results if r["status"] == "success"]),
        "failed": len([r for r in results if r["status"] == "error"]),
        "results": results
    }


@app.post("/api/v1/retag")
async def retag_all_images(
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db)
):
    """Retag all images with current keywords."""
    from photocat.config import TenantConfig
    from photocat.tagging import get_tagger
    from google.cloud import storage
    
    # Load config
    config = TenantConfig.load(tenant.id)
    all_keywords = config.get_all_keywords()
    
    # Group keywords by category
    by_category = {}
    for kw in all_keywords:
        cat = kw['category']
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(kw)
    
    # Get all images
    images = db.query(ImageMetadata).filter(
        ImageMetadata.tenant_id == tenant.id
    ).all()
    
    # Setup CLIP tagger and storage
    tagger = get_tagger(model_type=settings.tagging_model)
    storage_client = storage.Client(project=settings.gcp_project_id)
    thumbnail_bucket = storage_client.bucket(settings.thumbnail_bucket)
    
    processed = 0
    failed = 0
    
    for image in images:
        try:
            # Delete existing tags
            db.query(ImageTag).filter(ImageTag.image_id == image.id).delete()
            
            # Download thumbnail
            blob = thumbnail_bucket.blob(image.thumbnail_path)
            if not blob.exists():
                failed += 1
                continue
            
            image_data = blob.download_as_bytes()
            
            # Run CLIP separately for each category
            all_tags = []
            for category, keywords in by_category.items():
                category_tags = tagger.tag_image(
                    image_data,
                    keywords,
                    threshold=0.15
                )
                all_tags.extend(category_tags)
            
            # Create new tags
            keyword_to_category = {kw['keyword']: kw['category'] for kw in all_keywords}
            
            for keyword, confidence in all_tags:
                tag = ImageTag(
                    image_id=image.id,
                    tenant_id=tenant.id,
                    keyword=keyword,
                    category=keyword_to_category[keyword],
                    confidence=confidence,
                    manual=False
                )
                db.add(tag)
            
            # Update tags_applied flag
            image.tags_applied = len(all_tags) > 0
            
            db.commit()
            processed += 1
            
        except Exception as e:
            print(f"Error processing {image.filename}: {e}")
            db.rollback()
            failed += 1
    
    return {
        "tenant_id": tenant.id,
        "total": len(images),
        "processed": processed,
        "failed": failed
    }


@app.post("/api/v1/sync")
async def trigger_sync(
    tenant: Tenant = Depends(get_tenant),
    db: Session = Depends(get_db),
    model: str = "siglip"  # Query parameter: 'clip' or 'siglip'
):
    """Trigger Dropbox sync for tenant."""
    try:
        # Get tenant's Dropbox token
        refresh_token = get_secret(f"dropbox-token-{tenant.id}")
        app_key = get_secret("dropbox-app-key")
        app_secret = get_secret("dropbox-app-secret")
        
        # Use Dropbox SDK directly with refresh token
        from dropbox import Dropbox
        dbx = Dropbox(
            oauth2_refresh_token=refresh_token,
            app_key=app_key,
            app_secret=app_secret
        )
        
        # Define folders to sync
        sync_folders = [
            "/Archive - Photo/Events/2025 Events",
            "/Archive - Photo/Events/2024 Events",
            "/Archive - Photo/Events/2023 Events"
        ]
        
        # Only fetch unprocessed files by checking what's already in DB
        from dropbox.files import FileMetadata
        
        # Get already processed dropbox IDs
        processed_ids = set(
            row[0] for row in db.query(ImageMetadata.dropbox_id)
            .filter(ImageMetadata.tenant_id == tenant.id)
            .all()
        )
        
        # Find next unprocessed image (process only first folder that has unprocessed files)
        file_entry = None
        for folder_path in sync_folders:
            try:
                result = dbx.files_list_folder(folder_path, recursive=True)
                entries = list(result.entries)
                
                # Handle pagination
                while result.has_more:
                    result = dbx.files_list_folder_continue(result.cursor)
                    entries.extend(result.entries)
                
                # Filter to images, sort by date, find first unprocessed
                file_entries = [e for e in entries if isinstance(e, FileMetadata)]
                file_entries.sort(key=lambda e: e.server_modified, reverse=True)
                
                for entry in file_entries:
                    if entry.id not in processed_ids:
                        processor = ImageProcessor()
                        if processor.is_supported(entry.name):
                            file_entry = entry
                            break
                
                if file_entry:
                    break  # Found one, stop searching
                    
            except Exception as e:
                print(f"Error listing folder {folder_path}: {e}")
        
        if not file_entry:
            return {
                "tenant_id": tenant.id,
                "status": "sync_complete",
                "processed": 0,
                "has_more": False
            }
        
        changes = {
            "entries": [file_entry],
            "cursor": None,
            "has_more": True  # Assume more until we check all folders
        }
        
        # Setup image processor
        processor = ImageProcessor()
        storage_client = storage.Client(project=settings.gcp_project_id)
        thumbnail_bucket = storage_client.bucket(settings.thumbnail_bucket)
        
        # Load config for tagging
        config = TenantConfig.load(tenant.id)
        all_keywords = config.get_all_keywords()
        
        # Group keywords by category
        by_category = {}
        for kw in all_keywords:
            cat = kw['category']
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(kw)
        
        tagger = get_tagger(model_type=model)
        processed = 0
        max_per_sync = 1  # Process one at a time for real-time UI updates
        
        # Process new/changed images (limit to 1 per sync)
        from dropbox.files import FileMetadata
        for entry in changes['entries']:
            if processed >= max_per_sync:
                break
                
            if isinstance(entry, FileMetadata) and processor.is_supported(entry.name):
                try:
                    status_messages = []
                    
                    # Download thumbnail for faster processing (skip HEIC - not supported)
                    from dropbox.files import ThumbnailFormat, ThumbnailSize
                    image_data = None
                    
                    # HEIC files don't support thumbnails, download full file
                    if not entry.name.lower().endswith(('.heic', '.heif')):
                        try:
                            status_messages.append(f"Downloading thumbnail: {entry.name}")
                            _, thumbnail_response = dbx.files_get_thumbnail(
                                path=entry.path_display,
                                format=ThumbnailFormat.jpeg,
                                size=ThumbnailSize.w480h320
                            )
                            image_data = thumbnail_response.content
                        except Exception as thumb_error:
                            print(f"Thumbnail failed for {entry.name}: {thumb_error}")
                    
                    # Fallback to full download if thumbnail not available
                    if image_data is None:
                        status_messages.append(f"Downloading full image: {entry.name}")
                        _, response = dbx.files_download(entry.path_display)
                        image_data = response.content
                    
                    # Extract features
                    status_messages.append(f"Extracting metadata and EXIF data")
                    features = processor.extract_features(image_data)
                    
                    # Check if already exists
                    existing = db.query(ImageMetadata).filter(
                        ImageMetadata.tenant_id == tenant.id,
                        ImageMetadata.dropbox_id == entry.id
                    ).first()
                    
                    if existing:
                        # Skip already processed, don't count toward limit
                        continue
                    
                    # Upload thumbnail
                    status_messages.append(f"Saving thumbnail and metadata")
                    thumbnail_path = f"{tenant.id}/thumbnails/{Path(entry.name).stem}_thumb.jpg"
                    blob = thumbnail_bucket.blob(thumbnail_path)
                    blob.upload_from_string(features['thumbnail'], content_type='image/jpeg')
                    
                    # Create new metadata
                    exif = features['exif']
                    metadata = ImageMetadata(
                        tenant_id=tenant.id,
                        dropbox_path=entry.path_display,
                        dropbox_id=entry.id,
                        filename=entry.name,
                        file_size=entry.size,
                        content_hash=entry.content_hash if hasattr(entry, 'content_hash') else None,
                        modified_time=entry.server_modified,
                        width=features['width'],
                        height=features['height'],
                        format=features['format'],
                        perceptual_hash=features['perceptual_hash'],
                        color_histogram=features['color_histogram'],
                        exif_data=exif,
                        camera_make=exif.get('Make'),
                        camera_model=exif.get('Model'),
                        lens_model=exif.get('LensModel'),
                        thumbnail_path=thumbnail_path,
                        embedding_generated=False,
                        faces_detected=False,
                        tags_applied=False,
                    )
                    db.add(metadata)
                    db.commit()
                    db.refresh(metadata)
                    
                    # Tag with CLIP (per category)
                    status_messages.append(f"Running {model.upper()} inference for tagging")
                    db.query(ImageTag).filter(ImageTag.image_id == metadata.id).delete()
                    
                    all_tags = []
                    for category, keywords in by_category.items():
                        category_tags = tagger.tag_image(image_data, keywords, threshold=0.15)
                        all_tags.extend(category_tags)
                    
                    keyword_to_category = {kw['keyword']: kw['category'] for kw in all_keywords}
                    
                    for keyword, confidence in all_tags:
                        tag = ImageTag(
                            image_id=metadata.id,
                            tenant_id=tenant.id,
                            keyword=keyword,
                            category=keyword_to_category[keyword],
                            confidence=confidence,
                            manual=False
                        )
                        db.add(tag)
                    
                    metadata.tags_applied = len(all_tags) > 0
                    status_messages.append(f"Complete: {len(all_tags)} tags applied")
                    db.commit()
                    processed += 1
                    
                except Exception as e:
                    print(f"Error processing {entry.name}: {e}")
                    status_messages = [f"Error: {str(e)}"]
        
        return {
            "tenant_id": tenant.id,
            "status": "sync_complete",
            "processed": processed,
            "has_more": len(file_entries) > processed,
            "status_message": " → ".join(status_messages) if 'status_messages' in locals() else None,
            "filename": file_entry.name if file_entry else None
        }
        
    except Exception as e:
        import traceback
        error_detail = f"Sync failed: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@app.get("/oauth/dropbox/authorize")
async def dropbox_authorize(tenant: str):
    """Redirect user to Dropbox OAuth."""
    app_key = get_secret("dropbox-app-key")
    redirect_uri = f"{settings.app_url}/oauth/dropbox/callback"
    
    oauth_url = (
        f"https://www.dropbox.com/oauth2/authorize"
        f"?client_id={app_key}"
        f"&response_type=code"
        f"&token_access_type=offline"
        f"&redirect_uri={redirect_uri}"
        f"&state={tenant}"
    )
    
    return RedirectResponse(oauth_url)


@app.get("/oauth/dropbox/callback")
async def dropbox_callback(code: str, state: str):
    """Handle Dropbox OAuth callback."""
    tenant_id = state
    
    # Exchange code for tokens
    app_key = get_secret("dropbox-app-key")
    app_secret = get_secret("dropbox-app-secret")
    redirect_uri = f"{settings.app_url}/oauth/dropbox/callback"
    
    import requests
    response = requests.post(
        "https://api.dropboxapi.com/oauth2/token",
        data={
            "code": code,
            "grant_type": "authorization_code",
            "client_id": app_key,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
        }
    )
    
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code")
    
    tokens = response.json()
    
    # Store refresh token in Secret Manager
    store_secret(f"dropbox-token-{tenant_id}", tokens['refresh_token'])
    
    return HTMLResponse("""
        <html>
            <body>
                <h1>✓ Dropbox Connected!</h1>
                <p>You can close this window and return to PhotoCat.</p>
                <script>window.close();</script>
            </body>
        </html>
    """)


@app.post("/webhooks/dropbox")
async def dropbox_webhook(request: Request):
    """Handle Dropbox webhook notifications."""
    # Verify webhook challenge on setup
    if request.method == "GET":
        challenge = request.query_params.get("challenge")
        if challenge:
            return {"challenge": challenge}
    
    # Verify webhook signature
    signature = request.headers.get("X-Dropbox-Signature", "")
    body = await request.body()
    
    app_secret = get_secret("dropbox-app-secret")
    validator = DropboxWebhookValidator(app_secret)
    
    if not validator.validate_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Parse notification
    data = json.loads(body)
    
    # Queue sync jobs for affected tenants
    # TODO: Trigger async sync via Cloud Tasks
    print(f"Webhook received: {data}")
    
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    from photocat.settings import settings
    
    uvicorn.run(
        "photocat.api:app",
        host=settings.api_host,
        port=settings.api_port,
        workers=settings.api_workers,
        reload=settings.debug
    )

