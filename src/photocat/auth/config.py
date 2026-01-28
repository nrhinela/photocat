"""Supabase Auth configuration."""

from functools import lru_cache
from pydantic_settings import BaseSettings


class AuthSettings(BaseSettings):
    """Supabase Auth settings from environment variables."""

    supabase_url: str
    """Supabase project URL (e.g., https://xxx.supabase.co)"""

    supabase_anon_key: str
    """Supabase public (anonymous) API key - used by frontend"""

    supabase_service_role_key: str
    """Supabase service role key - server-only, bypasses RLS"""

    jwt_algorithm: str = "ES256"
    """JWT algorithm used by Supabase (always ES256)"""

    jwt_audience: str = "authenticated"
    """JWT audience claim expected by Supabase"""

    @property
    def jwks_url(self) -> str:
        """JWKS endpoint URL for fetching public keys."""
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    class Config:
        """Pydantic configuration."""
        env_file = ".env"
        env_prefix = "SUPABASE_"
        case_sensitive = False


@lru_cache(maxsize=1)
def get_auth_settings() -> AuthSettings:
    """Get cached auth settings.

    Settings are loaded from environment variables with SUPABASE_ prefix:
    - SUPABASE_URL: Supabase project URL
    - SUPABASE_ANON_KEY: Public API key
    - SUPABASE_SERVICE_ROLE_KEY: Server-only service role key

    Returns:
        AuthSettings: Cached settings instance

    Raises:
        ValidationError: If required environment variables are missing
    """
    return AuthSettings()
