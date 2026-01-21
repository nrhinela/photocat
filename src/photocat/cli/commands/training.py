"""ML training commands."""

import click
from typing import Optional
from sqlalchemy import func
from google.cloud import storage

from photocat.settings import settings
from photocat.tagging import get_tagger
from photocat.learning import (
    build_keyword_models,
    load_keyword_models,
    recompute_trained_tags_for_image,
)
from photocat.metadata import ImageMetadata, KeywordModel, MachineTag
from photocat.config.db_config import ConfigManager
from photocat.cli.base import CliCommand


@click.command(name='train-keyword-models')
@click.option('--tenant-id', required=True, help='Tenant ID')
@click.option('--min-positive', default=None, type=int, help='Minimum positive examples per keyword')
@click.option('--min-negative', default=None, type=int, help='Minimum negative examples per keyword')
def train_keyword_models_command(
    tenant_id: str,
    min_positive: Optional[int],
    min_negative: Optional[int]
):
    """Train keyword classification models for a tenant."""
    cmd = TrainKeywordModelsCommand(tenant_id, min_positive, min_negative)
    cmd.run()


@click.command(name='recompute-trained-tags')
@click.option('--tenant-id', required=True, help='Tenant ID')
@click.option('--batch-size', default=50, type=int, help='Process images in batches')
@click.option('--limit', default=None, type=int, help='Limit number of images to process')
@click.option('--offset', default=0, type=int, help='Offset into image list')
@click.option('--replace', is_flag=True, default=False, help='Replace existing trained tags')
def recompute_trained_tags_command(
    tenant_id: str,
    batch_size: int,
    limit: Optional[int],
    offset: int,
    replace: bool
):
    """Recompute ML trained tags for images."""
    cmd = RecomputeTrainedTagsCommand(tenant_id, batch_size, limit, offset, replace)
    cmd.run()


class TrainKeywordModelsCommand(CliCommand):
    """Command to train keyword models."""

    def __init__(
        self,
        tenant_id: str,
        min_positive: Optional[int],
        min_negative: Optional[int]
    ):
        super().__init__()
        self.tenant_id = tenant_id
        self.min_positive = min_positive
        self.min_negative = min_negative

    def run(self):
        """Execute train keyword models command."""
        self.setup_db()
        try:
            self.load_tenant(self.tenant_id)
            self._train_models()
        finally:
            self.cleanup_db()

    def _train_models(self):
        """Train keyword centroid models from verified tags."""
        tagger = get_tagger(model_type=settings.tagging_model)
        model_name = getattr(tagger, "model_name", settings.tagging_model)
        model_version = getattr(tagger, "model_version", model_name)

        result = build_keyword_models(
            self.db,
            tenant_id=self.tenant_id,
            model_name=model_name,
            model_version=model_version,
            min_positive=self.min_positive or settings.keyword_model_min_positive,
            min_negative=self.min_negative or settings.keyword_model_min_negative
        )
        self.db.commit()
        click.echo(f"✓ Trained: {result['trained']} · Skipped: {result['skipped']}")


class RecomputeTrainedTagsCommand(CliCommand):
    """Command to recompute trained tags."""

    def __init__(
        self,
        tenant_id: str,
        batch_size: int,
        limit: Optional[int],
        offset: int,
        replace: bool
    ):
        super().__init__()
        self.tenant_id = tenant_id
        self.batch_size = batch_size
        self.limit = limit
        self.offset = offset
        self.replace = replace

    def run(self):
        """Execute recompute trained tags command."""
        self.setup_db()
        try:
            self.tenant = self.load_tenant(self.tenant_id)
            self._recompute_tags()
        finally:
            self.cleanup_db()

    def _recompute_tags(self):
        """Recompute trained-ML tags for all images in batches."""
        # Load configuration
        config_mgr = ConfigManager(self.db, self.tenant.id)
        all_keywords = config_mgr.get_all_keywords()
        keyword_to_category = {kw['keyword']: kw['category'] for kw in all_keywords}
        by_category = {}
        for kw in all_keywords:
            by_category.setdefault(kw['category'], []).append(kw)

        # Get latest trained model
        model_row = self.db.query(
            KeywordModel.model_name,
            KeywordModel.model_version
        ).filter(
            KeywordModel.tenant_id == self.tenant.id
        ).order_by(
            func.coalesce(KeywordModel.updated_at, KeywordModel.created_at).desc()
        ).first()

        if not model_row:
            click.echo("No keyword models found. Train models before recomputing.")
            return

        model_name, model_version = model_row

        keyword_models = load_keyword_models(self.db, self.tenant.id, model_name)
        if not keyword_models:
            click.echo("No keyword models found. Train models before recomputing.")
            return

        # Setup storage client
        storage_client = storage.Client(project=settings.gcp_project_id)
        thumbnail_bucket = storage_client.bucket(self.tenant.get_thumbnail_bucket(settings))

        # Process images in batches
        base_query = self.db.query(ImageMetadata).filter_by(tenant_id=self.tenant.id).order_by(ImageMetadata.id.desc())
        total = base_query.count()

        processed = 0
        skipped = 0
        current_offset = self.offset
        while True:
            batch = base_query.offset(current_offset).limit(self.batch_size).all()
            if not batch:
                break

            reached_limit = False
            for image in batch:
                if self.limit is not None and processed >= self.limit:
                    reached_limit = True
                    break
                if not image.thumbnail_path:
                    skipped += 1
                    continue
                if not self.replace:
                    existing = self.db.query(MachineTag.id).filter(
                        MachineTag.tenant_id == self.tenant.id,
                        MachineTag.image_id == image.id,
                        MachineTag.tag_type == 'trained',
                        MachineTag.model_name == model_name
                    ).first()
                    if existing:
                        skipped += 1
                        continue
                blob = thumbnail_bucket.blob(image.thumbnail_path)
                if not blob.exists():
                    skipped += 1
                    continue
                image_data = blob.download_as_bytes()
                recompute_trained_tags_for_image(
                    db=self.db,
                    tenant_id=self.tenant.id,
                    image_id=image.id,
                    image_data=image_data,
                    keywords_by_category=by_category,
                    keyword_models=keyword_models,
                    keyword_to_category=keyword_to_category,
                    model_name=model_name,
                    model_version=model_version,
                    model_type=settings.tagging_model,
                    threshold=0.15,
                    model_weight=settings.keyword_model_weight
                )
                processed += 1
                if self.limit is not None and processed >= self.limit:
                    reached_limit = True
                    break

            self.db.commit()

            if reached_limit:
                break

            current_offset += len(batch)

        click.echo(f"✓ Trained tags recomputed: {processed} · Skipped: {skipped} · Total: {total}")
