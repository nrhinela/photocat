# Cloud Storage + CDN for Thumbnails

## Current Implementation: Direct GCS URLs

Thumbnails are served directly from Cloud Storage, bypassing the API completely.

**Benefits:**
- ✅ Fast: Direct from Google's infrastructure
- ✅ Cached: Browser caches for 1 year (immutable)
- ✅ Scalable: No Cloud Run limits
- ✅ Cost-effective: $0.12/GB vs streaming through API

**How it works:**
1. Thumbnails uploaded to GCS with `Cache-Control: public, max-age=31536000, immutable`
2. Bucket is publicly readable (required for direct access)
3. API returns `thumbnail_url: https://storage.googleapis.com/photocat-483622-thumbnails/...`
4. Frontend fetches directly from GCS

## Optional: Enable Cloud CDN (Global Edge Caching)

For even better performance (50-200ms globally), enable Cloud CDN:

```bash
chmod +x scripts/setup_cdn.sh
./scripts/setup_cdn.sh photocat-483622
```

This creates:
- Backend bucket connected to GCS
- URL map and forwarding rules
- SSL certificate (if using custom domain)
- Global static IP

**CDN Benefits:**
- ✅ Edge caching in 200+ locations worldwide
- ✅ ~100ms latency anywhere
- ✅ Automatic cache invalidation
- ✅ DDoS protection

**Trade-offs:**
- Requires custom domain (e.g., cdn.photocat.app)
- SSL provisioning takes ~15 minutes
- More complex setup

## Performance Comparison

| Method | Latency | Bandwidth Cost | Setup |
|--------|---------|---------------|-------|
| API Proxy | 500-1000ms | $0.12/GB | None |
| Direct GCS | 200-500ms | $0.12/GB | Simple (current) |
| GCS + CDN | 50-200ms | $0.08/GB | Complex |

## Monitoring

Check bucket access:
```bash
gsutil iam get gs://photocat-483622-thumbnails
```

View CDN metrics (if enabled):
```bash
gcloud compute backend-buckets describe photocat-thumbnails-backend --global
```

## Security Note

Thumbnails are **publicly readable** - anyone with the URL can view them. This is required for:
- Direct browser access
- CDN caching
- Performance

If you need private thumbnails, use signed URLs instead (but loses caching benefits).
