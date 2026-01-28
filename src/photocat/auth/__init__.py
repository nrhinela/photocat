"""Supabase Authentication module for PhotoCat.

This module handles:
- JWT verification via Supabase JWKS endpoint
- User profile and tenant membership management
- Role-based access control
- Invitation system for onboarding
"""

from photocat.auth.config import get_auth_settings
from photocat.auth.jwt import verify_supabase_jwt, get_supabase_uid_from_token
from photocat.auth.models import UserProfile, UserTenant, Invitation

__all__ = [
    "get_auth_settings",
    "verify_supabase_jwt",
    "get_supabase_uid_from_token",
    "UserProfile",
    "UserTenant",
    "Invitation",
]
