"""Embeddings generation command."""

import click
from typing import Optional
from sqlalchemy import or_
from google.cloud import storage

from photocat.settings import settings
from photocat.tagging import get_tagger
from photocat.learning import ensure_image_embedding
from photocat.metadata import ImageMetadata
from photocat.cli.base import CliCommand


@click.command(name='build-embeddings')
@click.option('--tenant-id', required=True, help='Tenant ID')
@click.option('--limit', default=None, type=int, help='Limit number of images to process')
@click.option('--force/--no-force', default=False, help='Recompute embeddings even if present')
def build_embeddings_command(tenant_id: str, limit: Optional[int], force: bool):
    """Compute and store image embeddings for a tenant."""
    cmd = BuildEmbeddingsCommand(tenant_id, limit, force)
    cmd.run()


class BuildEmbeddingsCommand(CliCommand):
    """Command to build image embeddings."""

    def __init__(self, tenant_id: str, limit: Optional[int], force: bool):
        super().__init__()
        self.tenant_id = tenant_id
        self.limit = limit
        self.force = force

    def run(self):
        """Execute build embeddings command."""
        self.setup_db()
        try:
            self.tenant = self.load_tenant(self.tenant_id)
            self._build_embeddings()
        finally:
            self.cleanup_db()

    def _build_embeddings(self):
        """Build embeddings for images."""
        # Setup storage client
        storage_client = storage.Client(project=settings.gcp_project_id)
        thumbnail_bucket = storage_client.bucket(self.tenant.get_thumbnail_bucket(settings))

        # Setup tagger to get model info
        tagger = get_tagger(model_type=settings.tagging_model)
        model_name = getattr(tagger, "model_name", settings.tagging_model)
        model_version = getattr(tagger, "model_version", model_name)

        # Query for images needing embeddings
        query = self.db.query(ImageMetadata).filter_by(tenant_id=self.tenant.id)
        query = query.filter(or_(ImageMetadata.rating.is_(None), ImageMetadata.rating != 0))
        if not self.force:
            query = query.filter(ImageMetadata.embedding_generated.is_(False))
        if self.limit:
            query = query.limit(self.limit)

        images = query.all()
        if not images:
            click.echo("No images need embeddings.")
            return

        click.echo(f"Computing embeddings for {len(images)} images...")
        with click.progressbar(images, label='Embedding images') as bar:
            for image in bar:
                if not image.thumbnail_path:
                    continue
                blob = thumbnail_bucket.blob(image.thumbnail_path)
                if not blob.exists():
                    continue
                image_data = blob.download_as_bytes()
                ensure_image_embedding(
                    self.db, self.tenant.id, image.id, image_data,
                    model_name, model_version
                )

        self.db.commit()
        click.echo("✓ Embeddings stored")
