"""Inspection commands (list and show)."""

import sys
import click

from photocat.config import TenantConfig
from photocat.metadata import ImageMetadata
from photocat.cli.base import CliCommand


@click.command(name='list-images')
@click.option('--tenant-id', default='demo', help='Tenant ID')
@click.option('--limit', default=10, type=int, help='Number of images to list')
def list_images_command(tenant_id: str, limit: int):
    """List images in tenant's database."""
    cmd = ListImagesCommand(tenant_id, limit)
    cmd.run()


@click.command(name='show-config')
@click.argument('tenant_id')
def show_config_command(tenant_id: str):
    """Show tenant configuration."""
    cmd = ShowConfigCommand(tenant_id)
    cmd.run()


class ListImagesCommand(CliCommand):
    """Command to list images."""

    def __init__(self, tenant_id: str, limit: int):
        super().__init__()
        self.tenant_id = tenant_id
        self.limit = limit

    def run(self):
        """Execute list images command."""
        self.setup_db()
        try:
            self.load_tenant(self.tenant_id)
            self._list_images()
        finally:
            self.cleanup_db()

    def _list_images(self):
        """List processed images."""
        images = self.db.query(ImageMetadata).filter_by(
            tenant_id=self.tenant_id
        ).limit(self.limit).all()

        click.echo(f"\nImages for tenant {self.tenant_id}:")
        click.echo("-" * 80)

        for img in images:
            click.echo(f"ID: {img.id}")
            click.echo(f"  File: {img.filename}")
            click.echo(f"  Size: {img.width}x{img.height} ({img.format})")
            click.echo(f"  Camera: {img.camera_make} {img.camera_model}")
            click.echo(f"  Hash: {img.perceptual_hash[:16]}...")
            click.echo()

        total = self.db.query(ImageMetadata).filter_by(tenant_id=self.tenant_id).count()
        click.echo(f"Total: {total} images")


class ShowConfigCommand(CliCommand):
    """Command to show configuration."""

    def __init__(self, tenant_id: str):
        super().__init__()
        self.tenant_id = tenant_id

    def run(self):
        """Execute show config command."""
        # Note: show-config doesn't need DB, so we don't setup_db
        self._show_config()

    def _show_config(self):
        """Show tenant configuration."""
        try:
            config = TenantConfig.load(self.tenant_id)

            click.echo(f"\nConfiguration for tenant: {self.tenant_id}")
            click.echo("=" * 80)

            click.echo(f"\nKeywords ({len(config.keywords)} categories):")
            for category in config.keywords:
                click.echo(f"  • {category.name}: {', '.join(category.keywords[:5])}")
                if len(category.keywords) > 5:
                    click.echo(f"    ... and {len(category.keywords) - 5} more")

            click.echo(f"\nPeople ({len(config.people)}):")
            for person in config.people:
                aliases = f" (aka {', '.join(person.aliases)})" if person.aliases else ""
                click.echo(f"  • {person.name}{aliases}")

        except FileNotFoundError:
            click.echo(f"No configuration found for tenant: {self.tenant_id}", err=True)
            sys.exit(1)
