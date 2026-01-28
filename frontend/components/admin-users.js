import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';
import { fetchWithAuth } from '../services/api.js';

/**
 * Admin User Management Component
 * Allows super admins to view pending users, approve them, and assign to tenants
 */
class AdminUsers extends LitElement {
  static properties = {
    pendingUsers: { type: Array },
    tenants: { type: Array },
    loading: { type: Boolean },
    error: { type: String },
    selectedUser: { type: Object },
    showApprovalForm: { type: Boolean },
    approvalForm: { type: Object },
    submitting: { type: Boolean },
  };

  static styles = [
    tailwind,
    css`
      :host {
        display: block;
      }

      .card {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
      }

      .card-header {
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .card-title {
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
      }

      .card-content {
        padding: 20px;
      }

      .users-list {
        border-collapse: collapse;
        width: 100%;
      }

      .users-list th {
        text-align: left;
        padding: 12px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        font-weight: 600;
        color: #374151;
        font-size: 14px;
      }

      .users-list td {
        padding: 12px;
        border-bottom: 1px solid #e5e7eb;
      }

      .users-list tr:hover {
        background: #f9fafb;
      }

      .user-email {
        font-family: monospace;
        font-size: 13px;
        color: #6b7280;
      }

      .user-name {
        font-weight: 500;
        color: #1f2937;
      }

      .created-date {
        color: #6b7280;
        font-size: 14px;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        text-decoration: none;
      }

      .btn-primary {
        background: #2563eb;
        color: white;
      }

      .btn-primary:hover {
        background: #1d4ed8;
      }

      .btn-secondary {
        background: #e5e7eb;
        color: #374151;
        margin-left: 8px;
      }

      .btn-secondary:hover {
        background: #d1d5db;
      }

      .btn-danger {
        background: #dc2626;
        color: white;
      }

      .btn-danger:hover {
        background: #b91c1c;
      }

      .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .empty-state {
        text-align: center;
        padding: 40px;
        color: #6b7280;
      }

      .empty-state-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .error-message {
        background: #fee2e2;
        color: #dc2626;
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 16px;
        border-left: 4px solid #dc2626;
      }

      .loading {
        text-align: center;
        padding: 40px;
        color: #6b7280;
      }

      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .modal {
        background: white;
        border-radius: 8px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
      }

      .modal-header {
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
      }

      .modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
      }

      .modal-content {
        padding: 20px;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        color: #374151;
        font-size: 14px;
      }

      .form-control {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .form-control:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }

      .user-info {
        background: #f3f4f6;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
      }

      .user-info-item {
        font-size: 14px;
        margin-bottom: 6px;
      }

      .user-info-item:last-child {
        margin-bottom: 0;
      }

      .user-info-label {
        font-weight: 600;
        color: #374151;
      }

      .user-info-value {
        color: #6b7280;
      }

      .modal-actions {
        display: flex;
        gap: 8px;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
      }

      .modal-actions button {
        flex: 1;
      }
    `
  ];

  constructor() {
    super();
    this.pendingUsers = [];
    this.tenants = [];
    this.loading = false;
    this.error = '';
    this.selectedUser = null;
    this.showApprovalForm = false;
    this.approvalForm = {
      tenantId: '',
      role: 'user',
    };
    this.submitting = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadPendingUsers();
    this.loadTenants();
  }

  async loadPendingUsers() {
    this.loading = true;
    this.error = '';
    try {
      const users = await fetchWithAuth('/admin/users/pending');
      this.pendingUsers = users;
    } catch (error) {
      console.error('Failed to load pending users:', error);
      this.error = error.message;
      this.pendingUsers = [];
    } finally {
      this.loading = false;
    }
  }

  async loadTenants() {
    try {
      const response = await fetch('/api/v1/tenants');
      if (response.ok) {
        this.tenants = await response.json();
      }
    } catch (error) {
      console.error('Failed to load tenants:', error);
      this.tenants = [];
    }
  }

  openApprovalForm(user) {
    this.selectedUser = user;
    this.showApprovalForm = true;
    this.approvalForm = {
      tenantId: '',
      role: 'user',
    };
  }

  closeApprovalForm() {
    this.showApprovalForm = false;
    this.selectedUser = null;
  }

  updateFormField(field, value) {
    this.approvalForm = {
      ...this.approvalForm,
      [field]: value,
    };
  }

  async approveUser() {
    if (!this.selectedUser) return;

    this.submitting = true;
    try {
      const response = await fetchWithAuth(
        `/admin/users/${this.selectedUser.supabase_uid}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: this.approvalForm.tenantId || null,
            role: this.approvalForm.role,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Approval failed' }));
        throw new Error(error.detail);
      }

      // Success - reload users and close form
      this.closeApprovalForm();
      await this.loadPendingUsers();
    } catch (error) {
      console.error('Failed to approve user:', error);
      this.error = error.message;
    } finally {
      this.submitting = false;
    }
  }

  async rejectUser(user) {
    if (!confirm(`Are you sure you want to reject ${user.email}?`)) {
      return;
    }

    try {
      const response = await fetchWithAuth(
        `/admin/users/${user.supabase_uid}/reject`,
        { method: 'POST' }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Rejection failed' }));
        throw new Error(error.detail);
      }

      // Success - reload users
      await this.loadPendingUsers();
    } catch (error) {
      console.error('Failed to reject user:', error);
      this.error = error.message;
    }
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    return html`
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            <i class="fas fa-users-cog mr-2"></i>User Approvals
          </h2>
          <span style="color: #6b7280; font-size: 14px;">
            ${this.pendingUsers.length} pending
          </span>
        </div>

        <div class="card-content">
          ${this.error
            ? html`<div class="error-message">${this.error}</div>`
            : ''}

          ${this.loading
            ? html`<div class="loading">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #2563eb; margin-bottom: 12px;"></i>
                <div>Loading pending users...</div>
              </div>`
            : this.pendingUsers.length === 0
              ? html`<div class="empty-state">
                  <div class="empty-state-icon"><i class="fas fa-check-circle"></i></div>
                  <p>No pending users</p>
                  <p style="font-size: 13px;">All users have been approved or no new registrations yet.</p>
                </div>`
              : html`
                  <table class="users-list">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Registered</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.pendingUsers.map(
                        user => html`
                          <tr>
                            <td>
                              <div class="user-name">
                                ${user.display_name || 'No name'}
                              </div>
                            </td>
                            <td>
                              <div class="user-email">${user.email}</div>
                            </td>
                            <td>
                              <div class="created-date">${this.formatDate(user.created_at)}</div>
                            </td>
                            <td>
                              <button
                                class="btn btn-primary"
                                @click=${() => this.openApprovalForm(user)}
                              >
                                <i class="fas fa-check"></i> Approve
                              </button>
                              <button
                                class="btn btn-secondary"
                                @click=${() => this.rejectUser(user)}
                              >
                                <i class="fas fa-times"></i> Reject
                              </button>
                            </td>
                          </tr>
                        `
                      )}
                    </tbody>
                  </table>
                `}
        </div>
      </div>

      ${this.showApprovalForm
        ? html`
            <div class="modal-overlay" @click=${this.closeApprovalForm}>
              <div class="modal" @click=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <h3 class="modal-title">Approve User</h3>
                  <button
                    class="modal-close"
                    @click=${this.closeApprovalForm}
                  >
                    ×
                  </button>
                </div>

                <div class="modal-content">
                  <div class="user-info">
                    <div class="user-info-item">
                      <span class="user-info-label">Name:</span>
                      <span class="user-info-value">${this.selectedUser?.display_name || 'Not provided'}</span>
                    </div>
                    <div class="user-info-item">
                      <span class="user-info-label">Email:</span>
                      <span class="user-info-value">${this.selectedUser?.email}</span>
                    </div>
                    <div class="user-info-item">
                      <span class="user-info-label">Registered:</span>
                      <span class="user-info-value">${this.formatDate(this.selectedUser?.created_at)}</span>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">
                      <i class="fas fa-building mr-2"></i>Assign to Tenant (Optional)
                    </label>
                    <select
                      class="form-control"
                      .value=${this.approvalForm.tenantId}
                      @change=${(e) => this.updateFormField('tenantId', e.target.value)}
                    >
                      <option value="">-- No tenant assignment --</option>
                      ${this.tenants.map(
                        tenant => html`<option value=${tenant.id}>${tenant.name}</option>`
                      )}
                    </select>
                  </div>

                  ${this.approvalForm.tenantId
                    ? html`
                        <div class="form-group">
                          <label class="form-label">
                            <i class="fas fa-id-badge mr-2"></i>Role
                          </label>
                          <select
                            class="form-control"
                            .value=${this.approvalForm.role}
                            @change=${(e) => this.updateFormField('role', e.target.value)}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      `
                    : ''}

                  <div class="modal-actions">
                    <button
                      class="btn btn-secondary"
                      @click=${this.closeApprovalForm}
                    >
                      Cancel
                    </button>
                    <button
                      class="btn btn-primary"
                      @click=${this.approveUser}
                      ?disabled=${this.submitting}
                    >
                      ${this.submitting
                        ? html`<i class="fas fa-spinner fa-spin"></i> Approving...`
                        : html`<i class="fas fa-check"></i> Approve User`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `
        : ''}
    `;
  }
}

customElements.define('admin-users', AdminUsers);
