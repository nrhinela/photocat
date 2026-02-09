import { LitElement, html } from 'lit';
import './app-header.js';
import './tag-histogram.js';
import './upload-modal.js';
import './tab-container.js'; // Import the new tab container
import './list-editor.js'; // Import the new list editor
import './permatag-editor.js';
import './tagging-admin.js';
import './ml-training.js';
import './image-editor.js';
import './cli-commands.js';
import './person-manager.js';
import './people-tagger.js';
import './shared/widgets/filter-chips.js';
import './shared/widgets/keyword-dropdown.js';

import { initializeAppCoreSetup } from './state/app-core-setup.js';
import { initializeAppDefaultState } from './state/app-default-state.js';
import { initializeAppConstructorWiring } from './state/app-constructor-wiring.js';
import { tailwind } from './tailwind-lit.js';
import { retryFailedCommand } from '../services/command-queue.js';
import {
  buildCurateFilterObject,
  getCurateAuditFetchKey,
  getCurateHomeFetchKey,
} from './shared/curate-filters.js';
import { shouldAutoRefreshCurateStats } from './shared/curate-stats.js';
import {
  formatCurateDate,
  formatQueueItem,
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
import { photocatAppStyles } from './styles/photocat-app-styles.js';

class PhotoCatApp extends LitElement {
  static styles = [tailwind, photocatAppStyles];

  static properties = {
      tenant: { type: String },
      showUploadModal: { type: Boolean },
      activeTab: { type: String }, // New property for active tab
      activeAdminSubTab: { type: String }, // Subtab for admin section (people or tagging)
      activeSystemSubTab: { type: String }, // Subtab for system section (pipeline or cli)
      keywords: { type: Array },
      queueState: { type: Object },
      imageStats: { type: Object },
      mlTrainingStats: { type: Object },
      tagStatsBySource: { type: Object },
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
      searchImages: { type: Array },
      searchTotal: { type: Number },
      currentUser: { type: Object },
  }

  constructor() {
      super();
      this.tenant = 'bcg'; // Default tenant
      this.showUploadModal = false;
      this.activeTab = 'home'; // Default to home tab
      this.homeSubTab = 'overview';
      this.activeAdminSubTab = 'tagging'; // Default admin subtab
      this.activeSystemSubTab = 'ml-training'; // Default system subtab

      initializeAppCoreSetup(this);
      initializeAppDefaultState(this);
      initializeAppConstructorWiring(this);
  }

  _getCurateDefaultState() {
      return this._curateHomeState.getDefaultState();
  }

  _snapshotCurateState() {
      return this._curateHomeState.snapshotState();
  }

  _restoreCurateState(state) {
      this._curateHomeState.restoreState(state || this._getCurateDefaultState());
      this._curateDragOrder = null;
      this._cancelCuratePressState();
  }

  _handleCurateHotspotChanged(event) {
      return this._curateExploreState.handleHotspotChanged(event);
  }

  _handleCurateAuditHotspotChanged(event) {
      // Transform event detail to match state controller expectations
      const detail = {
          changeType: event.detail.type?.replace('-change', '').replace('-target', '').replace('hotspot-drop', 'drop'),
          targetId: event.detail.targetId,
          value: event.detail.value,
          event: event.detail.event,
      };
      return this._curateAuditState.handleHotspotChanged({ detail });
  }

  _removeCurateImagesByIds(ids) {
      return this._curateHomeState.removeImagesByIds(ids);
  }

  _removeAuditImagesByIds(ids) {
      return this._curateAuditState.removeImagesByIds(ids);
  }

  _processExploreTagDrop(ids, target) {
      return this._curateExploreState.processTagDrop(ids, target);
  }

  _syncAuditHotspotPrimary() {
      return this._curateAuditState.syncHotspotPrimary();
  }

  _handleCurateExploreRatingDrop(event, ratingValue = null) {
      return this._curateExploreState.handleRatingDrop(event, ratingValue);
  }

  _handleCurateAuditRatingDrop(event) {
      return this._auditRatingHandlers.handleDrop(event);
  }

  connectedCallback() {
      super.connectedCallback();
      this._appEventsState.connect();
  }

  async _loadCurrentUser() {
      return await this._appShellState.loadCurrentUser();
  }

  _canCurate() {
      return this._appShellState.canCurate();
  }

  _handleTabChange(event) {
      return this._appShellState.handleTabChange(event);
  }

  _handleHomeNavigate(event) {
      return this._appShellState.handleHomeNavigate(event);
  }

  _initializeTab(tab, { force = false } = {}) {
      return this._appShellState.initializeTab(tab, { force });
  }

  _showExploreRatingDialog(imageIds) {
      return this._ratingModalState.showExploreRatingDialog(imageIds);
  }

  _showAuditRatingDialog(imageIds) {
      return this._ratingModalState.showAuditRatingDialog(imageIds);
  }

  _handleRatingModalClick(rating) {
      return this._ratingModalState.handleRatingModalClick(rating);
  }

  _closeRatingModal() {
      return this._ratingModalState.closeRatingModal();
  }

  _handleEscapeKey(e) {
      return this._ratingModalState.handleEscapeKey(e);
  }

  async _applyExploreRating(imageIds, rating) {
      return await this._ratingModalState.applyExploreRating(imageIds, rating);
  }

  async _applyAuditRating(imageIds, rating) {
      return await this._ratingModalState.applyAuditRating(imageIds, rating);
  }

  disconnectedCallback() {
      this._appEventsState.disconnect();
      super.disconnectedCallback();
  }

  _applyCurateFilters({ resetOffset = false } = {}) {
      return this._curateHomeState.applyCurateFilters({ resetOffset });
  }

  // Explore selection handlers - now using factory to eliminate duplication
  _cancelCuratePressState() {
      return this._exploreSelectionHandlers.cancelPressState();
  }

  // Audit selection handlers - now using factory to eliminate duplication
  _cancelCurateAuditPressState() {
      return this._auditSelectionHandlers.cancelPressState();
  }

  _handleCurateKeywordSelect(event, mode) {
      return this._curateHomeState.handleKeywordSelect(event, mode);
  }

  _updateCurateCategoryCards() {
      return this._curateHomeState.updateCurateCategoryCards();
  }

  async _fetchCurateHomeImages() {
      return await this._curateHomeState.fetchCurateHomeImages();
  }

  async _refreshCurateHome() {
      return await this._curateHomeState.refreshCurateHome();
  }


  _handleTenantChange(e) {
      return this._appShellState.handleTenantChange(e);
  }

  _handleOpenUploadModal() {
      this.showUploadModal = true;
  }

    _handleCloseUploadModal() {
        this.showUploadModal = false;
    }

    _handlePipelineOpenImage(event) {
        const image = event?.detail?.image;
        if (!image?.id) return;
        this.curateEditorImage = image;
        this.curateEditorImageSet = Array.isArray(this.curateImages) ? [...this.curateImages] : [];
        this.curateEditorImageIndex = this.curateEditorImageSet.findIndex(img => img.id === image.id);
        this.curateEditorOpen = true;
    }
    
    _handleUploadComplete() {
        const curateFilters = buildCurateFilterObject(this);
        this.curateHomeFilterPanel.updateFilters(curateFilters);
        this._fetchCurateHomeImages();
        this.fetchStats({
          force: true,
          includeTagStats: this.activeTab === 'curate' && this.curateSubTab === 'home',
        });
        this.showUploadModal = false;
    }

  _handleCurateChipFiltersChanged(event) {
      return this._curateHomeState.handleChipFiltersChanged(event);
  }

  _handleCurateListExcludeFromRightPanel(event) {
      return this._curateHomeState.handleListExcludeFromRightPanel(event);
  }

  _handleCurateAuditChipFiltersChanged(event) {
      return this._curateAuditState.handleChipFiltersChanged(event);
  }

  async _fetchDropboxFolders(query) {
      return await this._searchState.fetchDropboxFolders(query);
  }

  _handleCurateThumbSizeChange(event) {
      this.curateThumbSize = Number(event.target.value);
  }

  _handleCurateSubTabChange(nextTab) {
      return this._curateExploreState.handleSubTabChange(nextTab);
  }

  _buildCurateFilters(options = {}) {
      return buildCurateFilterObject(this, options);
  }

  _getCurateHomeFetchKey() {
      return getCurateHomeFetchKey(this);
  }

  _getCurateAuditFetchKey(options = {}) {
      return getCurateAuditFetchKey(this, options);
  }

  _shouldAutoRefreshCurateStats() {
      return shouldAutoRefreshCurateStats(this);
  }

  async _loadExploreByTagData(forceRefresh = false) {
      return await this._curateExploreState.loadExploreByTagData(forceRefresh);
  }

  _handleCurateAuditModeChange(valueOrEvent) {
      const mode = typeof valueOrEvent === 'string'
          ? valueOrEvent
          : valueOrEvent.target.value;
      return this._curateAuditState.handleModeChange(mode);
  }

  _handleCurateAuditAiEnabledChange(event) {
      return this._curateAuditState.handleAiEnabledChange(event.target.checked);
  }

  _handleCurateAuditAiModelChange(nextModel) {
      return this._curateAuditState.handleAiModelChange(nextModel);
  }

  // Audit pagination handlers - now using factory to eliminate duplication
  async _fetchCurateAuditImages(options = {}) {
      return await this._curateAuditState.fetchCurateAuditImages(options);
  }

  _refreshCurateAudit() {
      return this._curateAuditState.refreshAudit();
  }


  _handleCurateImageClick(event, image, imageSet) {
      return this._curateHomeState.handleCurateImageClick(event, image, imageSet);
  }

  async _handleZoomToPhoto(e) {
      return await this._curateExploreState.handleZoomToPhoto(e);
  }

  _handleCurateEditorClose() {
      return this._curateHomeState.handleCurateEditorClose();
  }

  _handleImageNavigate(event) {
      return this._curateHomeState.handleImageNavigate(event);
  }

  _flashCurateSelection(imageId) {
      return this._curateHomeState.flashSelection(imageId);
  }

  render() {
    const canCurate = this._canCurate();
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
        ${renderRatingModal(this)}
        <app-header
            .tenant=${this.tenant}
            @tenant-change=${this._handleTenantChange}
            @open-upload-modal=${this._handleOpenUploadModal}
            .activeTab=${this.activeTab}
            .canCurate=${canCurate}
            .queueCount=${(this.queueState?.queuedCount || 0) + (this.queueState?.inProgressCount || 0) + (this.queueState?.failedCount || 0)}
            @tab-change=${this._handleTabChange}
            @sync-progress=${this._handleSyncProgress}
            @sync-complete=${this._handleSyncComplete}
            @sync-error=${this._handleSyncError}
        ></app-header>
        
        <tab-container .activeTab=${this.activeTab}>
            ${this.activeTab === 'home' ? renderHomeTabContent(this, { navCards, formatCurateDate }) : ''}
            ${this.activeTab === 'search' ? renderSearchTabContent(this, { formatCurateDate }) : ''}
            ${this.activeTab === 'curate' ? renderCurateTabContent(this, { formatCurateDate }) : ''}
            ${renderAuxTabContent(this, { formatCurateDate, formatQueueItem, retryFailedCommand })}
        </tab-container>
        ${renderGlobalOverlays(this, { canCurate })}
    `;
  }

  async fetchKeywords() {
      return await this._appDataState.fetchKeywords();
  }

  async fetchStats({ force = false, includeRatings, includeImageStats = true, includeMlStats = true, includeTagStats = true } = {}) {
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

  _handleSyncProgress(e) {
      return this._appDataState.handleSyncProgress(e);
  }

  _handleSyncComplete(e) {
      return this._appDataState.handleSyncComplete(e);
  }

  _handleSyncError(e) {
      return this._appDataState.handleSyncError(e);
  }

  updated(changedProperties) {
      if (changedProperties.has('curateAuditKeyword') || changedProperties.has('curateAuditMode')) {
          this._syncAuditHotspotPrimary();
      }
      if (changedProperties.has('keywords') && this.curateAuditKeyword) {
          this._syncAuditHotspotPrimary();
      }
      this._appShellState.handleUpdated(changedProperties);
  }

}

customElements.define('photocat-app', PhotoCatApp);
