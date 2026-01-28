# Supabase Authentication Architecture for PhotoCat

## Overview

This document defines the authentication system for PhotoCat using **Supabase Auth** as the identity provider. This plan adapts the existing Firebase Auth design (see [auth-architecture.md](./auth-architecture.md)) to use Supabase instead, leveraging the fact that PhotoCat is already using Supabase PostgreSQL.

**Key Decisions:**
- ✅ Use Supabase Auth (not Firebase) - single platform for database + auth
- ✅ Admin approval REQUIRED for new user registrations
- ✅ Require authentication IMMEDIATELY (no backward compatibility with X-Tenant-ID)

## Architecture Summary

### Hybrid Authentication Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Auth (Managed)                      │
│  - User credentials (email/password)                            │
│  - OAuth tokens (Google, GitHub, etc.)                          │
│  - Email verification                                           │
│  - Password reset                                               │
│  - JWT tokens (access_token, refresh_token)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Supabase UID (UUID from auth.users.id)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PostgreSQL (PhotoCat Database)                  │
│  - user_profiles (synced from Supabase, RLS enabled)            │
│  - user_tenants (roles, membership, RLS enabled)                │
│  - invitations (RLS enabled)                                    │
│  - All existing tenant/image data (application-level checks)    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Components:**

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Identity Provider | **Supabase Auth** | Manages credentials, OAuth, JWT tokens |
| Token Verification | **JWKS endpoint + python-jose** | Verify JWT signatures with asymmetric keys |
| Frontend Auth | **@supabase/supabase-js** | Handle login, signup, token refresh |
| Local User Data | **PostgreSQL + SQLAlchemy** | Tenant roles, approval status, profile sync |
| Security Layer | **Row Level Security (RLS)** | Defense-in-depth on auth tables |

### Key Differences from Firebase Design

| Aspect | Firebase Design | Supabase Adaptation |
|--------|----------------|---------------------|
| **User ID** | `firebase_uid` (VARCHAR) | `supabase_uid` (UUID) |
| **Token Format** | Firebase ID Token | Standard JWT (ES256) |
| **Verification** | firebase-admin SDK | JWKS endpoint + python-jose |
| **Token Refresh** | Firebase SDK auto-refresh | Supabase SDK auto-refresh |
| **Architecture** | Firebase + GCP + PostgreSQL | Supabase + PostgreSQL (simpler) |

## Data Model

### New Tables

#### 1. user_profiles

User profiles synced from Supabase auth.users. Stores approval status and role information.

```sql
CREATE TABLE user_profiles (
    supabase_uid UUID PRIMARY KEY,  -- Maps to auth.users.id
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    display_name VARCHAR(255),
    photo_url TEXT,

    -- Approval workflow
    is_active BOOLEAN DEFAULT FALSE,  -- Requires admin approval before access
    is_super_admin BOOLEAN DEFAULT FALSE,  -- System-wide admin rights

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_is_active ON user_profiles(is_active);

-- RLS: Users can view and update their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON user_profiles FOR SELECT
USING (supabase_uid = auth.uid());

CREATE POLICY "Users can update their own profile"
ON user_profiles FOR UPDATE
USING (supabase_uid = auth.uid());
```

**Fields:**
- `supabase_uid`: Primary key, UUID from Supabase auth.users.id
- `email`: User's email address (unique, indexed)
- `email_verified`: Set by Supabase after email verification
- `display_name`: User's display name (optional)
- `photo_url`: Profile photo URL (optional)
- `is_active`: FALSE on signup, TRUE after admin approval
- `is_super_admin`: System-wide admin flag (rare)
- `created_at`, `updated_at`: Timestamps
- `last_login_at`: Tracks last successful login

#### 2. user_tenants

Many-to-many relationship between users and tenants with roles.

```sql
CREATE TABLE user_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_uid UUID NOT NULL REFERENCES user_profiles(supabase_uid) ON DELETE CASCADE,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Role: 'admin' or 'user' (tenant-scoped)
    role VARCHAR(50) NOT NULL DEFAULT 'user',

    -- Invitation tracking
    invited_by UUID REFERENCES user_profiles(supabase_uid),
    invited_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,  -- NULL = pending invitation

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(supabase_uid, tenant_id),
    CHECK (role IN ('admin', 'user'))
);

CREATE INDEX idx_user_tenants_supabase_uid ON user_tenants(supabase_uid);
CREATE INDEX idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX idx_user_tenants_pending ON user_tenants(tenant_id) WHERE accepted_at IS NULL;

-- RLS: Users can view their own memberships
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tenant memberships"
ON user_tenants FOR SELECT
USING (supabase_uid = auth.uid());
```

**Fields:**
- `id`: UUID primary key for the relationship
- `supabase_uid`: Reference to user_profiles
- `tenant_id`: Reference to tenants
- `role`: 'admin' or 'user' (tenant-scoped)
  - `admin`: Can manage tenant, invite users, approve members
  - `user`: Can access tenant data
- `invited_by`: Which admin created this membership
- `invited_at`: When the invitation was created
- `accepted_at`: When user accepted (NULL = pending)
- `created_at`: Timestamp

#### 3. invitations

Token-based invitation system for onboarding new users.

```sql
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'user',

    -- Invitation management
    invited_by UUID NOT NULL REFERENCES user_profiles(supabase_uid),
    token VARCHAR(64) UNIQUE NOT NULL,  -- Cryptographically secure random token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- 7-day expiry
    accepted_at TIMESTAMP WITH TIME ZONE,  -- NULL = pending

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CHECK (role IN ('admin', 'user'))
);

CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_tenant_pending ON invitations(tenant_id)
    WHERE accepted_at IS NULL AND expires_at > NOW();

-- RLS: Only admins can view/manage invitations for their tenants
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage invitations"
ON invitations FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_tenants ut
        WHERE ut.supabase_uid = auth.uid()
        AND ut.tenant_id = invitations.tenant_id
        AND ut.role = 'admin'
        AND ut.accepted_at IS NOT NULL
    )
);
```

**Fields:**
- `id`: UUID primary key
- `email`: Email address being invited
- `tenant_id`: Which tenant they're joining
- `role`: Role they'll have in the tenant
- `invited_by`: Which admin created the invitation
- `token`: Cryptographically secure token (generated via `secrets.token_urlsafe(32)`)
- `expires_at`: Expiration time (7 days by default)
- `accepted_at`: When the invitation was accepted (NULL = pending)
- `created_at`: Timestamp

### Role Hierarchy

```
super-admin (system-wide)
    └── Can manage all tenants and users
    └── Can approve/reject user registrations
    └── Can assign tenant admins

admin (tenant-scoped)
    └── Can manage tenant settings
    └── Can invite users to tenant
    └── Can approve invitations
    └── Full access to tenant data

user (tenant-scoped)
    └── Can view and manage assigned data
    └── Cannot invite users or change settings
```

## Authentication Flows

### 1. User Registration (Email/Password)

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────┐
│ Frontend │      │ Supabase Auth│      │ PhotoCat API │      │ PostgreSQL│
└────┬─────┘      └──────┬───────┘      └──────┬───────┘      └────┬─────┘
     │                   │                     │                   │
     │ 1. signUp(email, password)              │                   │
     │──────────────────>│                     │                   │
     │                   │                     │                   │
     │ 2. Return Supabase UID + JWT            │                   │
     │<──────────────────│                     │                   │
     │                   │                     │                   │
     │ 3. POST /auth/register (JWT)            │                   │
     │─────────────────────────────────────────>                   │
     │                   │                     │                   │
     │                   │  4. Verify JWT      │                   │
     │                   │<────────────────────│                   │
     │                   │                     │                   │
     │                   │                     │ 5. Create user_profile
     │                   │                     │    (is_active=FALSE)
     │                   │                     │──────────────────>│
     │                   │                     │                   │
     │ 6. Return "pending approval"            │                   │
     │<─────────────────────────────────────────                   │
```

**Steps:**
1. User enters email and password in signup form
2. Frontend calls `supabase.auth.signUp(email, password)`
3. Supabase creates auth.users entry and returns JWT
4. Frontend calls `POST /auth/register` with JWT token
5. Backend verifies JWT, extracts supabase_uid
6. Backend creates user_profile with `is_active=FALSE`
7. Frontend shows message: "Registration pending admin approval"
8. Super admin reviews pending users and approves registration

### 2. Admin Approval

```
┌─────────┐        ┌──────────────┐        ┌──────────┐
│ Super   │        │ PhotoCat API │        │ PostgreSQL│
│ Admin   │        │              │        │          │
└────┬────┘        └──────┬───────┘        └────┬─────┘
     │                    │                     │
     │ 1. GET /admin/users/pending              │
     │───────────────────>                      │
     │                    │                     │
     │                    │ 2. Query pending users
     │                    │──────────────────>│
     │                    │                   │
     │ 3. Return list     │                   │
     │<───────────────────                     │
     │                    │                   │
     │ 4. POST /admin/users/{uid}/approve      │
     │───────────────────>                     │
     │                    │                   │
     │                    │ 5. SET is_active=TRUE
     │                    │──────────────────>│
     │                    │                   │
     │ 6. User activated  │                   │
     │<───────────────────                     │
```

**Steps:**
1. Super admin navigates to user management
2. Backend returns list of users with `is_active=FALSE`
3. Admin clicks "Approve" for a user
4. Frontend calls `POST /admin/users/{uid}/approve`
5. Backend sets `is_active=TRUE` and optionally creates tenant membership
6. User can now log in

### 3. User Login (Email/Password)

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────┐
│ Frontend │      │ Supabase Auth│      │ PhotoCat API │      │ PostgreSQL│
└────┬─────┘      └──────┬───────┘      └──────┬───────┘      └────┬─────┘
     │                   │                     │                   │
     │ 1. signIn(email, password)              │                   │
     │──────────────────>│                     │                   │
     │                   │                     │                   │
     │ 2. Return JWT (access + refresh tokens) │                   │
     │<──────────────────│                     │                   │
     │                   │                     │                   │
     │ 3. GET /auth/me (Authorization: Bearer <jwt>)               │
     │─────────────────────────────────────────>                   │
     │                   │                     │                   │
     │                   │  4. Verify JWT      │                   │
     │                   │<────────────────────│                   │
     │                   │                     │                   │
     │                   │                     │ 5. Fetch user_profile
     │                   │                     │    + user_tenants
     │                   │                     │──────────────────>│
     │                   │                     │                   │
     │                   │                     │ 6. Check is_active│
     │                   │                     │<──────────────────│
     │                   │                     │                   │
     │ 7. Return user + tenants (or 403 if not active)             │
     │<─────────────────────────────────────────                   │
```

**Steps:**
1. User enters email and password
2. Frontend calls `supabase.auth.signInWithPassword(email, password)`
3. Supabase returns JWT access token and refresh token
4. Frontend calls `GET /auth/me` with Bearer token
5. Backend verifies JWT signature and expiration
6. Backend checks user exists and `is_active=TRUE`
7. Backend returns user profile + list of tenant memberships
8. Frontend stores tokens and displays tenant selector

### 4. OAuth Login (Google)

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────┐
│ Frontend │      │ Supabase Auth│      │ PhotoCat API │      │ PostgreSQL│
└────┬─────┘      └──────┬───────┘      └──────┬───────┘      └────┬─────┘
     │                   │                     │                   │
     │ 1. signInWithOAuth({provider: 'google'})                    │
     │──────────────────>│                     │                   │
     │                   │                     │                   │
     │ 2. Open Google OAuth flow               │                   │
     │<─────────────────>│                     │                   │
     │                   │                     │                   │
     │ 3. Return JWT     │                     │                   │
     │<──────────────────│                     │                   │
     │                   │                     │                   │
     │ 4. GET /auth/me (Authorization: Bearer <jwt>)               │
     │─────────────────────────────────────────>                   │
     │                   │                     │                   │
     │                   │  5. Verify JWT      │                   │
     │                   │<────────────────────│                   │
     │                   │                     │                   │
     │                   │                     │ 6. Upsert user_profile
     │                   │                     │──────────────────>│
     │                   │                     │                   │
     │ 7. Return user + tenants                │                   │
     │<─────────────────────────────────────────                   │
```

**Differences from email/password:**
- Uses Supabase OAuth flow (Google, GitHub, etc.)
- User data comes from OAuth provider
- No approval needed if using `auto_approve_new_oauth_users` (configurable)
- Or requires approval if not configured

### 5. Invitation Flow

```
1. Tenant admin clicks "Invite User"
   ↓
2. Admin enters email, selects role
   ↓
3. System creates invitations record with:
   - Random token: secrets.token_urlsafe(32)
   - expires_at: NOW() + 7 days
   ↓
4. System sends email with invitation link:
   https://photocat.app/accept-invitation?token=xxx
   ↓
5. User clicks link, lands on registration/login page
   (Token extracted from URL query params)
   ↓
6. If new user:
   - User signs up via Supabase Auth
   - Frontend calls POST /auth/register
   - User account created (is_active=FALSE initially)
   ↓
7. User accepts invitation:
   - Frontend calls POST /auth/accept-invitation with token
   - Backend verifies token (correct email, not expired, not yet accepted)
   - Backend creates user_tenants entry with invited role
   - Backend sets user.is_active=TRUE (auto-approved via invitation)
   - Backend marks invitation.accepted_at=NOW()
   ↓
8. User can now access the tenant
```

**Key Properties:**
- Invitation tokens are one-time use (marked accepted_at)
- 7-day expiration
- Invitation auto-approves user (no super-admin approval needed)
- User gets specific role assigned by inviting admin

### 6. Tenant Access Control

```
┌──────────┐      ┌──────────────┐      ┌──────────┐
│ User     │      │ PhotoCat API │      │ PostgreSQL│
└────┬─────┘      └──────┬───────┘      └────┬─────┘
     │                   │                   │
     │ GET /images       │                   │
     │ (Authorization: Bearer <jwt>)         │
     │ (X-Tenant-ID: tenant-123)             │
     │──────────────────>                    │
     │                   │                   │
     │                   │ 1. Verify JWT     │
     │                   │                   │
     │                   │ 2. Check user.is_active
     │                   │
     │                   │ 3. Query user_tenants
     │                   │<──────────────────│
     │                   │ WHERE supabase_uid = ?
     │                   │ AND tenant_id = 'tenant-123'
     │                   │ AND accepted_at IS NOT NULL
     │                   │                   │
     │                   │                   │
     │ 4. If found: return images            │
     │    If not found: 403 Forbidden        │
     │<──────────────────                    │
```

**Access Control Logic:**
1. Backend receives request with Bearer token and X-Tenant-ID header
2. Verify JWT signature, expiration, audience
3. Load user_profile from database (must exist and is_active=TRUE)
4. Check if user is super_admin (bypass tenant check)
5. If not super admin:
   - Query user_tenants for membership
   - Require accepted_at IS NOT NULL (not pending)
   - Return 403 Forbidden if no membership
6. Load tenant data and check if active
7. Proceed with request

## API Endpoints

### Authentication Routes (`/api/v1/auth`)

#### POST /auth/register

Complete registration after Supabase signup.

```
Headers:
  Authorization: Bearer <supabase_jwt>

Body:
  {
    "display_name": "John Doe"  // optional
  }

Response (200):
  {
    "message": "Registration pending admin approval",
    "status": "pending_approval",
    "user_id": "550e8400-e29b-41d4-a716-446655440000"
  }

Response (409 - already registered):
  {
    "message": "Profile already exists",
    "status": "active" | "pending_approval"
  }

Response (401):
  {
    "detail": "Invalid or expired token"
  }
```

**Description:**
- User has signed up via Supabase Auth
- This endpoint creates their user_profile record
- Account starts with `is_active=FALSE` (requires admin approval)
- Returns immediately; admin must approve before user can access

#### GET /auth/me

Get current user info with tenant memberships.

```
Headers:
  Authorization: Bearer <supabase_jwt>

Response (200):
  {
    "user": {
      "supabase_uid": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "email_verified": true,
      "display_name": "John Doe",
      "photo_url": "https://...",
      "is_active": true,
      "is_super_admin": false,
      "created_at": "2026-01-28T10:00:00Z",
      "last_login_at": "2026-01-28T12:30:00Z"
    },
    "tenants": [
      {
        "tenant_id": "tenant-1",
        "tenant_name": "Acme Corp",
        "role": "admin",
        "accepted_at": "2026-01-25T15:00:00Z"
      },
      {
        "tenant_id": "tenant-2",
        "tenant_name": "Smith Family",
        "role": "user",
        "accepted_at": "2026-01-28T10:00:00Z"
      }
    ]
  }

Response (403 - account pending approval):
  {
    "detail": "Account pending admin approval"
  }

Response (401):
  {
    "detail": "Invalid or expired token"
  }
```

**Description:**
- Verifies JWT token and returns user profile
- Only returns accepted tenant memberships (excluded pending)
- Used by frontend to populate user menu and tenant selector
- Also updates user.last_login_at timestamp

#### POST /auth/accept-invitation

Accept an invitation and join a tenant.

```
Headers:
  Authorization: Bearer <supabase_jwt>

Body:
  {
    "invitation_token": "xxx-yyy-zzz"
  }

Response (200):
  {
    "user": { ... },  // user profile
    "tenants": [ ... ]  // updated list with new tenant
  }

Response (404 - invalid/expired token):
  {
    "detail": "Invalid or expired invitation"
  }

Response (401):
  {
    "detail": "Invalid or expired token"
  }
```

**Description:**
- User has clicked invitation link with token in URL
- Frontend extracts token and calls this endpoint with JWT
- Backend verifies:
  - Token exists and hasn't been used
  - Token hasn't expired
  - Email matches current user
- Backend creates user_tenants entry
- Backend sets user.is_active=TRUE (auto-approval via invitation)
- Returns updated user profile and tenant list

#### POST /auth/logout

Logout endpoint (server-side cleanup).

```
Headers:
  Authorization: Bearer <supabase_jwt>

Response (200):
  {
    "message": "Logged out successfully"
  }
```

**Description:**
- This is a no-op on the server side
- Client should:
  1. Call `supabase.auth.signOut()` to revoke token
  2. Clear localStorage/sessionStorage
  3. Clear cookies if using httpOnly cookies
- Server endpoint provided for future audit logging or explicit revocation

### User Management Routes (`/api/v1/admin/users`)

#### GET /admin/users/pending

List users pending approval (super-admin only).

```
Headers:
  Authorization: Bearer <super_admin_jwt>

Response (200):
  [
    {
      "supabase_uid": "...",
      "email": "pending@example.com",
      "display_name": "New User",
      "created_at": "2026-01-28T10:00:00Z"
    },
    ...
  ]

Response (403):
  {
    "detail": "Super admin role required"
  }
```

#### POST /admin/users/{supabase_uid}/approve

Approve a pending user.

```
Headers:
  Authorization: Bearer <super_admin_jwt>

Body:
  {
    "tenant_id": "tenant-1",  // optional
    "role": "user"  // default: "user"
  }

Response (200):
  {
    "message": "User approved",
    "user_id": "..."
  }

Response (403):
  {
    "detail": "Super admin role required"
  }
```

**Description:**
- Set user.is_active=TRUE
- If tenant_id provided: create user_tenants entry with specified role
- User can now log in

#### POST /admin/users/{supabase_uid}/reject

Reject a pending user (delete profile).

```
Headers:
  Authorization: Bearer <super_admin_jwt>

Response (200):
  {
    "message": "User rejected and deleted"
  }

Response (403):
  {
    "detail": "Super admin role required"
  }
```

### Invitation Routes (`/api/v1/admin/invitations`)

#### POST /admin/invitations

Create invitation for new user to join tenant.

```
Headers:
  Authorization: Bearer <admin_jwt>

Body:
  {
    "email": "newuser@example.com",
    "tenant_id": "tenant-1",
    "role": "user"  // default
  }

Response (201):
  {
    "message": "Invitation created",
    "invitation_id": "...",
    "token": "xxx-yyy-zzz",  // Return for demo, remove in production
    "expires_at": "2026-02-04T10:00:00Z"
  }

Response (400 - already invited):
  {
    "detail": "Invitation already exists for this email"
  }

Response (403):
  {
    "detail": "Admin role required for this tenant"
  }
```

**Description:**
- Create invitation with cryptographically secure token
- Token doesn't expire for 7 days
- Only tenant admins can create invitations for their tenants
- Future: Send invitation email with link

#### GET /admin/invitations

List invitations (pending and accepted).

```
Headers:
  Authorization: Bearer <admin_jwt>

Query Params:
  ?tenant_id=tenant-1  // required if not super-admin

Response (200):
  [
    {
      "id": "...",
      "email": "user@example.com",
      "tenant_id": "tenant-1",
      "role": "user",
      "expires_at": "2026-02-04T10:00:00Z",
      "accepted_at": null,  // null = pending
      "created_at": "2026-01-28T10:00:00Z"
    },
    ...
  ]
```

#### DELETE /admin/invitations/{invitation_id}

Cancel an invitation.

```
Headers:
  Authorization: Bearer <admin_jwt>

Response (200):
  {
    "message": "Invitation cancelled"
  }

Response (403):
  {
    "detail": "Access denied"
  }
```

## Security Considerations

### Token Verification

**JWKS Endpoint (Recommended):**

```python
# Supabase exposes public keys at:
# https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json

from jose import jwt

def verify_supabase_jwt(token: str):
    """Verify JWT using Supabase JWKS endpoint."""
    jwks = fetch_and_cache_jwks()  # JWKS is cached

    decoded = jwt.decode(
        token,
        jwks,
        algorithms=["ES256"],  # Supabase uses ES256
        audience="authenticated",
        options={
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": True,
        }
    )

    return decoded  # Contains 'sub' (supabase_uid)
```

**Benefits:**
- Asymmetric key verification (public keys from JWKS)
- No shared secrets in code
- Cacheable for performance (1-hour TTL)
- Supabase-recommended approach
- Immediate token revocation possible (with Supabase Pro)

### Row Level Security (RLS)

RLS provides defense-in-depth on authentication tables:

```sql
-- user_profiles: Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON user_profiles FOR SELECT
USING (supabase_uid = auth.uid());

-- user_tenants: Users can view their own memberships
CREATE POLICY "Users can view their own tenant memberships"
ON user_tenants FOR SELECT
USING (supabase_uid = auth.uid());

-- invitations: Admins can manage invitations for their tenants
CREATE POLICY "Tenant admins can manage invitations"
ON invitations FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_tenants ut
        WHERE ut.supabase_uid = auth.uid()
        AND ut.tenant_id = invitations.tenant_id
        AND ut.role = 'admin'
    )
);
```

**Rationale:**
- RLS automatically enforces row visibility at the database level
- Provides protection even if application-level checks fail
- Helps with complex tenant-scoped queries
- Can be bypassed with `supabase_service_role_key` (server-only)

**Limitations:**
- RLS adds query overhead
- Complex business logic is easier to implement in application code
- Not used for image access (handled at application level)

### Token Storage

**Recommended: localStorage + httpOnly cookies (hybrid approach)**

**MVP: localStorage only**
- Supabase JS client stores tokens in localStorage by default
- Simpler to implement
- Token is accessible to JavaScript (XSS risk)
- Future improvement: migrate to httpOnly cookies

**Token Refresh:**
- Supabase access tokens expire in 1 hour
- Refresh tokens last 7 days
- Supabase JS client automatically refreshes access tokens
- No backend involvement needed for refresh

### Invitation Token Security

```python
import secrets

# Generate cryptographically secure token
token = secrets.token_urlsafe(32)  # 256-bit entropy

# Store in database (plaintext is acceptable for short-lived tokens)
# Future: Store hash instead
import hashlib
token_hash = hashlib.sha256(token.encode()).hexdigest()
```

**Best Practices:**
- Use `secrets.token_urlsafe()` for cryptographic randomness
- 7-day expiration (not too short, not too long)
- One-time use (mark accepted_at after acceptance)
- Secure email transmission (HTTPS links only)
- Future: Store hash instead of plaintext to reduce DB leak impact

### Rate Limiting

**Supabase Auth:**
- Built-in rate limiting on authentication attempts
- 5 login attempts per minute per IP
- 3 password reset requests per hour per email

**Application-Level:**
- Future: Add Rate Limiting middleware to FastAPI
- Future: Use Google Cloud Armor for DDoS protection
- Monitor auth endpoint abuse in Cloud Logging

### CORS and Headers

**CORS Configuration:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://photocat.example.com"],  # Don't use ["*"]
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**CSP Headers:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.supabase.co;
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

## Database Migration

### Migration File Structure

**File:** `alembic/versions/202601290100_add_supabase_auth_tables.py`

```python
"""Add Supabase Auth tables (user_profiles, user_tenants, invitations)

Revision ID: 202601290100
Revises: 202601271530
Create Date: 2026-01-29 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # 1. Create user_profiles table
    op.create_table(
        'user_profiles',
        sa.Column('supabase_uid', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        # ... other columns ...
        sa.PrimaryKeyConstraint('supabase_uid'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('idx_user_profiles_email', 'user_profiles', ['email'])
    op.create_index('idx_user_profiles_is_active', 'user_profiles', ['is_active'])

    # 2. Enable RLS
    op.execute('ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY')
    op.execute('''
        CREATE POLICY "Users can view their own profile"
        ON user_profiles FOR SELECT
        USING (supabase_uid = auth.uid())
    ''')

    # 3. Create user_tenants table
    op.create_table(
        'user_tenants',
        # ... columns ...
    )
    # ... indexes and RLS ...

    # 4. Create invitations table
    op.create_table(
        'invitations',
        # ... columns ...
    )
    # ... indexes and RLS ...

    op.execute('COMMIT')

def downgrade():
    # Drop in reverse order
    op.drop_table('invitations')
    op.drop_table('user_tenants')
    op.drop_table('user_profiles')
```

**Migration Pattern:**
- Matches existing PhotoCat migration style
- Creates tables first
- Adds indexes second
- Enables RLS and policies third
- Uses explicit COMMIT for immediate effect

## Implementation Phases

### Phase 1: Database Setup (Day 1)
- Create Alembic migration with auth tables + RLS policies
- Test migration on dev database
- Verify RLS policies work correctly

### Phase 2: Backend Auth Module (Days 2-3)
- Install dependencies: `pip install supabase python-jose[cryptography]`
- Create `src/photocat/auth/` module
- Implement JWT verification with JWKS
- Create SQLAlchemy models and Pydantic schemas
- Create FastAPI dependencies

### Phase 3: Backend Routers (Day 4)
- Create `src/photocat/routers/auth.py` with auth endpoints
- Create `src/photocat/routers/admin_users.py` with admin endpoints
- Update `src/photocat/dependencies.py` to require auth
- Update `src/photocat/api.py` to include new routers

### Phase 4: Frontend Auth (Days 5-6)
- Install Supabase JS client: `npm install @supabase/supabase-js`
- Create `frontend/services/supabase.js` client setup
- Create `frontend/services/auth.js` auth functions
- Update `frontend/services/api.js` to use Bearer tokens
- Create `frontend/components/login-page.js`
- Create `frontend/components/signup-page.js`
- Create `frontend/components/auth-guard.js`
- Update `frontend/main.js` routing

### Phase 5: Bootstrap Super Admin (Day 7)
- First user signs up via frontend
- Manually promote to super admin via SQL:
  ```sql
  UPDATE user_profiles
  SET is_active = TRUE, is_super_admin = TRUE
  WHERE email = 'admin@example.com';
  ```

### Phase 6: Production Deployment (Day 8)
- Store Supabase secrets in Google Secret Manager
- Update `cloudbuild.yaml` with Supabase env vars
- Run migration on production
- Deploy backend and frontend
- Bootstrap first super admin

### Phase 7: Endpoint Updates (Days 9+)
- Verify all endpoints require authentication
- Remove legacy X-Tenant-ID-only code paths
- Test all major user flows

## Frontend Integration

### Supabase Client Setup

```javascript
// frontend/services/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
```

### Auth Service

```javascript
// frontend/services/auth.js
import { supabase } from './supabase.js';

export async function signUp(email, password, displayName) {
  const { data } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  // Complete registration in backend
  await fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}
```

### API Service Update

```javascript
// frontend/services/api.js
import { getAccessToken } from './supabase.js';

export async function fetchWithAuth(url, options = {}) {
  const token = await getAccessToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId,  // Still needed for tenant selection
    },
  });
}
```

## Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres?sslmode=require

# Supabase Auth
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Frontend (frontend/.env)

```bash
# Supabase (public keys, safe to expose)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Cloud Run Deployment

```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'photocat-api'
      - '--image=gcr.io/$PROJECT_ID/photocat-api'
      - '--region=us-central1'
      - '--set-env-vars=SUPABASE_URL=https://xxx.supabase.co'
      - '--set-secrets=SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest'
      - '--set-env-vars=DATABASE_URL=$_DATABASE_URL'
```

## Testing

### Unit Tests

```python
# tests/test_auth_jwt.py
def test_verify_valid_jwt():
    # Test JWT verification with valid token

def test_verify_expired_jwt():
    # Test expired token rejection

def test_get_supabase_uid():
    # Test extracting UUID from JWT
```

### Integration Tests

```python
# tests/test_auth_endpoints.py
def test_register_flow():
    # Test signup → register → pending approval

def test_login_requires_approval():
    # Test unapproved users get 403

def test_tenant_access_control():
    # Test users can't access unassigned tenants
```

### Manual Testing Checklist

- [ ] Sign up with email/password
- [ ] Sign up with Google OAuth
- [ ] Admin approves user
- [ ] User logs in
- [ ] User can access assigned tenant
- [ ] User CANNOT access unassigned tenant
- [ ] Token auto-refreshes after 1 hour
- [ ] Logout clears tokens
- [ ] Invitation flow works end-to-end
- [ ] Super admin can manage all tenants
- [ ] Tenant admin can invite users
- [ ] Regular user CANNOT invite users

## Known Limitations and Future Work

### MVP Limitations

1. **No email service** - Invitations return token in API (not emailed)
   - Future: Add SendGrid/Mailgun integration

2. **No password reset UI** - Supabase handles backend
   - Future: Create password-reset-page.js component

3. **No user profile editing** - Users can't update display_name
   - Future: Add PATCH /auth/profile endpoint

4. **No audit logging** - No record of who did what
   - Future: Add audit_log table and middleware

5. **localStorage token storage** - XSS risk
   - Future: Migrate to httpOnly cookies

### Supabase Configuration Requirements

- Supabase project created
- Auth providers enabled (Email/Password, Google OAuth)
- Database connection string configured (Session Pooler for IPv4)
- API keys generated (anon key, service role key)
- Secrets stored in Google Secret Manager

## Success Criteria

Implementation is complete when:
1. Users can sign up with email/password or Google OAuth
2. Admin approval workflow works
3. Users can log in and see assigned tenants
4. Authorization enforces tenant membership
5. Invitation flow works end-to-end
6. Roles are enforced (super-admin, tenant admin, user)
7. All endpoints protected by authentication
8. Token refresh works automatically
9. Production deployment successful
10. First super admin bootstrapped

## References

- [Supabase Authentication Documentation](https://supabase.com/docs/guides/auth)
- [Supabase JWT Documentation](https://supabase.com/docs/guides/auth/jwts)
- [Row Level Security in Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Python Client](https://github.com/supabase/supabase-py)
- [python-jose Documentation](https://python-jose.readthedocs.io/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Original Firebase Auth Architecture](./auth-architecture.md)
