"""Router for system configuration endpoints."""

from fastapi import APIRouter

router = APIRouter(
    prefix="/api/v1/config",
    tags=["config"]
)


@router.get("/system")
async def get_system_config():
    """Get system configuration (environment, version, etc.)."""
    from photocat.settings import settings
    
    return {
        "environment": settings.environment,
        "version": "0.1.0",
        "api_url": settings.api_url if hasattr(settings, 'api_url') else "/api",
        "debug": settings.debug,
        "use_keyword_models": settings.use_keyword_models,
        "keyword_model_weight": settings.keyword_model_weight
    }
