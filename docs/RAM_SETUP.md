# RAM++ Setup Guide

This guide explains how to install and use RAM++ (Recognize Anything Model) for image tagging.

## Installation

RAM++ requires additional dependencies not included in the base installation:

```bash
# Install RAM++ dependencies
pip install git+https://github.com/xinyu1205/recognize-anything.git
pip install torchvision

# Or if the above doesn't work, install from source:
git clone https://github.com/xinyu1205/recognize-anything.git
cd recognize-anything
pip install -e .
```

## Model Selection

PhotoCat supports two tagging models:

### CLIP (Default)
- **Pros**: Zero-shot learning, works with your custom keywords
- **Cons**: Limited to vocabulary you provide
- **Best for**: Controlled vocabularies with specific categories
- **Speed**: ~2-3 seconds per image

### RAM++ 
- **Pros**: Recognizes 6,000+ common objects/concepts automatically
- **Cons**: Fixed vocabulary, may not match your keywords exactly
- **Best for**: General-purpose tagging of common objects
- **Speed**: ~3-5 seconds per image

## Configuration

### Option 1: Set Default Model (Environment Variable)

Add to your `.env` file:

```env
# Use 'clip' or 'ram++'
TAGGING_MODEL=ram++
```

### Option 2: Select Per-Sync (UI)

Use the model dropdown in the web interface next to the tenant selector:
- Select "CLIP Model" or "RAM++ Model"
- Your choice applies to that sync session only

## How It Works

### CLIP Workflow
1. You provide keywords in `config/{tenant}/keywords.yaml`
2. CLIP compares image to each keyword
3. Returns matches above threshold (default 0.15)

### RAM++ Workflow
1. RAM++ analyzes image and generates tags from its 6K vocabulary
2. PhotoCat matches detected tags to your configured keywords
3. Only matching keywords are applied

**Example:**
- Your keywords: `["juggling", "spinning poi", "fire performance"]`
- RAM++ detects: `["person", "fire", "night", "performance"]`
- Applied tags: `["fire performance"]` (only match found)

## Keyword Matching

For RAM++ to work well with your keywords, consider:

1. **Use common terms**: "dog" instead of "golden retriever"
2. **Add aliases**: In keywords.yaml, list variations
   ```yaml
   - keyword: "fire performance"
     aliases: ["fire", "fire dancing", "fire juggling"]
   ```
3. **Check RAM++ vocabulary**: Common objects, animals, activities, scenes

## Performance Considerations

- **First Load**: RAM++ model download (~2-3GB) takes time
- **Memory**: Requires ~4-6GB GPU/RAM
- **Cost**: Similar to CLIP for inference time

## Troubleshooting

### ImportError: No module named 'ram'

Install dependencies:
```bash
pip install git+https://github.com/xinyu1205/recognize-anything.git
```

### Out of Memory

RAM++ requires more memory than CLIP. Try:
- Close other applications
- Use CPU instead of GPU (slower): Set `CUDA_VISIBLE_DEVICES=""`
- Process fewer images at once

### Tags Don't Match Keywords

RAM++ uses a fixed vocabulary. If your keywords are very specific:
- Use CLIP instead, or
- Add common synonyms to your keywords as aliases

## Switching Between Models

You can switch models at any time:
1. Change dropdown in UI before syncing
2. Or update `.env` and restart server
3. Retag existing images: Click "Retag All" button

Old tags are preserved until you retag.
