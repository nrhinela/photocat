import { LitElement, html } from 'lit';
import './app-header.js';
import './tag-histogram.js';
import './upload-modal.js';
import './upload-library-modal.js';
import './tab-container.js';
import './list-editor.js';
import './permatag-editor.js';
import './tagging-admin.js';
import './assets-admin.js';
import './tenant-users-admin.js';
import './library-integrations-admin.js';
import './ml-training.js';
import './image-editor.js';
import './person-manager.js';
import './people-tagger.js';
import './admin-modal.js';
import './shared/widgets/filter-chips.js';
import './shared/widgets/keyword-dropdown.js';

import { initializeAppCoreSetup } from './state/app-core-setup.js';
import { initializeAppDefaultState } from './state/app-default-state.js';
import { initializeAppConstructorWiring } from './state/app-constructor-wiring.js';
import { bindAppDelegateMethods } from './state/app-delegate-methods.js';
import { tailwind } from './tailwind-lit.js';
import {
  formatCurateDate,
} from './shared/formatting.js';
import './home-tab.js';
import './home-chips-tab.js';
import './home-insights-tab.js';
import './lab-tab.js';
import './curate-home-tab.js';
import './curate-explore-tab.js';
import './curate-browse-folder-tab.js';
import './curate-audit-tab.js';
import './search-tab.js';
import { renderCurateTabContent } from './render/curate-tab-content.js';
import { renderHomeTabContent, renderSearchTabContent } from './render/home-search-tab-content.js';
import { renderAuxTabContent, renderGlobalOverlays, renderRatingModal } from './render/aux-tab-content.js';
import { zoltagAppStyles } from './styles/zoltag-app-styles.js';
import { propertyGridStyles } from './shared/widgets/property-grid.js';

class ZoltagApp extends LitElement {
  static styles = [tailwind, zoltagAppStyles, propertyGridStyles];

  static properties = {
      tenant: { type: String },
      showUploadModal: { type: Boolean },
      showUploadLibraryModal: { type: Boolean },
      activeTab: { type: String },
      activeLibrarySubTab: { type: String },
      activeSearchSubTab: { type: String },
      activeAdminSubTab: { type: String },
      activeSystemSubTab: { type: String },
      homeRecommendationsTab: { type: String },
      keywords: { type: Array },
      homeLists: { type: Array },
      queueState: { type: Object },
      queueNotice: { type: Object },
      imageStats: { type: Object },
      mlTrainingStats: { type: Object },
      tagStatsBySource: { type: Object },
      homeLoading: { type: Boolean },
      curateFilters: { type: Object },
      curateLimit: { type: Number },
      curateOrderBy: { type: String },
      curateOrderDirection: { type: String },
      curateHideDeleted: { type: Boolean },
      curateMinRating: { type: [Number, String] },
      curateKeywordFilters: { type: Object },
      curateKeywordOperators: { type: Object },
      curateCategoryFilterOperator: { type: String },
      curateDropboxPathPrefix: { type: String },
      curateFilenameQuery: { type: String },
      curateListId: { type: [Number, String] },
      curateListExcludeId: { type: [Number, String] },
      curateImages: { type: Array },
      curatePageOffset: { type: Number },
      curateTotal: { type: Number },
      curateLoading: { type: Boolean },
      curateDragSelection: { type: Array },
      curateDragSelecting: { type: Boolean },
      curateDragStartIndex: { type: Number },
      curateDragEndIndex: { type: Number },
      curateThumbSize: { type: Number },
      curateEditorImage: { type: Object },
      curateEditorOpen: { type: Boolean },
      curateEditorImageSet: { type: Array },
      curateEditorImageIndex: { type: Number },
      curateSubTab: { type: String, attribute: false },
      curateAuditMode: { type: String },
      curateAuditKeyword: { type: String },
      curateAuditCategory: { type: String },
      curateAuditImages: { type: Array },
      curateAuditSelection: { type: Array },
      curateAuditDragTarget: { type: String },
      curateAuditDragSelection: { type: Array },
      curateAuditDragSelecting: { type: Boolean },
      curateAuditDragStartIndex: { type: Number },
      curateAuditDragEndIndex: { type: Number },
      curateAuditLimit: { type: Number },
      curateAuditOffset: { type: Number },
      curateAuditTotal: { type: Number },
      curateAuditLoading: { type: Boolean },
      curateAuditLoadAll: { type: Boolean },
      curateAuditPageOffset: { type: Number },
      curateAuditAiEnabled: { type: Boolean },
      curateAuditAiModel: { type: String },
      curateAuditOrderBy: { type: String },
      curateAuditOrderDirection: { type: String },
      curateAuditHideDeleted: { type: Boolean },
      curateAuditMinRating: { type: [Number, String] },
      curateAuditNoPositivePermatags: { type: Boolean },
      curateAuditDropboxPathPrefix: { type: String },
      curateAuditFilenameQuery: { type: String },
      curateHomeRefreshing: { type: Boolean },
      curateStatsLoading: { type: Boolean },
      homeSubTab: { type: String },
      curateAdvancedOpen: { type: Boolean },
      curateNoPositivePermatags: { type: Boolean },
      activeCurateTagSource: { type: String },
      curateCategoryCards: { type: Array },
      curateAuditTargets: { type: Array },
      curateExploreTargets: { type: Array },
      curateExploreRatingEnabled: { type: Boolean },
      curateAuditRatingEnabled: { type: Boolean },
      searchOrderBy: { type: String },
      searchOrderDirection: { type: String },
      searchImages: { type: Array },
      searchTotal: { type: Number },
      currentUser: { type: Object },
      _homeLoadingCount: { type: Number },
      assetsRefreshToken: { type: Number },
      pendingSearchExploreSelection: { type: Object },
      pendingListSelectionId: { type: [String, Number] },
      pendingListSelectionToken: { type: Number },
  }

  constructor() {
      super();
      const storedTenant = this._getStoredTenantFromLocalStorage();
      this.tenant = storedTenant || '';
      this.showUploadModal = false;
      this.showUploadLibraryModal = false;
      this.activeTab = 'home';
      this.homeSubTab = 'overview';
      this.activeSearchSubTab = 'home';
      this.activeLibrarySubTab = 'assets';
      this.activeAdminSubTab = 'tagging';
      this.activeSystemSubTab = 'cli';
      this.homeRecommendationsTab = 'lists';
      this.assetsRefreshToken = 0;
      this.pendingSearchExploreSelection = null;
      this.pendingListSelectionId = null;
      this.pendingListSelectionToken = 0;
      this._lastTenantRuntimeSignature = '';

      initializeAppCoreSetup(this);
      bindAppDelegateMethods(this);
      initializeAppDefaultState(this);
      initializeAppConstructorWiring(this);

      this._handleRuntimeClick = this._handleRuntimeClick.bind(this);
      this._handleStorageChange = this._handleStorageChange.bind(this);
  }

  connectedCallback() {
      super.connectedCallback();
      this._appEventsState.connect();
      this._syncTenantFromStorage();
      this._applyInitialNavigationFromQuery();
      document.addEventListener('click', this._handleRuntimeClick, true);
      window.addEventListener('storage', this._handleStorageChange);
  }

  disconnectedCallback() {
      document.removeEventListener('click', this._handleRuntimeClick, true);
      window.removeEventListener('storage', this._handleStorageChange);
      this._appEventsState.disconnect();
      super.disconnectedCallback();
  }

  render() {
    const canCurate = this._canCurate();
    const tenantSelectionRequired = this._isTenantSelectionRequired();
    const availableTenants = tenantSelectionRequired ? this._getAvailableTenantsForUser() : [];
    const navCards = [
      { key: 'search', label: 'Search', subtitle: 'Explore and save results', icon: 'fa-magnifying-glass' },
      { key: 'curate', label: 'Curate', subtitle: 'Build stories and sets', icon: 'fa-star' },
      { key: 'lists', label: 'Lists', subtitle: 'Organize saved sets', icon: 'fa-list' },
      { key: 'admin', label: 'Keywords', subtitle: 'Manage configuration', icon: 'fa-cog' },
      { key: 'system', label: 'System', subtitle: 'Manage pipelines and tasks', icon: 'fa-sliders' },
    ].filter((card) => canCurate || card.key !== 'curate');
    this._curateLeftOrder = this.curateImages.map((img) => img.id);
    this._curateRightOrder = [];

    return html`
        ${this._renderTenantSelectionModal(tenantSelectionRequired, availableTenants)}
        ${renderRatingModal(this)}
        <app-header
            .tenant=${this.tenant}
            @tenant-change=${this._handleTenantChange}
            @open-upload-modal=${this._handleOpenUploadModal}
            .activeTab=${this.activeTab}
            .canCurate=${canCurate}
            @tab-change=${this._handleTabChange}
        ></app-header>
        
        <tab-container .activeTab=${this.activeTab}>
            ${this.activeTab === 'home' ? renderHomeTabContent(this, { navCards, formatCurateDate }) : ''}
            ${this.activeTab === 'search' ? renderSearchTabContent(this, { formatCurateDate }) : ''}
            ${this.activeTab === 'curate' ? renderCurateTabContent(this, { formatCurateDate }) : ''}
            ${renderAuxTabContent(this, { formatCurateDate })}
        </tab-container>
        ${renderGlobalOverlays(this, { canCurate })}
    `;
  }

  async fetchKeywords() {
      return await this._appDataState.fetchKeywords();
  }

  async fetchHomeLists({ force = false } = {}) {
      return await this._appDataState.fetchHomeLists({ force });
  }

  async fetchStats({ force = false, includeRatings, includeImageStats = true, includeMlStats = false, includeTagStats = true } = {}) {
      return await this._appDataState.fetchStats({
          force,
          includeRatings,
          includeImageStats,
          includeMlStats,
          includeTagStats,
      });
  }

  _handleImageRatingUpdated(e) {
      if (e?.detail?.imageId !== undefined && e?.detail?.rating !== undefined) {
          this._curateExploreState.applyCurateRating(e.detail.imageId, e.detail.rating);
      }
  }

  updated(changedProperties) {
      if (changedProperties.has('currentUser')) {
          this._sanitizeTenantSelection();
      }
      if (changedProperties.has('curateAuditKeyword') || changedProperties.has('curateAuditMode')) {
          this._syncAuditHotspotPrimary();
      }
      if (changedProperties.has('keywords') && this.curateAuditKeyword) {
          this._syncAuditHotspotPrimary();
      }
      this._appShellState.handleUpdated(changedProperties);
      this._lastTenantRuntimeSignature = this._buildTenantRuntimeSignature();
  }

  _isTenantInAvailableTenants(tenantId, availableTenants = this._getAvailableTenantsForUser()) {
      const normalizedTenantId = String(tenantId || '').trim();
      if (!normalizedTenantId || !availableTenants.length) {
          return false;
      }
      return availableTenants.some((tenant) => tenant.id === normalizedTenantId);
  }

  _getValidStoredTenantId(availableTenants = this._getAvailableTenantsForUser()) {
      const storedTenant = this._getStoredTenantFromLocalStorage();
      if (!storedTenant) {
          return '';
      }
      return this._isTenantInAvailableTenants(storedTenant, availableTenants) ? storedTenant : '';
  }

  _sanitizeTenantSelection() {
      const availableTenants = this._getAvailableTenantsForUser();
      if (!availableTenants.length) {
          return;
      }

      if (availableTenants.length === 1) {
          const soleTenantId = availableTenants[0].id;
          try {
              localStorage.setItem('tenantId', soleTenantId);
          } catch (_error) {
              // ignore localStorage failures
          }
          const currentTenant = String(this.tenant || '').trim();
          if (currentTenant !== soleTenantId) {
              this._handleTenantChange({ detail: soleTenantId });
          }
          return;
      }

      const storedTenant = this._getStoredTenantFromLocalStorage();
      const validStoredTenant = this._getValidStoredTenantId(availableTenants);
      if (storedTenant && !validStoredTenant) {
          try {
              localStorage.removeItem('tenantId');
          } catch (_error) {
              // ignore localStorage failures
          }
      }

      const currentTenant = String(this.tenant || '').trim();
      if (currentTenant && !this._isTenantInAvailableTenants(currentTenant, availableTenants)) {
          this.tenant = '';
      }
  }

  _getStoredTenantFromLocalStorage() {
      try {
          return (localStorage.getItem('tenantId') || '').trim();
      } catch (_error) {
          return '';
      }
  }

  _getAvailableTenantsForUser() {
      const memberships = Array.isArray(this.currentUser?.tenants) ? this.currentUser.tenants : [];
      if (!memberships.length) {
          return [];
      }
      const seen = new Set();
      const tenants = [];
      for (const membership of memberships) {
          const tenantId = String(membership?.tenant_id || '').trim();
          if (!tenantId || seen.has(tenantId)) {
              continue;
          }
          seen.add(tenantId);
          const tenantName = String(membership?.tenant_name || '').trim();
          tenants.push({
              id: tenantId,
              name: tenantName || tenantId,
          });
      }
      tenants.sort((a, b) => a.name.localeCompare(b.name));
      return tenants;
  }

  _isTenantSelectionRequired() {
      const availableTenants = this._getAvailableTenantsForUser();
      if (availableTenants.length <= 1) {
          return false;
      }

      return !this._getValidStoredTenantId(availableTenants);
  }

  _handleTenantSelectionChoice(tenantId) {
      this._handleTenantChange({ detail: tenantId });
  }

  _renderTenantSelectionModal(tenantSelectionRequired, availableTenants) {
      if (!tenantSelectionRequired) {
          return html``;
      }
      return html`
        <admin-modal
          title="Select Tenant"
          .open=${true}
          .disableDismiss=${true}
          .showClose=${false}
          style="--admin-modal-z-index: 5000;"
        >
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p style="margin: 0; color: #334155; font-size: 14px;">
              Multiple tenants are available. Choose a tenant before continuing.
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${availableTenants.map((tenant) => html`
                <button
                  type="button"
                  style="text-align: left; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; font-weight: 600; color: #1f2937; cursor: pointer;"
                  @click=${() => this._handleTenantSelectionChoice(tenant.id)}
                >
                  ${tenant.name}
                </button>
              `)}
            </div>
          </div>
        </admin-modal>
      `;
  }

  _buildTenantRuntimeSignature() {
      const storedTenant = this._getStoredTenantFromLocalStorage();
      const currentTenant = String(this.tenant || '').trim();
      const tenantIds = this._getAvailableTenantsForUser().map((tenant) => tenant.id).join('|');
      return `${storedTenant}::${currentTenant}::${tenantIds}`;
  }

  _reconcileTenantSelectionFromRuntime({ force = false } = {}) {
      const beforeSignature = this._buildTenantRuntimeSignature();
      if (!force && beforeSignature === this._lastTenantRuntimeSignature) {
          return;
      }
      this._sanitizeTenantSelection();
      this._syncTenantFromStorage();
      const afterSignature = this._buildTenantRuntimeSignature();
      this._lastTenantRuntimeSignature = afterSignature;
      if (afterSignature !== beforeSignature) {
          this.requestUpdate();
      }
  }

  _handleRuntimeClick() {
      this._reconcileTenantSelectionFromRuntime();
  }

  _handleStorageChange(event) {
      if (event?.key && event.key !== 'tenantId') {
          return;
      }
      this._reconcileTenantSelectionFromRuntime();
  }

  _syncTenantFromStorage() {
      const storedTenant = this._getStoredTenantFromLocalStorage();
      if (!storedTenant || storedTenant === this.tenant) {
          return;
      }
      this._handleTenantChange({ detail: storedTenant });
  }

  _applyInitialNavigationFromQuery() {
      try {
          const params = new URLSearchParams(window.location.search || '');
          const tab = String(params.get('tab') || '').trim();
          if (!tab) {
              return;
          }
          const subTab = String(params.get('subTab') || '').trim();
          const adminSubTab = String(params.get('adminSubTab') || '').trim();
          this._handleTabChange({
              detail: {
                  tab,
                  subTab: subTab || undefined,
                  adminSubTab: adminSubTab || undefined,
              },
          });
      } catch (_error) {
          // ignore malformed URL params
      }
  }

}

customElements.define('zoltag-app', ZoltagApp);
