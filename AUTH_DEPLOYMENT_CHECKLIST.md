# Supabase Auth Deployment Checklist

## Pre-Deployment

### Environment Setup
- [ ] Supabase project created
- [ ] Supabase Auth enabled with Email/Password provider
- [ ] Google OAuth credentials configured (if using OAuth)
- [ ] Database migrations tested locally
- [ ] All environment variables set in `.env` files
- [ ] Dependencies installed (`pip install -e ".[dev]"`, `npm install`)

### Code Verification
- [ ] Migration file created: `alembic/versions/202601290100_add_supabase_auth_tables.py`
- [ ] Auth module created: `src/photocat/auth/` (6 files)
- [ ] Auth routers created: `src/photocat/routers/auth.py`, `admin_users.py`
- [ ] Frontend services created: `supabase.js`, `auth.js`, updated `api.js`
- [ ] Frontend components created: `login-page.js`, `signup-page.js`, `auth-guard.js`
- [ ] Main routing updated: `frontend/main.js`
- [ ] Dependencies updated: `pyproject.toml` includes `python-jose[cryptography]`
- [ ] All imports verify without errors

### Local Testing Complete
- [ ] Backend runs without errors: `make dev`
- [ ] Frontend runs without errors: `npm run dev`
- [ ] Migration runs without errors: `alembic upgrade head`
- [ ] Login page loads: `http://localhost:5173/login`
- [ ] Signup page loads: `http://localhost:5173/signup`
- [ ] Email/password signup works
- [ ] Email/password login works
- [ ] Google OAuth works (if configured)
- [ ] Admin approval flow works
- [ ] Invitation creation works
- [ ] Invitation acceptance works
- [ ] Tenant access control enforced

## Deployment Steps

### Phase 1: Database
- [ ] Store Supabase secrets in Google Secret Manager
- [ ] Add `SUPABASE_URL` to Secret Manager
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to Secret Manager
- [ ] Create Supabase Auth project in production account
- [ ] Enable Email/Password provider
- [ ] Enable Google OAuth provider (if applicable)
- [ ] Run migration on production database:
  ```bash
  DATABASE_URL="$DATABASE_URL" alembic upgrade head
  ```
- [ ] Verify tables created in production:
  ```sql
  SELECT * FROM user_profiles LIMIT 1;
  SELECT * FROM user_tenants LIMIT 1;
  SELECT * FROM invitations LIMIT 1;
  ```

### Phase 2: Backend
- [ ] Update `cloudbuild.yaml` with new environment variables:
  ```yaml
  --set-env-vars=SUPABASE_URL=${_SUPABASE_URL}
  --set-secrets=SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
  ```
- [ ] Deploy backend to Cloud Run:
  ```bash
  make deploy-api
  ```
- [ ] Verify API deployed: `curl https://api.photocat.app/health`
- [ ] Check auth endpoints respond: `curl https://api.photocat.app/api/v1/auth/me`
- [ ] Monitor Cloud Logging for errors

### Phase 3: Frontend
- [ ] Add Supabase environment variables to frontend build:
  ```bash
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...
  ```
- [ ] Run frontend build test locally: `npm run build`
- [ ] Deploy frontend to Cloud Run or CDN:
  ```bash
  make deploy-frontend
  ```
- [ ] Verify frontend loads: `https://photocat.app/login`
- [ ] Test login/signup pages load correctly

### Phase 4: Bootstrap First Super Admin
```bash
# Option 1: Via CLI
source venv/bin/activate
export DATABASE_URL="production_url"
python -c "
from photocat.database import SessionLocal
from photocat.auth.models import UserProfile

db = SessionLocal()
user = db.query(UserProfile).filter_by(email='admin@example.com').first()
if user:
    user.is_active = True
    user.is_super_admin = True
    db.commit()
    print(f'Promoted {user.email} to super admin')
"
```

Or Option 2: Via SQL
```sql
UPDATE user_profiles
SET is_active = TRUE, is_super_admin = TRUE
WHERE email = 'admin@example.com';
```

### Phase 5: Production Testing
- [ ] Test signup flow in production
- [ ] Approve user as super admin
- [ ] Test login with approved user
- [ ] Test OAuth flow (if applicable)
- [ ] Test invitation creation and acceptance
- [ ] Test tenant access control
- [ ] Monitor Cloud Logging for errors
- [ ] Check Cloud Monitoring for performance metrics

## Post-Deployment

### Monitoring
- [ ] Set up Cloud Logging alerts for 401/403 errors
- [ ] Monitor token verification errors
- [ ] Track failed logins
- [ ] Monitor database performance
- [ ] Set up uptime monitoring for auth endpoints

### Notification
- [ ] Create first super-admin account manually
- [ ] Notify admins of how to approve users
- [ ] Document OAuth flow for users
- [ ] Create user guides for signup/login

### Security Review
- [ ] Verify CORS settings appropriate for production
- [ ] Verify JWT verification working correctly
- [ ] Verify tenant access control enforced
- [ ] Check for exposed credentials in logs
- [ ] Review RLS policies are active
- [ ] Test SQL injection attempts (should be blocked by ORM)

### Future Improvements
- [ ] [ ] Email service integration (SendGrid/Mailgun)
- [ ] [ ] Password reset flow
- [ ] [ ] Email verification
- [ ] [ ] User profile editing
- [ ] [ ] Audit logging
- [ ] [ ] Session timeout
- [ ] [ ] Two-factor authentication
- [ ] [ ] HTTP-only cookies (replace localStorage)

## Rollback Plan

If deployment fails:

### Revert Frontend
```bash
gcloud run services update-traffic photocat-frontend \
  --to-revisions PREVIOUS_REVISION=100
```

### Revert Backend
```bash
gcloud run services update-traffic photocat-api \
  --to-revisions PREVIOUS_REVISION=100
```

### Revert Database
```bash
DATABASE_URL="$PROD_DATABASE_URL" alembic downgrade -1
```

## Communication

### Before Deployment
- [ ] Notify team of maintenance window
- [ ] Update status page
- [ ] Prepare rollback instructions

### During Deployment
- [ ] Monitor error rates
- [ ] Check user reports
- [ ] Be ready to rollback

### After Deployment
- [ ] Announce completion
- [ ] Document any issues encountered
- [ ] Create post-mortem if needed

## Success Criteria

Deployment is successful when:
1. ✅ All environment variables configured
2. ✅ Database migration completed
3. ✅ Backend deployed and responding
4. ✅ Frontend deployed and loading
5. ✅ Signup flow works end-to-end
6. ✅ Login flow works end-to-end
7. ✅ Admin approval works
8. ✅ Invitation flow works
9. ✅ Tenant access control enforced
10. ✅ Error logs show no critical issues
11. ✅ Users can access the application
12. ✅ First super-admin created

## Support Contacts

For issues during deployment:
- Backend issues: Check Cloud Logging and Cloud Run
- Database issues: Check Supabase dashboard
- Frontend issues: Check browser console
- OAuth issues: Check Supabase Auth settings
- General: Review [TESTING_AUTH.md](TESTING_AUTH.md) for debugging

## Documentation Links

- [Architecture](docs/supabase-auth-architecture.md)
- [Implementation Summary](AUTH_IMPLEMENTATION_SUMMARY.md)
- [Testing Guide](TESTING_AUTH.md)
- [Original Plan](../../.claude/plans/nifty-crunching-dongarra.md)

---

**Deployment Owner**: [Your Name]
**Deployment Date**: [Date]
**Deployment Version**: 1.0.0 (Initial Supabase Auth)
