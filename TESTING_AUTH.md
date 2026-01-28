# Supabase Auth Testing Guide

## Prerequisites

Before testing, ensure you have:
1. Supabase project created with Auth enabled
2. Google OAuth credentials configured in Supabase
3. Environment variables set (see Configuration section)
4. Dependencies installed
5. Database migration applied

## Configuration

### Step 1: Backend Environment

Create `.env` in project root:
```bash
# Database (existing)
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres?sslmode=require

# Supabase Auth
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Existing
GCP_PROJECT_ID=photocat-483622
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Step 2: Frontend Environment

Create `frontend/.env`:
```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 3: Install Dependencies

```bash
# Backend
pip install -e ".[dev]"

# Frontend
npm install
```

### Step 4: Run Migration

```bash
source venv/bin/activate
DATABASE_URL="$DATABASE_URL" alembic upgrade head
```

## Testing Scenarios

### Test 1: Email/Password Registration & Approval

**Setup**: None required

**Steps**:
1. Start backend: `make dev`
2. Start frontend: `npm run dev`
3. Visit http://localhost:5173/signup
4. Fill in:
   - Display Name: "Test User"
   - Email: test@example.com
   - Password: SecurePassword123
   - Confirm: SecurePassword123
5. Click "Sign Up"

**Expected**:
- ✅ "Account created! Awaiting admin approval" message
- ✅ Redirects to /login
- ✅ User created in Supabase Auth
- ✅ user_profile created with is_active=FALSE

**Verify in Backend**:
```sql
SELECT email, is_active FROM user_profiles WHERE email = 'test@example.com';
-- Should return: test@example.com | false
```

**Approve User**:
```python
# Get Supabase UID from user_profiles table
uid = "550e8400-e29b-41d4-a716-446655440000"  # Replace with actual UID

# Call API (need Bearer token as super-admin)
curl -X POST http://localhost:8000/api/v1/admin/users/{uid}/approve \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "tenant-1"}'
```

**Alternative - Direct SQL**:
```sql
UPDATE user_profiles
SET is_active = TRUE, is_super_admin = TRUE
WHERE email = 'test@example.com';
```

---

### Test 2: Email/Password Login

**Prerequisites**:
- User registered and approved (Test 1)
- User has is_active=TRUE

**Steps**:
1. Visit http://localhost:5173/login
2. Enter:
   - Email: test@example.com
   - Password: SecurePassword123
3. Click "Sign In"

**Expected**:
- ✅ Logs in successfully
- ✅ Redirects to / (main app)
- ✅ Auth-guard shows app (not error)
- ✅ last_login_at updated in database

**Verify in Backend**:
```sql
SELECT email, last_login_at FROM user_profiles WHERE email = 'test@example.com';
-- Should show recent timestamp
```

---

### Test 3: Google OAuth

**Prerequisites**:
- Google OAuth credentials configured in Supabase
- Google OAuth provider enabled in Supabase Auth

**Steps**:
1. Visit http://localhost:5173/signup
2. Click "Continue with Google"
3. Complete Google consent screen
4. Browser redirects to /auth/callback
5. After redirect, lands on main app

**Expected**:
- ✅ OAuth flow completes
- ✅ User created in Supabase Auth
- ✅ user_profile created with is_active=FALSE
- ✅ Can login but will see "Account Pending Approval" error

**Note**: First-time OAuth users start as pending approval. Approve via admin endpoint.

---

### Test 4: Invitation Flow

**Prerequisites**:
- Admin user with is_active=TRUE and admin role in a tenant
- Tenant exists (e.g., "demo" or "tenant-1")

**Steps**:

**Part A: Create Invitation**
```bash
# Get admin's access token (after login)
TOKEN="eyJ..." # From browser console or login response

# Create invitation
curl -X POST http://localhost:8000/api/v1/admin/invitations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invited@example.com",
    "tenant_id": "demo",
    "role": "user"
  }'
```

**Expected Response**:
```json
{
  "message": "Invitation created",
  "invitation_id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "expires_at": "2026-02-05T10:00:00"
}
```

**Copy the token** (you'll need it for Part B)

**Part B: Accept Invitation**
1. Sign up new user (invited@example.com)
2. In browser console after signup:
```javascript
const response = await fetch('/api/v1/auth/accept-invitation', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${await getAccessToken()}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    invitation_token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // From Part A
  })
});
const result = await response.json();
console.log(result);
```

**Expected**:
- ✅ User is_active set to TRUE (auto-approved)
- ✅ user_tenants entry created with role='user'
- ✅ Invitation marked as accepted
- ✅ User can now access the tenant

**Verify in Backend**:
```sql
-- Check user activation
SELECT email, is_active FROM user_profiles WHERE email = 'invited@example.com';
-- Should return: invited@example.com | true

-- Check tenant membership
SELECT * FROM user_tenants
WHERE supabase_uid = (SELECT supabase_uid FROM user_profiles WHERE email = 'invited@example.com');
-- Should show membership with role='user' and accepted_at not null
```

---

### Test 5: Tenant Access Control

**Prerequisites**:
- User belongs to "demo" tenant
- Another tenant "other" exists
- User is NOT member of "other" tenant

**Steps**:
```bash
# Get user's token
TOKEN="eyJ..." # After login

# Try to access "demo" (should work)
curl -X GET http://localhost:8000/api/v1/images \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: demo"
```

**Expected**:
- ✅ Returns images for "demo" tenant

```bash
# Try to access "other" (should fail)
curl -X GET http://localhost:8000/api/v1/images \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: other"
```

**Expected**:
- ✅ Returns 403: "No access to tenant other"

---

### Test 6: Logout

**Steps**:
1. Logged in to app
2. Click logout/profile menu
3. App calls `supabase.auth.signOut()`

**Expected**:
- ✅ Clears session in Supabase
- ✅ Clears localStorage
- ✅ Redirects to /login
- ✅ Can't access app anymore

---

### Test 7: Token Expiration & Refresh

**Prerequisites**:
- Logged in user

**Steps**:
1. Open browser DevTools → Application → LocalStorage
2. Find `supabase.auth.token` - note the expiration (usually 1 hour)
3. Leave app running for a minute
4. Make an API call to any protected endpoint

**Expected**:
- ✅ Token automatically refreshes before expiry
- ✅ API calls continue to work
- ✅ No user sees logout prompt

---

## Common Issues & Debugging

### Issue: "Missing Supabase environment variables"

**Cause**: `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` not set

**Fix**:
```bash
# Check frontend/.env exists and has values
cat frontend/.env

# If missing, add them:
echo 'VITE_SUPABASE_URL=https://xxx.supabase.co' >> frontend/.env
echo 'VITE_SUPABASE_ANON_KEY=eyJ...' >> frontend/.env

# Restart dev server
npm run dev
```

### Issue: JWT verification fails (401 Unauthorized)

**Cause**: Backend can't fetch JWKS or token is invalid

**Fix**:
1. Verify `SUPABASE_URL` is correct
2. Check JWKS endpoint is accessible: `curl https://xxx.supabase.co/auth/v1/.well-known/jwks.json`
3. Verify token is in correct format: `Authorization: Bearer <token>`

### Issue: User shows "Account Pending Approval"

**Cause**: User's is_active=FALSE

**Fix**: Approve user via admin endpoint (see Test 1)

### Issue: "No access to tenant"

**Cause**: User not member of tenant or membership not accepted

**Fix**:
1. Verify user_tenants entry exists: `SELECT * FROM user_tenants WHERE supabase_uid = '<uid>' AND tenant_id = '<tenant>';`
2. Check accepted_at is not NULL
3. Create membership via admin endpoint or invitation

### Issue: OAuth redirects to Supabase login instead of Google

**Cause**: Google OAuth provider not configured in Supabase

**Fix**:
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable "Google" and add OAuth credentials
3. Restart frontend dev server

### Issue: Invitation token invalid

**Cause**: Token expired or already accepted

**Fix**:
1. Check expires_at: `SELECT expires_at, accepted_at FROM invitations WHERE token = '<token>';`
2. Create new invitation if expired
3. Use `DELETE` endpoint to cancel and retry

---

## Test Database Snapshot

After completing all tests, your database should have:

```sql
-- Check tables exist
\dt user_profiles user_tenants invitations;

-- Check sample data
SELECT email, is_active FROM user_profiles;
SELECT supabase_uid, tenant_id, role, accepted_at FROM user_tenants;
SELECT email, expires_at, accepted_at FROM invitations;
```

---

## Monitoring & Logs

### Backend Logs
```bash
# Run with verbose logging
PYTHONUNBUFFERED=1 uvicorn photocat.api:app --reload --log-level debug
```

Look for:
- `JWT verification failed` → Token issue
- `No access to tenant` → Authorization failure
- `User profile not found` → Missing user_profiles entry

### Frontend Logs
```javascript
// In browser console
// Check auth state
const { data } = await supabase.auth.getSession();
console.log(data);

// Check token
const token = await getAccessToken();
console.log(token);

// Decode token (for debugging)
const parts = token.split('.');
const decoded = JSON.parse(atob(parts[1]));
console.log(decoded);
```

---

## Success Checklist

- [ ] Backend migration runs without errors
- [ ] Frontend loads /login page
- [ ] Can sign up with email/password
- [ ] Registration shows pending approval message
- [ ] Super admin can approve user
- [ ] User can log in after approval
- [ ] Logout works and redirects to login
- [ ] Google OAuth works (if configured)
- [ ] Admin can create invitations
- [ ] User can accept invitations
- [ ] Tenant access control enforces membership
- [ ] Token auto-refreshes
- [ ] All endpoints require Bearer token

---

## Next Steps

After successful testing:
1. Deploy to production
2. Configure real Supabase project
3. Set up email service for invitations
4. Create first super-admin user
5. Monitor auth logs in production

For detailed architecture, see: [docs/supabase-auth-architecture.md](docs/supabase-auth-architecture.md)
