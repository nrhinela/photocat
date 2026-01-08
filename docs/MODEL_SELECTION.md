# PhotoCat - Model Selection Feature

## What's New

You can now choose between CLIP and RAM++ models for image tagging!

## Quick Start

### Using CLIP (Default)
No changes needed - CLIP works out of the box with your custom keywords.

### Using RAM++

1. **Install RAM++ dependencies:**
   ```bash
   pip install git+https://github.com/xinyu1205/recognize-anything.git
   pip install torchvision
   ```

2. **Select model in UI:**
   - Open PhotoCat web interface
   - Look for the model dropdown next to tenant selector
   - Choose "RAM++ Model"
   - Click "Sync" to process images

3. **Or set as default:**
   Add to `.env`:
   ```env
   TAGGING_MODEL=ram++
   ```
   Then restart the server.

## Model Comparison

| Feature | CLIP | RAM++ |
|---------|------|-------|
| **Vocabulary** | Your custom keywords only | 6,000+ built-in tags |
| **Flexibility** | Zero-shot, any keywords | Fixed vocabulary |
| **Accuracy** | Great for specific terms | Great for common objects |
| **Speed** | ~2-3 sec/image | ~3-5 sec/image |
| **Memory** | ~2GB | ~4-6GB |
| **Best For** | Controlled vocabularies | General-purpose tagging |

## Usage Examples

### Example 1: Circus Performance Photos (Use CLIP)
Keywords: `juggling`, `aerial silks`, `fire poi`, `clown costume`
- CLIP recognizes these specific circus terms
- RAM++ might only detect "person", "fire", "fabric"

### Example 2: Family Vacation Photos (Use RAM++)
Keywords: `beach`, `mountain`, `dog`, `car`, `food`
- RAM++ detects these common objects easily
- CLIP works too, but RAM++ may find more

### Example 3: Mixed Collection (Use Both!)
1. Sync with CLIP for specific categories
2. Retag with RAM++ to catch common objects
3. Both sets of tags are preserved

## Switching Models

**During Sync:**
- Select model from dropdown
- That choice applies to current sync only

**Change Default:**
1. Edit `.env`: `TAGGING_MODEL=ram++`
2. Restart server: `Ctrl+C` then `make dev`
3. New syncs use RAM++ by default

**Retag Existing Images:**
1. Change model selection
2. Click "Retag All" button
3. All images re-processed with new model

## Status Messages

Watch the blue status banner during sync:
- "Running CLIP inference for tagging" = Using CLIP
- "Running RAM++ inference for tagging" = Using RAM++

## Troubleshooting

See [docs/RAM_SETUP.md](./RAM_SETUP.md) for detailed installation and troubleshooting.

**Common Issues:**
- `ImportError: No module named 'ram'` → Install RAM++ dependencies
- `Out of memory` → RAM++ needs 4-6GB RAM, try CLIP instead
- `No tags matched` → RAM++ vocabulary may not include your keywords, use CLIP

## Technical Details

- Both models run in the same inference pipeline
- Model selection is per-API-call, no restart needed
- Models are loaded on first use and cached in memory
- You can have both models loaded simultaneously
- Confidence threshold: 0.15 (adjustable in code)

## Files Changed

- `src/photocat/tagging.py` - Added RAM++ support
- `src/photocat/api.py` - Added model parameter to sync
- `src/photocat/settings.py` - Added TAGGING_MODEL setting
- `src/photocat/static/index.html` - Added model dropdown UI
- `.env` - Added TAGGING_MODEL option
