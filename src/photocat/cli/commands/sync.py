"""Dropbox synchronization command."""

import click

import io
from photocat.settings import settings
from photocat.dependencies import get_secret
from photocat.metadata import Tenant as TenantModel, ImageMetadata, MachineTag
from photocat.tenant import Tenant, TenantContext
from photocat.dropbox import DropboxClient
from photocat.config.db_config import ConfigManager
from photocat.image import ImageProcessor
from photocat.learning import score_keywords_for_categories
from photocat.models.config import Keyword
from photocat.tagging import get_tagger
from photocat.cli.base import CliCommand
from PIL import Image


@click.command(name='sync-dropbox')
@click.option('--tenant-id', default='demo', help='Tenant ID to sync')
@click.option('--count', default=1, type=int, help='Number of sync iterations')
@click.option('--model', type=click.Choice(['siglip', 'clip']), default='siglip', help='ML model to use')
def sync_dropbox_command(tenant_id: str, count: int, model: str):
    """Sync images from Dropbox (same as pressing sync button on web)."""
    cmd = SyncDropboxCommand(tenant_id, count, model)
    cmd.run()


class SyncDropboxCommand(CliCommand):
    """Command to sync with Dropbox."""

    def __init__(self, tenant_id: str, count: int, model: str):
        super().__init__()
        self.tenant_id = tenant_id
        self.count = count
        self.model = model

    def run(self):
        """Execute sync dropbox command."""
        self.setup_db()
        try:
            self._sync_dropbox()
        finally:
            self.cleanup_db()

    def _sync_dropbox(self):
        """Sync images from Dropbox."""
        # Load tenant
        tenant = self.db.query(TenantModel).filter(TenantModel.id == self.tenant_id).first()
        if not tenant:
            click.echo(f"Error: Tenant {self.tenant_id} not found", err=True)
            return

        TenantContext.set(Tenant(
            id=tenant.id,
            name=tenant.name,
            storage_bucket=tenant.storage_bucket,
            thumbnail_bucket=tenant.thumbnail_bucket
        ))

        click.echo(f"Syncing from Dropbox for tenant: {tenant.name}")

        # Get Dropbox credentials
        dropbox_token = get_secret(f"{self.tenant_id}/dropbox_refresh_token")
        if not dropbox_token:
            click.echo("Error: No Dropbox refresh token configured", err=True)
            return

        # Initialize Dropbox client
        dropbox_client = DropboxClient(dropbox_token)

        # Get sync folders from tenant config or use root
        config_mgr = ConfigManager(self.db, self.tenant_id)
        tenant_config = self.db.query(TenantModel).filter(TenantModel.id == self.tenant_id).first()
        sync_folders = []
        if tenant_config.config_data and 'sync_folders' in tenant_config.config_data:
            sync_folders = tenant_config.config_data['sync_folders']

        if not sync_folders:
            sync_folders = ['']  # Root if no folders configured

        click.echo(f"Sync folders: {sync_folders}")

        # Get all keywords
        all_keywords = config_mgr.get_all_keywords()
        if not all_keywords:
            click.echo("Error: No keywords configured", err=True)
            return

        # Group keywords by category
        by_category = {}
        for kw in all_keywords:
            cat = kw['category']
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(kw)

        click.echo(f"Keywords: {len(all_keywords)} in {len(by_category)} categories")

        # Get tagger
        tagger = get_tagger(model_type=self.model)
        model_name = getattr(tagger, "model_name", self.model)
        model_version = getattr(tagger, "model_version", model_name)

        # Process images
        processed = 0
        for folder in sync_folders:
            if processed >= self.count:
                break

            click.echo(f"\nListing folder: {folder or '(root)'}")

            # Get list of files in folder
            result = dropbox_client.list_folder(folder)
            entries = result.get('entries', [])

            click.echo(f"Found {len(entries)} entries")

            # Filter to image files
            processor = ImageProcessor()
            unprocessed = []

            for entry in entries:
                if entry.get('tag') == 'file' and processor.is_supported(entry.get('name', '')):
                    # Check if already processed
                    dropbox_id = entry.get('id')
                    existing = self.db.query(ImageMetadata).filter(
                        ImageMetadata.tenant_id == self.tenant_id,
                        ImageMetadata.dropbox_id == dropbox_id
                    ).first()

                    if not existing:
                        unprocessed.append(entry)

            click.echo(f"Found {len(unprocessed)} unprocessed images")

            # Process images one by one
            for entry in unprocessed:
                if processed >= self.count:
                    break

                try:
                    dropbox_path = entry['path_display']
                    click.echo(f"\nProcessing: {dropbox_path}")

                    # Download thumbnail
                    thumbnail_data = dropbox_client.get_thumbnail(entry['id'], size='w640h480')
                    if not thumbnail_data:
                        click.echo(f"  ✗ Failed to download thumbnail", err=True)
                        continue

                    # Extract features
                    processor = ImageProcessor()
                    image = Image.open(io.BytesIO(thumbnail_data))
                    if image.mode != "RGB":
                        image = image.convert("RGB")

                    features = processor.extract_visual_features(image)

                    # Get metadata from Dropbox
                    dropbox_meta = dropbox_client.get_metadata(entry['id'])
                    media_info = dropbox_meta.get('media_info', {})

                    click.echo(f"  Dimensions: {features['width']}x{features['height']}")

                    # Extract EXIF and other metadata
                    exif = {}
                    try:
                        img_pil = Image.open(io.BytesIO(thumbnail_data))
                        exif_data = img_pil._getexif() if hasattr(img_pil, '_getexif') else None
                        if exif_data:
                            from PIL.ExifTags import TAGS
                            exif = {TAGS.get(k, k): v for k, v in exif_data.items()}
                    except Exception:
                        pass

                    # Create metadata record
                    metadata = ImageMetadata(
                        tenant_id=self.tenant_id,
                        filename=entry.get('name', ''),
                        dropbox_id=entry.get('id'),
                        dropbox_path=dropbox_path,
                        width=features['width'],
                        height=features['height'],
                        format=features['format'],
                        perceptual_hash=features['perceptual_hash'],
                        color_histogram=features['color_histogram'],
                        exif_data=exif,
                        thumbnail_path='',
                        embedding_generated=False,
                        faces_detected=False,
                        tags_applied=False,
                    )
                    self.db.add(metadata)
                    self.db.commit()
                    self.db.refresh(metadata)

                    click.echo(f"  ✓ Metadata recorded (ID: {metadata.id})")

                    # Tag with model
                    click.echo(f"  Running {self.model} inference...")

                    # Delete existing tags
                    self.db.query(MachineTag).filter(
                        MachineTag.image_id == metadata.id,
                        MachineTag.tag_type == 'siglip'
                    ).delete()

                    # Score keywords
                    all_tags = score_keywords_for_categories(
                        image_data=thumbnail_data,
                        keywords_by_category=by_category,
                        model_type=self.model,
                        threshold=0.15
                    )

                    click.echo(f"  Found {len(all_tags)} tags")

                    # Create tag records
                    for keyword_str, confidence in all_tags:
                        keyword_record = self.db.query(Keyword).filter(
                            Keyword.tenant_id == self.tenant_id,
                            Keyword.keyword == keyword_str
                        ).first()

                        if not keyword_record:
                            continue

                        tag = MachineTag(
                            image_id=metadata.id,
                            tenant_id=self.tenant_id,
                            keyword_id=keyword_record.id,
                            confidence=confidence,
                            tag_type='siglip',
                            model_name=model_name,
                            model_version=model_version
                        )
                        self.db.add(tag)

                    metadata.tags_applied = len(all_tags) > 0
                    self.db.commit()

                    click.echo(f"  ✓ Complete: {len(all_tags)} tags applied")
                    processed += 1

                except Exception as e:
                    click.echo(f"  ✗ Error: {e}", err=True)
                    self.db.rollback()

        click.echo(f"\n✓ Synced {processed} images from Dropbox")
