"""JWT token verification using Supabase JWKS endpoint."""

import httpx
from functools import lru_cache
from typing import Dict, Any
from datetime import datetime, timedelta
from jose import jwt, JWTError

from photocat.auth.config import get_auth_settings


# Cache JWKS for performance (updated hourly)
_jwks_cache: Dict[str, Any] = {}
_jwks_cache_time: datetime = datetime.min


@lru_cache(maxsize=1)
def get_jwks() -> Dict:
    """Fetch and cache JWKS (JSON Web Key Set) from Supabase.

    The JWKS endpoint provides the public keys needed to verify JWT signatures.
    Keys are cached to avoid repeated HTTP requests. Cache is invalidated after
    1 hour, allowing key rotation without restarting the application.

    Returns:
        dict: JWKS structure with 'keys' array

    Raises:
        httpx.HTTPError: If the JWKS endpoint is unreachable
        KeyError: If the response doesn't contain expected JWKS structure
    """
    global _jwks_cache, _jwks_cache_time

    # Return cached JWKS if less than 1 hour old
    if _jwks_cache and datetime.utcnow() - _jwks_cache_time < timedelta(hours=1):
        return _jwks_cache

    # Fetch fresh JWKS
    settings = get_auth_settings()
    try:
        response = httpx.get(settings.jwks_url, timeout=10.0)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = datetime.utcnow()
        return _jwks_cache
    except httpx.HTTPError as e:
        raise JWTError(f"Failed to fetch JWKS from {settings.jwks_url}: {str(e)}")


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """Verify Supabase JWT token using JWKS endpoint.

    Verification checks:
    - JWT signature is valid (using public keys from JWKS)
    - Token is not expired (exp claim)
    - Token audience is 'authenticated' (aud claim)

    The Supabase JWT structure includes:
    - sub: Supabase UID (UUID from auth.users.id)
    - aud: Audience (always 'authenticated')
    - exp: Expiration time
    - iat: Issued at time
    - email: User's email address
    - email_confirmed_at: Email verification timestamp (optional)

    Args:
        token: JWT access token from Supabase Auth

    Returns:
        dict: Decoded token claims, including 'sub' (supabase_uid)

    Raises:
        JWTError: If token is invalid, expired, or verification fails
    """
    settings = get_auth_settings()

    try:
        # Fetch JWKS (cached)
        jwks = get_jwks()

        # Decode and verify JWT
        # The python-jose library automatically selects the correct key from JWKS
        # based on the 'kid' (key ID) header in the JWT
        decoded = jwt.decode(
            token,
            jwks,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            options={
                "verify_signature": True,  # Cryptographic signature verification
                "verify_exp": True,  # Ensure token hasn't expired
                "verify_aud": True,  # Ensure audience matches expected
            }
        )
        return decoded

    except JWTError as e:
        raise JWTError(f"JWT verification failed: {str(e)}")


def get_supabase_uid_from_token(token: str) -> str:
    """Extract Supabase UID from JWT token.

    The 'sub' (subject) claim in Supabase JWT tokens contains the user's UUID
    (auth.users.id). This function extracts and returns it after verifying
    the token signature.

    Args:
        token: JWT access token from Supabase Auth

    Returns:
        str: Supabase UID (UUID) from the 'sub' claim

    Raises:
        JWTError: If token is invalid or verification fails
    """
    decoded = verify_supabase_jwt(token)
    return decoded["sub"]  # 'sub' claim contains the UUID


def clear_jwks_cache() -> None:
    """Clear the JWKS cache.

    Useful for testing or forcing a refresh of public keys.
    """
    global _jwks_cache, _jwks_cache_time
    _jwks_cache = {}
    _jwks_cache_time = datetime.min
