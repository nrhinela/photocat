import { LitElement, html, css } from 'lit';
import { getTenants, sync, retagAll } from '../services/api.js';
import { tailwind } from './tailwind-lit.js';

class AppHeader extends LitElement {
    static styles = [tailwind, css`
        :host {
            display: block;
        }
    `];

      static properties = {
        tenants: { type: Array },
        tenant: { type: String },
        activeTab: { type: String },
        isSyncing: { type: Boolean },
        syncCount: { type: Number },
        environment: { type: String },
    }

    constructor() {
        super();
        this.tenants = [];
        this.activeTab = 'search'; // Default
        this.isSyncing = false;
        this.syncCount = 0;
        this._stopRequested = false;
        this.environment = '...';
    }

  connectedCallback() {
      super.connectedCallback();
      this.fetchTenants();
      this.fetchEnvironment();
  }

  async fetchEnvironment() {
      try {
          const response = await fetch('/api/v1/config/system');
          if (response.ok) {
              const data = await response.json();
              this.environment = data.environment?.toUpperCase() || 'UNKNOWN';
          }
      } catch (error) {
          console.error('Error fetching environment:', error);
          this.environment = 'ERROR';
      }
  }

  async fetchTenants() {
      try {
          this.tenants = await getTenants();
      } catch (error) {
          console.error('Error fetching tenants:', error);
      }
  }

  render() {
    return html`
        <nav class="bg-white shadow-lg">
            <div class="max-w-7xl mx-auto px-4 py-4">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-2">
                        <i class="fas fa-camera text-blue-600 text-2xl"></i>
                        <h1 class="text-2xl font-bold text-gray-800">PhotoCat</h1>
                        <span class="text-sm px-3 py-1 rounded font-semibold text-white" style="background-color: ${this.environment === 'PROD' ? '#b91c1c' : '#16a34a'}">${this.environment}</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        ${this.isSyncing ? html`
                            <button @click=${this._stopSync} class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                                <i class="fas fa-stop mr-2"></i>Stop (${this.syncCount})
                            </button>
                        ` : html`
                            <button @click=${this._sync} class="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700">
                                <i class="fas fa-sync mr-2"></i>Sync
                            </button>
                        `}
                        <button @click=${this._retagAll} class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
                            <i class="fas fa-tags mr-2"></i>Retag All
                        </button>
                        <button @click=${this._upload} class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-upload mr-2"></i>Upload
                        </button>
                        <div class="flex items-center space-x-2">
                            <label for="tenantSelect" class="text-gray-700 font-medium">Tenant:</label>
                            <select .value=${this.tenant} id="tenantSelect" class="px-4 py-2 border rounded-lg" @change=${this._switchTenant}>
                                ${this.tenants.map(tenant => html`<option value=${tenant.id}>${tenant.name}</option>`)}
                            </select>
                        </div>
                        <button @click=${this._openTaggingAdmin} class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700" title="Tagging Settings">
                            <i class="fas fa-tags mr-2"></i>Tagging
                        </button>
                        <button @click=${this._openAdmin} class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700" title="System Administration">
                            <i class="fas fa-cog mr-2"></i>Admin
                        </button>
                    </div>
                </div>
            </div>
            <!-- Tab Navigation moved to a separate bar -->
            <div class="bg-gray-100 border-b border-gray-200">
                <div class="max-w-7xl mx-auto px-4">
                    <button
                        @click=${() => this._handleTabChange('search')}
                        class="py-3 px-6 text-base font-semibold ${this.activeTab === 'search' ? 'border-b-4 border-blue-600 text-blue-800 bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} transition-all duration-200"
                    >
                        <i class="fas fa-search mr-2"></i>Search
                    </button>
                    <button
                        @click=${() => this._handleTabChange('lists')}
                        class="py-3 px-6 text-base font-semibold ${this.activeTab === 'lists' ? 'border-b-4 border-blue-600 text-blue-800 bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} transition-all duration-200"
                    >
                        <i class="fas fa-list mr-2"></i>Lists
                    </button>
                </div>
            </div>
        </nav>
    `;
  }

  _handleTabChange(tabName) {
      this.dispatchEvent(new CustomEvent('tab-change', { detail: tabName, bubbles: true, composed: true }));
  }

  async _sync() {
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.syncCount = 0;
    this._stopRequested = false;

    try {
        let hasMore = true;

        while (hasMore && !this._stopRequested) {
            const result = await sync(this.tenant);

            if (result.processed > 0) {
                this.syncCount += result.processed;
                // Notify gallery to refresh
                this.dispatchEvent(new CustomEvent('sync-progress', {
                    detail: { count: this.syncCount, status: result.status },
                    bubbles: true,
                    composed: true
                }));
            }

            hasMore = result.has_more;

            if (!hasMore) {
                console.log(`Sync complete. Total processed: ${this.syncCount}`);
            }
        }

        if (this._stopRequested) {
            console.log(`Sync stopped by user. Processed: ${this.syncCount}`);
        }

        // Final refresh notification
        this.dispatchEvent(new CustomEvent('sync-complete', {
            detail: { count: this.syncCount },
            bubbles: true,
            composed: true
        }));

    } catch (error) {
        console.error('Failed to sync:', error);
        this.dispatchEvent(new CustomEvent('sync-error', {
            detail: { error: error.message },
            bubbles: true,
            composed: true
        }));
    } finally {
        this.isSyncing = false;
        this._stopRequested = false;
    }
  }

  _stopSync() {
    console.log('Stop requested...');
    this._stopRequested = true;
  }

    async _retagAll() {
        try {
            await retagAll(this.tenant);
        } catch (error) {
            console.error('Failed to retag all:', error);
        }
    }

    _upload() {
        this.dispatchEvent(new CustomEvent('open-upload-modal', { bubbles: true, composed: true }));
    }

    _switchTenant(e) {
        this.dispatchEvent(new CustomEvent('tenant-change', { detail: e.target.value, bubbles: true, composed: true }));
    }

    _openAdmin() {
        window.location.href = '/admin';
    }

    _openTaggingAdmin() {
        window.location.href = '/tagging-admin';
    }
}

customElements.define('app-header', AppHeader);
