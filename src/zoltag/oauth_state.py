"""Signed OAuth state token helpers for CSRF protection.

State is encoded as a short-lived signed token so it survives:
- multiple API workers/processes
- hot reload restarts
- stateless deployments
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from zoltag.settings import settings

_STATE_TTL = timedelta(minutes=10)
_STATE_AUDIENCE = "zoltag-oauth-state"
_STATE_ALGORITHM = "HS256"


def _state_secret_candidates() -> list[str]:
    """Resolve candidate signing secrets from most stable/preferred to fallback."""
    raw_candidates = [
        settings.oauth_state_secret,
        settings.database_url,
        settings.supabase_service_role_key,
        settings.supabase_anon_key,
    ]
    seen: set[str] = set()
    candidates: list[str] = []
    for raw in raw_candidates:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        candidates.append(value)
    return candidates


def _state_signing_secret() -> str:
    candidates = _state_secret_candidates()
    if not candidates:
        raise RuntimeError("OAuth state secret is not configured")
    return candidates[0]


def generate_with_context(tenant_id: str, context: dict[str, Any] | None = None) -> str:
    """Generate signed OAuth state bound to tenant_id + optional context."""
    now = datetime.now(timezone.utc)
    expires_at = now + _STATE_TTL
    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "context": context or {},
        "nonce": secrets.token_urlsafe(16),
        "aud": _STATE_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, _state_signing_secret(), algorithm=_STATE_ALGORITHM)


def consume_with_context(nonce: str) -> dict[str, Any] | None:
    """Validate signed state token. Returns payload on success, None on failure."""
    payload = None
    for secret in _state_secret_candidates():
        try:
            payload = jwt.decode(
                nonce,
                secret,
                algorithms=[_STATE_ALGORITHM],
                audience=_STATE_AUDIENCE,
                options={
                    "verify_signature": True,
                    "verify_aud": True,
                    "verify_exp": True,
                },
            )
            break
        except JWTError:
            continue
    if payload is None:
        return None

    tenant_id = str(payload.get("tenant_id") or "").strip()
    if not tenant_id:
        return None
    context = payload.get("context") or {}
    if not isinstance(context, dict):
        context = {}
    return {
        "tenant_id": tenant_id,
        "context": context,
    }


def generate(tenant_id: str) -> str:
    """Generate a one-time nonce bound to tenant_id. Returns the nonce."""
    return generate_with_context(tenant_id, {})


def consume(nonce: str) -> str | None:
    """Validate and consume a nonce. Returns tenant_id on success, None on failure."""
    payload = consume_with_context(nonce)
    if not payload:
        return None
    return payload["tenant_id"]
