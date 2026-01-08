# Configuration README

This directory contains tenant-specific configurations. Each tenant should have a subdirectory with their tenant ID containing:

## Required Files

### keywords.yaml
Hierarchical keyword structure for content tagging. Format:
```yaml
- name: Category Name
  keywords:
    - keyword1
    - keyword2
  subcategories:
    - name: Subcategory
      keywords:
        - nested_keyword
```

### people.yaml
List of people for facial recognition. Format:
```yaml
- name: Full Name
  aliases:
    - Nickname1
    - Nickname2
  face_embedding_ref: null  # Auto-populated
```

## Example Structure

```
config/
├── example/              # Example configuration
│   ├── keywords.yaml
│   └── people.yaml
├── tenant_123/           # Actual tenant config
│   ├── keywords.yaml
│   └── people.yaml
└── README.md
```

## Notes

- Keep keywords lowercase for consistency
- Use hierarchical categories to organize keywords logically
- People names should match how they're commonly referred to
- Face embeddings are populated automatically during processing
- Configuration can be hot-reloaded without restart
