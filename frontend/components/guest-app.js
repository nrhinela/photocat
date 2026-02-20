import { LitElement, html, css } from 'lit';
import { onAuthStateChange, getSession } from '../services/supabase.js';
import { verifyOtpCode } from '../services/auth.js';
import './guest-list-view.js';

/**
 * Guest Application Root Component
 *
 * Entry point for guest users accessing shared lists.
 * Handles authentication via Supabase magic links and routes to list view.
 *
 * Flow:
 * 1. User clicks magic link from email (format: /guest#access_token=...)
 * 2. Supabase JS client exchanges hash for session
 * 3. JWT contains user_role='guest' and tenant_ids array
 * 4. Component validates guest role and routes to list view
 *
 * @property {Boolean} authenticated - Whether user has valid session
 * @property {Boolean} loading - Loading state
 * @property {Boolean} isGuest - Whether user has guest role in JWT
 * @property {String} error - Error message if any
 * @property {String} tenantId - Current tenant ID from URL or JWT
 * @property {Number} listId - List ID from URL
 */
export class GuestApp extends LitElement {
  static properties = {
    authenticated: { type: Boolean },
    loading: { type: Boolean },
    isGuest: { type: Boolean },
    error: { type: String },
    tenantId: { type: String },
    listId: { type: Number },
    // New properties for auth flow
    authEmail: { type: String },
    authLoading: { type: Boolean },
    authMessage: { type: String },
    authSuccess: { type: Boolean },
    authCode: { type: String },
    verifyLoading: { type: Boolean },
    verifyMessage: { type: String },
    currentUser: { type: Object },
    userMenuOpen: { type: Boolean },
    guestTenantIds: { type: Array },
    collectionsRefreshing: { type: Boolean },
  };

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .loading-screen {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .loading-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 32px 48px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      backdrop-filter: blur(6px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
    }

    .loading-title {
      font-size: 24px;
      font-weight: 700;
      color: white;
    }

    .spinner {
      text-align: center;
      color: white;
    }

    .spinner-animation {
      width: 50px;
      height: 50px;
      margin: 0 auto 1rem;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .loading-text {
      font-size: 14px;
      opacity: 0.9;
    }

    .error-screen {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }

    .error-card {
      text-align: center;
      max-width: 500px;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      backdrop-filter: blur(6px);
    }

    .error-card h1 {
      margin: 0 0 1rem 0;
      font-size: 24px;
      font-weight: 700;
    }

    .error-card p {
      margin: 0 0 1.5rem 0;
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.5;
    }

    .error-card a,
    .error-card button {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: white;
      color: #667eea;
      text-decoration: none;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .error-card a:hover,
    .error-card button:hover {
      background: #f5f5f5;
      transform: translateY(-1px);
    }

    .guest-shell {
      min-height: 100vh;
      background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.1), transparent 45%), #f3f4f6;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .guest-topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, 0.95);
      border-bottom: 1px solid #e5e7eb;
      backdrop-filter: blur(8px);
    }
    .guest-topbar-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .guest-topbar-actions {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }
    .guest-brand-title {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.1;
      color: #111827;
      margin: 0;
    }
    .guest-brand-subtitle {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.4;
      margin: 4px 0 0 0;
    }
    .guest-content {
      max-width: 1240px;
      margin: 0 auto;
      padding: 24px 20px 32px;
    }
    .guest-panel {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .guest-panel-title {
      margin: 0;
      font-size: 22px;
      color: #111827;
      font-weight: 700;
    }
    .guest-panel-subtitle {
      margin: 8px 0 0 0;
      font-size: 14px;
      color: #6b7280;
    }
    .guest-list-grid {
      margin-top: 18px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }
    .guest-list-card {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      background: #ffffff;
      padding: 14px;
      text-align: left;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .guest-list-card:hover {
      transform: translateY(-1px);
      border-color: #2563eb;
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
    }
    .guest-list-name {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }
    .guest-list-meta {
      margin-top: 6px;
      font-size: 13px;
      color: #6b7280;
    }
    .guest-list-shared-by {
      margin-top: 6px;
      font-size: 13px;
      color: #374151;
    }
    .guest-list-dates {
      margin-top: 8px;
      display: grid;
      gap: 2px;
      font-size: 12px;
      color: #6b7280;
    }
    .guest-list-footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #4b5563;
      font-weight: 600;
    }
    .guest-reviewed-ok {
      color: #16a34a;
      font-weight: 700;
      margin-left: 8px;
    }
    .guest-user-menu {
      position: relative;
    }
    .guest-avatar-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 40px;
      width: 40px;
      border-radius: 9999px;
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      border: 1px solid rgba(15, 23, 42, 0.08);
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
      cursor: pointer;
    }
    .guest-user-dropdown {
      position: absolute;
      right: 0;
      top: 46px;
      min-width: 280px;
      max-width: min(86vw, 360px);
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.16);
      z-index: 50;
      overflow: hidden;
    }
    .guest-user-head {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .guest-user-name {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .guest-user-email {
      margin-top: 2px;
      font-size: 12px;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .guest-user-action {
      width: 100%;
      text-align: left;
      border: none;
      border-top: 1px solid #f8fafc;
      background: #ffffff;
      padding: 10px 14px;
      font-size: 13px;
      color: #374151;
      cursor: pointer;
    }
    .guest-user-action:hover {
      background: #f8fafc;
    }
    .guest-user-action.signout {
      color: #b91c1c;
    }
    .guest-refresh-btn {
      border: 1px solid #d1d5db;
      background: #ffffff;
      color: #374151;
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .guest-refresh-btn:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }
  `;

  constructor() {
    super();
    this.authenticated = false;
    this.loading = true;
    this.isGuest = false;
    this.error = null;
    this.availableLists = null; // List of accessible lists when no list_id provided
    this.tenantId = null;
    this.listId = null;
    // Auth flow state
    this.authEmail = '';
    this.authLoading = false;
    this.authMessage = '';
    this.authSuccess = false;
    this.authCode = '';
    this.verifyLoading = false;
    this.verifyMessage = '';
    this.currentUser = null;
    this.userMenuOpen = false;
    this.guestTenantIds = [];
    this.collectionsRefreshing = false;
    this._handleDocumentClick = this._handleDocumentClick.bind(this);
    this._handleWindowFocus = this._handleWindowFocus.bind(this);
  }

  async connectedCallback() {
    super.connectedCallback();

    // Parse URL for list ID, tenant ID, and email
    const urlParams = new URLSearchParams(window.location.search);
    let listIdParam = urlParams.get('list_id');
    let tenantIdParam = urlParams.get('tenant_id');
    const emailParam = urlParams.get('email');

    // Pre-fill email if provided in URL
    if (emailParam) {
      this.authEmail = emailParam;
    }

    // Then try hash fragment (new method from invite links: #list_id,tenant_id)
    if (!listIdParam && window.location.hash) {
      const hash = window.location.hash.substring(1); // Remove #
      const parts = hash.split(',');
      if (
        parts.length >= 2 &&
        /^\d+$/.test(parts[0]) &&
        /^[0-9a-fA-F-]{36}$/.test(parts[1])
      ) {
        listIdParam = parts[0];
        tenantIdParam = parts[1];
      }
    }

    if (listIdParam) {
      this.listId = parseInt(listIdParam);
    }
    if (tenantIdParam) {
      this.tenantId = tenantIdParam;
    }

    // Check authentication state
    const session = await getSession();
    this.authenticated = !!session;
    this.currentUser = session?.user || null;

    if (this.authenticated) {
      await this._validateGuestAccess(session);
    }

    this.loading = false;

    // Listen for auth state changes
    this.authSubscription = onAuthStateChange(async (event, session) => {
      this.authenticated = !!session;
      this.currentUser = session?.user || null;

      if (session) {
        await this._validateGuestAccess(session);
      } else if (event === 'SIGNED_OUT') {
        this.isGuest = false;
        this.error = 'Session expired. Please request a new access link.';
      } else {
        this.isGuest = false;
        this.error = null;
      }

      this.requestUpdate();
    });
    document.addEventListener('click', this._handleDocumentClick);
    window.addEventListener('focus', this._handleWindowFocus);
  }

  async _validateGuestAccess(session) {
    try {
      // Decode JWT to check user_role
      const token = session.access_token;
      const payload = JSON.parse(atob(token.split('.')[1]));

      // Check if user has guest role
      const sessionRole = session?.user?.app_metadata?.role;
      const jwtRole = payload.user_role || payload?.app_metadata?.role;
      this.isGuest = (jwtRole || sessionRole) === 'guest';

      if (!this.isGuest) {
        // Ignore existing real-user sessions on /guest without affecting /app tabs.
        this.authenticated = false;
        this.isGuest = false;
        this.error = null;
        this.availableLists = null;
        return;
      }

      // Extract tenant_ids from JWT
      const tenantIds = payload.tenant_ids || payload?.app_metadata?.tenant_ids || session?.user?.app_metadata?.tenant_ids || [];
      this.guestTenantIds = Array.isArray(tenantIds) ? tenantIds : [];

      // If tenant_id is in URL, validate it's in the JWT
      if (this.tenantId && !tenantIds.includes(this.tenantId)) {
        this.error = 'You do not have access to this tenant.';
        return;
      }

      // If no tenant_id in URL but only one in JWT, use it
      if (!this.tenantId && tenantIds.length === 1) {
        this.tenantId = tenantIds[0];
      }

      // If no list_id in URL, fetch accessible lists and let user choose
      if (!this.listId) {
        await this._fetchAccessibleLists();
        return;
      }

      this.error = null;

    } catch (err) {
      console.error('Error validating guest access:', err);
      this.error = 'Failed to validate access. Please try again or request a new link.';
    }
  }

  async _fetchAccessibleLists() {
    try {
      const { fetchWithAuth } = await import('../services/api.js');
      const tenantIdsToQuery = this.tenantId
        ? [this.tenantId]
        : (Array.isArray(this.guestTenantIds) ? this.guestTenantIds : []);

      if (!tenantIdsToQuery.length) {
        throw new Error('No tenant access found for this guest account.');
      }

      const listResponses = await Promise.all(
        tenantIdsToQuery.map(async (tenantId) => {
          const response = await fetchWithAuth('/guest/lists', {
            headers: { 'X-Tenant-ID': tenantId },
          });
          const lists = Array.isArray(response?.lists) ? response.lists : [];
          return lists.map((item) => ({
            ...item,
            tenant_id: tenantId,
          }));
        }),
      );

      const merged = listResponses.flat();
      const deduped = [];
      const seen = new Set();
      for (const list of merged) {
        const key = `${list.tenant_id}:${list.list_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(list);
      }

      deduped.sort((a, b) => {
        const aTs = a?.shared_at ? new Date(a.shared_at).getTime() : 0;
        const bTs = b?.shared_at ? new Date(b.shared_at).getTime() : 0;
        return bTs - aTs;
      });

      this.availableLists = deduped;
      this.loading = false;
    } catch (err) {
      console.error('Failed to fetch accessible lists:', err);
      this.error = 'Failed to load shared photo lists. Please try again.';
      this.loading = false;
    }
  }

  _selectList(listId, tenantId = this.tenantId) {
    // Keep navigation in-app for smooth transitions.
    const selectedTenant = tenantId || this.tenantId || (this.guestTenantIds?.[0] || '');
    if (!selectedTenant) {
      this.error = 'Could not determine tenant for selected list.';
      return;
    }
    this.listId = Number(listId);
    this.tenantId = selectedTenant;
    this.availableLists = null;
    this.error = null;
    window.location.hash = `${this.listId},${selectedTenant}`;
  }

  _goToApp() {
    window.location.href = '/app';
  }

  async _handleGuestHome() {
    this.listId = null;
    this.tenantId = null;
    this.error = null;
    this.collectionsRefreshing = true;
    this.availableLists = null;
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    try {
      if (this.authenticated && this.isGuest) {
        await this._fetchAccessibleLists();
      }
    } finally {
      this.collectionsRefreshing = false;
    }
  }

  _renderAccountModeSwitch() {
    return html`
      <div style="display:flex; justify-content:center; margin-bottom:14px;">
        <div style="display:inline-flex; border:1px solid rgba(255,255,255,0.35); border-radius:10px; overflow:hidden;">
          <button
            type="button"
            style="background:#ffffff; color:#4f46e5; border:none; padding:8px 12px; font-size:13px; font-weight:700;"
          >
            Guest Mode
          </button>
          <button
            type="button"
            @click=${this._goToApp}
            style="background:rgba(255,255,255,0.12); color:#ffffff; border:none; padding:8px 12px; font-size:13px; font-weight:700;"
          >
            Go to App
          </button>
        </div>
      </div>
    `;
  }

  async _handleGuestLogout() {
    try {
      const { signOut } = await import('../services/supabase.js');
      await signOut();
    } catch (err) {
      console.error('Failed to sign out:', err);
    } finally {
      this.authenticated = false;
      this.isGuest = false;
      this.error = null;
      this.availableLists = null;
      this.currentUser = null;
      this.listId = null;
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      window.location.href = '/guest';
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    document.removeEventListener('click', this._handleDocumentClick);
    window.removeEventListener('focus', this._handleWindowFocus);
  }

  async _handleWindowFocus() {
    if (this.authenticated && this.isGuest && !this.listId) {
      await this._fetchAccessibleLists();
      this.requestUpdate();
    }
  }

  async _handleRefreshCollections() {
    this.collectionsRefreshing = true;
    try {
      await this._fetchAccessibleLists();
    } finally {
      this.collectionsRefreshing = false;
    }
  }

  _toggleUserMenu(event) {
    event?.stopPropagation?.();
    this.userMenuOpen = !this.userMenuOpen;
  }

  _handleDocumentClick(event) {
    if (!this.userMenuOpen) return;
    const target = event?.target;
    if (target && this.contains(target)) return;
    this.userMenuOpen = false;
  }

  _getUserDisplayName() {
    return this.currentUser?.user_metadata?.full_name
      || this.currentUser?.email?.split('@')?.[0]
      || 'Guest User';
  }

  _getUserEmail() {
    return this.currentUser?.email || '';
  }

  _getAvatarLetter() {
    const name = this._getUserDisplayName().trim();
    return name ? name.charAt(0).toUpperCase() : 'G';
  }

  _hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  _getAvatarStyle() {
    const seed = `${this._getUserDisplayName()}|${this._getUserEmail()}`;
    const hash = this._hashString(seed);
    const hueA = hash % 360;
    const hueB = (hueA + 45 + (hash % 70)) % 360;
    return `background: linear-gradient(135deg, hsl(${hueA} 78% 56%), hsl(${hueB} 78% 46%));`;
  }

  _getSharedByLabel(list) {
    const raw = String(list?.shared_by || '').trim();
    return raw || 'Unknown';
  }

  _formatGuestDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString();
  }

  async _handleRequestNewLink(e) {
    if (e?.preventDefault) e.preventDefault();

    if (!this.authEmail || !this.authEmail.trim()) {
      this.authMessage = 'Please enter your email address.';
      this.authSuccess = false;
      return;
    }

    this.authLoading = true;
    this.authMessage = '';

    try {
      const response = await fetch('/api/v1/guest/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.authEmail.trim().toLowerCase(),
          tenant_id: this.tenantId || undefined,
        }),
      });

      const data = await response.json();

      this.authSuccess = data.success || false;
      this.authMessage = data.message || 'An error occurred. Please try again.';
      this.authLoading = false;

    } catch (err) {
      console.error('Failed to request magic link:', err);
      this.authMessage = 'Failed to send link. Please try again or contact support.';
      this.authSuccess = false;
      this.authLoading = false;
    }
  }

  _handleEmailInput(e) {
    this.authEmail = e.target.value;
    if (this.authMessage) this.authMessage = '';
    if (this.verifyMessage) this.verifyMessage = '';
  }

  _handleCodeInput(e) {
    const raw = String(e.target.value || '');
    this.authCode = raw.replace(/\s+/g, '').trim();
    if (this.verifyMessage) this.verifyMessage = '';
  }

  async _handleVerifyCode(e) {
    if (e?.preventDefault) e.preventDefault();

    const email = String(this.authEmail || '').trim().toLowerCase();
    const code = String(this.authCode || '').trim();
    if (!email) {
      this.verifyMessage = 'Enter your email first.';
      return;
    }
    if (!code) {
      this.verifyMessage = 'Enter the code from the email.';
      return;
    }

    this.verifyLoading = true;
    this.verifyMessage = '';
    try {
      await verifyOtpCode(email, code);
      this.verifyMessage = 'Code verified. Signing you in...';
    } catch (err) {
      this.verifyMessage = err?.message || 'Invalid code. Please try again.';
    } finally {
      this.verifyLoading = false;
    }
  }

  _renderGuestAuthForm() {
    return html`
      <form @submit=${this._handleRequestNewLink} style="margin-top: 20px;">
        <input
          type="email"
          placeholder="your.email@example.com"
          .value=${this.authEmail}
          @input=${this._handleEmailInput}
          style="
            width: 100%;
            padding: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 12px;
            background: rgba(255,255,255,0.1);
            color: white;
            box-sizing: border-box;
          "
          required
          ?disabled=${this.authLoading || this.verifyLoading}
        />
        <button
          type="submit"
          ?disabled=${this.authLoading || this.verifyLoading}
          style="
            width: 100%;
            padding: 12px;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            cursor: ${(this.authLoading || this.verifyLoading) ? 'not-allowed' : 'pointer'};
            opacity: ${(this.authLoading || this.verifyLoading) ? '0.6' : '1'};
          "
        >
          ${this.authLoading ? 'Sending...' : 'Send Magic Link'}
        </button>
      </form>

      ${this.authMessage ? html`
        <p style="
          margin: 16px 0 0;
          padding: 12px;
          background: ${this.authSuccess ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.2)'};
          border: 1px solid ${this.authSuccess ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.3)'};
          border-radius: 6px;
          font-size: 14px;
          color: ${this.authSuccess ? '#d1fae5' : '#fecaca'};
        ">
          ${this.authMessage}
        </p>
      ` : ''}

      ${this.authSuccess ? html`
        <div style="margin-top: 16px; text-align: center; opacity: 0.8; font-size: 13px;">or</div>
        <form @submit=${this._handleVerifyCode} style="margin-top: 12px;">
          <input
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="Enter code from email"
            .value=${this.authCode}
            @input=${this._handleCodeInput}
            style="
              width: 100%;
              padding: 12px;
              border: 2px solid rgba(255,255,255,0.3);
              border-radius: 8px;
              font-size: 16px;
              margin-bottom: 12px;
              background: rgba(255,255,255,0.1);
              color: white;
              box-sizing: border-box;
              letter-spacing: 0.12em;
            "
            ?disabled=${this.authLoading || this.verifyLoading}
          />
          <button
            type="submit"
            ?disabled=${this.authLoading || this.verifyLoading}
            style="
              width: 100%;
              padding: 12px;
              background: rgba(255,255,255,0.15);
              color: white;
              border: 1px solid rgba(255,255,255,0.35);
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              cursor: ${(this.authLoading || this.verifyLoading) ? 'not-allowed' : 'pointer'};
              opacity: ${(this.authLoading || this.verifyLoading) ? '0.6' : '1'};
            "
          >
            ${this.verifyLoading ? 'Verifying...' : 'Sign In With Code'}
          </button>
        </form>
      ` : ''}

      ${this.verifyMessage ? html`
        <p style="
          margin: 12px 0 0;
          padding: 12px;
          background: ${this.verifyMessage.toLowerCase().includes('verified') ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.2)'};
          border: 1px solid ${this.verifyMessage.toLowerCase().includes('verified') ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.3)'};
          border-radius: 6px;
          font-size: 14px;
          color: ${this.verifyMessage.toLowerCase().includes('verified') ? '#d1fae5' : '#fecaca'};
        ">
          ${this.verifyMessage}
        </p>
      ` : ''}
    `;
  }

  render() {
    // Still loading
    if (this.loading) {
      return html`
        <div class="loading-screen">
          <div class="loading-card">
            <div class="loading-title">Zoltag Guest</div>
            <div class="spinner">
              <div class="spinner-animation"></div>
              <div class="loading-text">Verifying access...</div>
            </div>
          </div>
        </div>
      `;
    }

    // Not authenticated - show email input form
    if (!this.authenticated) {
      return html`
        <div class="error-screen">
          <div class="error-card" style="max-width: 400px;">
            ${this._renderAccountModeSwitch()}
            <h1>📸 Sign In to View Shared Photos</h1>

            <p style="margin: 16px 0; opacity: 0.9;">
              Enter your email to receive a sign-in link, or enter your code below.
            </p>
            ${this._renderGuestAuthForm()}

            <p style="
              margin-top: 24px;
              font-size: 12px;
              opacity: 0.7;
              line-height: 1.5;
            ">
              This is a secure guest access link. If you didn't request access to shared photos, you can ignore this page.
            </p>
          </div>
        </div>
      `;
    }

    // Error state
    if (this.error) {
      return html`
        <div class="error-screen">
          <div class="error-card">
            ${this._renderAccountModeSwitch()}
            <h1>Access Error</h1>
            <p>${this.error}</p>
            <button @click=${this._handleRequestNewLink}>Request New Link</button>
            <div style="margin-top: 10px;">
              <button @click=${this._handleGuestLogout}>Sign Out</button>
            </div>
          </div>
        </div>
      `;
    }

    // List selection screen (no list_id provided)
    if (this.isGuest && !this.listId) {
      if (!this.availableLists || this.collectionsRefreshing) {
        return html`
          <div class="guest-shell">
            <header class="guest-topbar">
              <div class="guest-topbar-inner">
                <div>
                  <h1 class="guest-brand-title">Zoltag Guest</h1>
                  <p class="guest-brand-subtitle">Select a shared collection to review</p>
                </div>
              </div>
            </header>
            <main class="guest-content">
              <section class="guest-panel">
                <h2 class="text-lg font-semibold text-gray-900">Loading collections…</h2>
              </section>
            </main>
          </div>
        `;
      }

      if (this.availableLists.length === 0) {
        return html`
          <div class="error-screen">
            <div class="error-card">
              ${this._renderAccountModeSwitch()}
              <h1>No Shared Lists</h1>
              <p>You don't have access to any shared photo lists yet.</p>
              <button @click=${this._handleGuestLogout}>Sign Out</button>
            </div>
          </div>
        `;
      }

      return html`
        <div class="guest-shell">
          <header class="guest-topbar">
            <div class="guest-topbar-inner">
              <div>
                <h1 class="guest-brand-title">Zoltag Guest</h1>
                <p class="guest-brand-subtitle">Select a shared collection to review</p>
              </div>
              <div class="guest-topbar-actions">
                <button type="button" class="guest-refresh-btn" @click=${this._handleRefreshCollections}>
                  ${this.collectionsRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
                <div class="guest-user-menu">
                  <button
                    type="button"
                    class="guest-avatar-btn"
                    style=${this._getAvatarStyle()}
                    aria-haspopup="menu"
                    aria-expanded=${this.userMenuOpen ? 'true' : 'false'}
                    @click=${this._toggleUserMenu}
                    title=${this._getUserDisplayName()}
                  >
                    ${this._getAvatarLetter()}
                  </button>
                  ${this.userMenuOpen ? html`
                    <div class="guest-user-dropdown" role="menu">
                      <div class="guest-user-head">
                        <div class="guest-user-name" title=${this._getUserDisplayName()}>${this._getUserDisplayName()}</div>
                        ${this._getUserEmail() ? html`
                          <div class="guest-user-email" title=${this._getUserEmail()}>${this._getUserEmail()}</div>
                        ` : ''}
                      </div>
                      <button type="button" class="guest-user-action" @click=${() => this._goToApp()}>Go to App</button>
                      <button type="button" class="guest-user-action signout" @click=${() => this._handleGuestLogout()}>Sign Out</button>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          </header>
          <main class="guest-content">
            <section class="guest-panel">
              <h2 class="guest-panel-title">Your Shared Collections</h2>
              <p class="guest-panel-subtitle">Choose a collection to open the review workspace.</p>
              <div class="guest-list-grid">
                ${this.availableLists.map((list) => html`
                  <button
                    class="guest-list-card"
                    @click=${() => this._selectList(list.list_id, list.tenant_id)}
                    type="button"
                  >
                    <div class="guest-list-name">${list.title}</div>
                    <div class="guest-list-meta">${list.item_count} ${list.item_count === 1 ? 'photo' : 'photos'}</div>
                    <div class="guest-list-shared-by">Shared by ${this._getSharedByLabel(list)}</div>
                    <div class="guest-list-dates">
                      <div>Shared: ${this._formatGuestDate(list.shared_at) || 'Unknown'}</div>
                      <div>Expires: ${list.expires_at ? (this._formatGuestDate(list.expires_at) || 'Unknown') : 'Never'}</div>
                    </div>
                    <div class="guest-list-footer">
                      ${Number(list.item_count || 0)} items • ${Number(list.reviewed_count || 0)} reviewed
                      ${Number(list.reviewed_count || 0) > 0 ? html`
                        <span class="guest-reviewed-ok">✓</span>
                      ` : ''}
                    </div>
                  </button>
                `)}
              </div>
            </section>
          </main>
        </div>
      `;
    }

    // Valid guest access - show list view
    if (this.isGuest && this.listId && this.tenantId) {
      return html`
        <guest-list-view
          .listId=${this.listId}
          .tenantId=${this.tenantId}
          .userEmail=${this._getUserEmail()}
          .userDisplayName=${this._getUserDisplayName()}
          @guest-logout=${this._handleGuestLogout}
          @guest-go-app=${this._goToApp}
          @guest-home=${this._handleGuestHome}
        ></guest-list-view>
      `;
    }

    // Any non-guest or unresolved authenticated state should return to guest email flow.
    if (this.authenticated && !this.isGuest) {
      return html`
        <div class="error-screen">
          <div class="error-card" style="max-width: 400px;">
            ${this._renderAccountModeSwitch()}
            <h1>📸 Sign In to View Shared Photos</h1>
            <p style="margin: 16px 0; opacity: 0.9;">
              Enter your invited email to receive a sign-in link, or enter your code below.
            </p>
            ${this._renderGuestAuthForm()}
          </div>
        </div>
      `;
    }

    // Fallback (shouldn't reach here)
    return html`
      <div class="error-screen">
        <div class="error-card">
          ${this._renderAccountModeSwitch()}
          <h1>Invalid Access</h1>
          <p>Unable to load the requested collection.</p>
          <button @click=${this._handleRequestNewLink}>Request New Link</button>
        </div>
      </div>
    `;
  }
}

customElements.define('guest-app', GuestApp);
