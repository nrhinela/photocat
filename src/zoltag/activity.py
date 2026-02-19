"""Utilities for recording lightweight app activity events."""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Session

from zoltag.metadata import ActivityEvent


logger = logging.getLogger(__name__)

EVENT_AUTH_LOGIN = "auth.login"
EVENT_SEARCH_IMAGES = "search.images"
EVENT_SEARCH_NL = "search.nl"


def extract_client_ip(
    *,
    x_forwarded_for: Optional[str] = None,
    x_real_ip: Optional[str] = None,
) -> Optional[str]:
    """Extract the best-effort client IP from proxy headers."""
    forwarded = str(x_forwarded_for or "").strip()
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first[:64]
    real_ip = str(x_real_ip or "").strip()
    if real_ip:
        return real_ip[:64]
    return None


def _normalize_uuid(value: Optional[object]) -> Optional[UUID]:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None


def _truncate(value: Optional[str], max_len: int) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    return text[:max_len]


def record_activity_event(
    db: Session,
    *,
    event_type: str,
    actor_supabase_uid: Optional[object] = None,
    tenant_id: Optional[object] = None,
    request_path: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """Persist an activity event in an isolated transaction.

    Logging is non-blocking for primary request flows; failures are swallowed.
    """
    normalized_event_type = str(event_type or "").strip().lower()
    if not normalized_event_type:
        return

    values = {
        "tenant_id": _normalize_uuid(tenant_id),
        "actor_supabase_uid": _normalize_uuid(actor_supabase_uid),
        "event_type": normalized_event_type[:120],
        "request_path": _truncate(request_path, 255),
        "client_ip": _truncate(client_ip, 64),
        "user_agent": _truncate(user_agent, 512),
        "details": details if isinstance(details, dict) else {},
    }

    try:
        bind = db.get_bind()
        engine = bind.engine if hasattr(bind, "engine") else bind
        with engine.begin() as conn:
            conn.execute(sa.insert(ActivityEvent).values(**values))
    except Exception:
        logger.warning("Failed to write activity event for type=%s", normalized_event_type, exc_info=True)
