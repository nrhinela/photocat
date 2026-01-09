#!/usr/bin/env python3
"""
Migration script to import tenant configuration from YAML files into the database.

Usage:
    python scripts/migrate_config_to_db.py [tenant_id]
    
    If tenant_id is provided, only that tenant will be migrated.
    Otherwise, all tenants found in the config/ directory will be migrated.
"""

import sys
import yaml
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Add parent directory to path to import photocat modules
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from photocat.metadata import Tenant, Person
from photocat.settings import settings


def load_yaml_config(config_file: Path):
    """Load YAML configuration file."""
    if not config_file.exists():
        return None
    
    with open(config_file) as f:
        return yaml.safe_load(f)


def migrate_tenant(session, tenant_id: str, config_dir: Path):
    """Migrate a single tenant's configuration."""
    print(f"Migrating tenant: {tenant_id}")
    
    # Check if tenant already exists
    existing_tenant = session.query(Tenant).filter(Tenant.id == tenant_id).first()
    if existing_tenant:
        print(f"  Tenant {tenant_id} already exists in database, skipping")
        return
    
    # Create tenant record
    tenant = Tenant(
        id=tenant_id,
        name=tenant_id.capitalize(),  # Default name from ID
        active=True,
        settings={}
    )
    session.add(tenant)
    print(f"  Created tenant record: {tenant_id}")
    
    # Migrate people.yaml
    people_file = config_dir / tenant_id / "people.yaml"
    people_config = load_yaml_config(people_file)
    
    if people_config and people_config.get("people"):
        print(f"  Migrating {len(people_config['people'])} people...")
        for person_data in people_config["people"]:
            person = Person(
                tenant_id=tenant_id,
                name=person_data["name"],
                aliases=person_data.get("aliases", []),
                face_embedding_ref=person_data.get("face_embedding_ref")
            )
            session.add(person)
            print(f"    - {person_data['name']}")
    else:
        print(f"  No people.yaml found or empty")
    
    # Commit all changes for this tenant
    session.commit()
    print(f"  ✓ Tenant {tenant_id} migrated successfully\n")


def main():
    """Main migration function."""
    # Parse command line arguments
    tenant_id = sys.argv[1] if len(sys.argv) > 1 else None
    
    # Setup database connection
    engine = create_engine(settings.database_url)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
    try:
        # Find config directory
        config_dir = Path(__file__).parent.parent / "config"
        if not config_dir.exists():
            print(f"Config directory not found: {config_dir}")
            return 1
        
        # Get list of tenants to migrate
        if tenant_id:
            tenants_to_migrate = [tenant_id]
        else:
            # Find all tenant directories
            tenants_to_migrate = [
                d.name for d in config_dir.iterdir() 
                if d.is_dir() and not d.name.startswith('.')
            ]
        
        print(f"Found {len(tenants_to_migrate)} tenant(s) to migrate\n")
        
        # Migrate each tenant
        for tid in tenants_to_migrate:
            try:
                migrate_tenant(session, tid, config_dir)
            except Exception as e:
                print(f"  ✗ Error migrating {tid}: {e}\n")
                session.rollback()
        
        print("Migration complete!")
        return 0
        
    except Exception as e:
        print(f"Migration failed: {e}")
        session.rollback()
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
