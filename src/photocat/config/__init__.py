"""Configuration management for tenant-specific settings."""

from pathlib import Path
from typing import Any, Dict, List

import yaml
from pydantic import BaseModel, Field


class KeywordCategory(BaseModel):
    """Hierarchical keyword category."""
    
    name: str
    keywords: List[str | dict] = Field(default_factory=list)  # Can be string or dict with prompt
    subcategories: List["KeywordCategory"] = Field(default_factory=list)


class Person(BaseModel):
    """Person for facial recognition."""
    
    name: str
    aliases: List[str] = Field(default_factory=list)
    face_embedding_ref: str | None = None  # Reference to stored embedding


class TenantConfig(BaseModel):
    """Complete tenant configuration."""
    
    keywords: List[KeywordCategory] = Field(default_factory=list)
    people: List[Person] = Field(default_factory=list)
    
    @classmethod
    def load(cls, tenant_id: str, config_dir: Path = Path("config")) -> "TenantConfig":
        """Load configuration for a tenant."""
        tenant_config_dir = config_dir / tenant_id
        
        if not tenant_config_dir.exists():
            raise FileNotFoundError(f"Configuration directory not found: {tenant_config_dir}")
        
        # Load keywords
        keywords_file = tenant_config_dir / "keywords.yaml"
        keywords_data = []
        if keywords_file.exists():
            with open(keywords_file) as f:
                keywords_data = yaml.safe_load(f) or []
        
        # Load people
        people_file = tenant_config_dir / "people.yaml"
        people_data = []
        if people_file.exists():
            with open(people_file) as f:
                people_data = yaml.safe_load(f) or []
        
        return cls(
            keywords=[KeywordCategory(**kw) for kw in keywords_data],
            people=[Person(**p) for p in people_data]
        )
    
    def get_all_keywords(self) -> List[dict]:
        """Flatten all keywords from hierarchical structure with category info."""
        result = []
        
        def extract_keywords(category: KeywordCategory, parent_path: str = "") -> None:
            category_path = f"{parent_path}/{category.name}" if parent_path else category.name
            for keyword in category.keywords:
                # Handle both string and dict formats
                if isinstance(keyword, str):
                    result.append({
                        'keyword': keyword,
                        'category': category_path
                    })
                elif isinstance(keyword, dict):
                    result.append({
                        'keyword': keyword['keyword'],
                        'category': category_path,
                        'prompt': keyword.get('prompt')
                    })
            for subcat in category.subcategories:
                extract_keywords(subcat, category_path)
        
        for category in self.keywords:
            extract_keywords(category)
        
        return result
    
    def get_person_by_name(self, name: str) -> Person | None:
        """Find person by name or alias."""
        name_lower = name.lower()
        for person in self.people:
            if person.name.lower() == name_lower:
                return person
            if any(alias.lower() == name_lower for alias in person.aliases):
                return person
        return None


# Enable forward references for recursive model
KeywordCategory.model_rebuild()
