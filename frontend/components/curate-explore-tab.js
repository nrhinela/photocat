import { LitElement, html } from 'lit';
import { enqueueCommand } from '../services/command-queue.js';
import { getDropboxFolders } from '../services/api.js';
import { createSelectionHandlers } from './shared/selection-handlers.js';
import { renderResultsPagination } from './shared/pagination-controls.js';
import { renderImageGrid } from './shared/image-grid.js';
import {
  getKeywordsByCategory,
  getCategoryCount,
  getKeywordsByCategoryFromList,
  getCategoryCountFromList,
} from './shared/keyword-utils.js';
import './shared/widgets/filter-chips.js';

/**
 * Curate Explore Tab Component
 *
 * Main curate workflow interface with:
 * - Image grid with rating and permatag overlays
 * - Multi-select via long-press and drag
 * - "Hotspots" feature for quick drag & drop rating/tagging
 * - Advanced filtering integration
 * - Pagination controls
 * - Reordering via drag & drop
 *
 * @property {String} tenant - Current tenant ID
 * @property {Array} images - Filtered/paginated image list
 * @property {Number} thumbSize - Thumbnail size (80-220px)
 * @property {String} orderBy - Sort field ('photo_creation', 'processed', 'rating')
 * @property {String} dateOrder - Date sort order ('asc', 'desc')
 * @property {Number} limit - Items per page
 * @property {Number} offset - Pagination offset
 * @property {Number} total - Total image count
 * @property {Boolean} loading - Loading state
 * @property {Array} dragSelection - Selected image IDs
 * @property {Boolean} dragSelecting - Multi-select mode active
 * @property {Object} renderCurateRatingWidget - Rating widget renderer (from parent)
 * @property {Object} renderCurateRatingStatic - Static rating renderer (from parent)
 * @property {Object} formatCurateDate - Date formatter (from parent)
 * @property {Object} imageStats - Image statistics
 * @property {Object} curateCategoryCards - Category card data
 * @property {String} selectedKeywordValueMain - Selected keyword filter
 * @property {String|Number} minRating - Active rating filter value
 * @property {String} dropboxPathPrefix - Active Dropbox folder filter
 * @property {Array} dropboxFolders - Dropbox folder options
 * @property {Array} curateExploreTargets - Hotspot targets
 * @property {Boolean} curateExploreRatingEnabled - Rating hotspot enabled
 * @property {Number} curateExploreRatingCount - Rating hotspot count
 *
 * @fires images-loaded - When images are loaded
 * @fires image-clicked - When user clicks an image
 * @fires rating-changed - When image rating changes
 * @fires permatag-changed - When permatag is added/removed
 * @fires selection-changed - When drag selection changes
 * @fires thumb-size-changed - When thumbnail size changes
 * @fires sort-changed - When sort order changes
 * @fires advanced-toggled - When advanced filter panel is toggled
 * @fires pagination-changed - When pagination changes
 * @fires refresh-requested - When refresh is requested
 * @fires keyword-selected - When keyword filter changes
 * @fires hotspot-changed - When hotspot configuration changes
 * @fires rating-drop - When images dropped on rating zone
 * @fires curate-filters-changed - When filter chips change
 */
export class CurateExploreTab extends LitElement {
  // Use Light DOM to access Tailwind CSS classes
  createRenderRoot() {
    return this;
  }

  static properties = {
    tenant: { type: String },
    images: { type: Array },
    thumbSize: { type: Number },
    orderBy: { type: String },
    dateOrder: { type: String },
    limit: { type: Number },
    offset: { type: Number },
    total: { type: Number },
    loading: { type: Boolean },
    dragSelection: { type: Array },
    dragSelecting: { type: Boolean },
    dragStartIndex: { type: Number },
    dragEndIndex: { type: Number },
    renderCurateRatingWidget: { type: Object },
    renderCurateRatingStatic: { type: Object },
    renderCuratePermatagSummary: { type: Object },
    renderCurateAiMLScore: { type: Object },
    formatCurateDate: { type: Object },
    imageStats: { type: Object },
    curateCategoryCards: { type: Array },
    selectedKeywordValueMain: { type: String },
    minRating: { type: Object },
    dropboxPathPrefix: { type: String },
    dropboxFolders: { type: Array },
    tagStatsBySource: { type: Object },
    activeCurateTagSource: { type: String },
    keywords: { type: Array },
    curateExploreTargets: { type: Array },
    curateExploreRatingEnabled: { type: Boolean },
    curateExploreRatingCount: { type: Number },

    // Internal state properties
    _curatePressActive: { type: Boolean, state: true },
    _curatePressStart: { type: Object, state: true },
    _curatePressIndex: { type: Number, state: true },
    _curatePressImageId: { type: Number, state: true },
    _curatePressTimer: { type: Number, state: true },
    _curateLongPressTriggered: { type: Boolean, state: true },
    _curateFlashSelectionIds: { type: Object, state: true },
    _curateExploreHotspotDragTarget: { type: String, state: true },
    _curateExploreRatingDragTarget: { type: Boolean, state: true },
    _curateReorderDraggedId: { type: Number, state: true },
    _curateLeftOrder: { type: Array, state: true },
    _curateSuppressClick: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.tenant = '';
    this.images = [];
    this.thumbSize = 120;
    this.orderBy = 'photo_creation';
    this.dateOrder = 'desc';
    this.limit = 100;
    this.offset = 0;
    this.total = 0;
    this.loading = false;
    this.dragSelection = [];
    this.dragSelecting = false;
    this.dragStartIndex = null;
    this.dragEndIndex = null;
    this.renderCurateRatingWidget = null;
    this.renderCurateRatingStatic = null;
    this.renderCuratePermatagSummary = null;
    this.renderCurateAiMLScore = null;
    this.formatCurateDate = null;
    this.imageStats = null;
    this.curateCategoryCards = [];
    this.selectedKeywordValueMain = '';
    this.minRating = null;
    this.dropboxPathPrefix = '';
    this.dropboxFolders = [];
    this.tagStatsBySource = {};
    this.activeCurateTagSource = '';
    this.keywords = [];
    this.curateExploreTargets = [{ id: '1', type: 'keyword', count: 0 }];
    this.curateExploreRatingEnabled = false;
    this.curateExploreRatingCount = 0;
    this._curateDropboxFetchTimer = null;
    this._curateDropboxQuery = '';

    // Internal state
    this._curatePressActive = false;
    this._curatePressStart = null;
    this._curatePressIndex = null;
    this._curatePressImageId = null;
    this._curatePressTimer = null;
    this._curateLongPressTriggered = false;
    this._curateFlashSelectionIds = new Set();
    this._curateExploreHotspotDragTarget = null;
    this._curateExploreRatingDragTarget = false;
    this._curateReorderDraggedId = null;
    this._curateLeftOrder = [];
    this._curateSuppressClick = false;

    // Configure selection handlers
    this._curateSelectionHandlers = createSelectionHandlers(this, {
      selectionProperty: 'dragSelection',
      selectingProperty: 'dragSelecting',
      startIndexProperty: 'dragStartIndex',
      endIndexProperty: 'dragEndIndex',
      pressActiveProperty: '_curatePressActive',
      pressStartProperty: '_curatePressStart',
      pressIndexProperty: '_curatePressIndex',
      pressImageIdProperty: '_curatePressImageId',
      pressTimerProperty: '_curatePressTimer',
      longPressTriggeredProperty: '_curateLongPressTriggered',
      getOrder: () => this._curateLeftOrder || [],
      flashSelection: (imageId) => this._flashCurateSelection(imageId),
    });
    const originalUpdateSelection = this._curateSelectionHandlers.updateSelection.bind(this._curateSelectionHandlers);
    const originalClearSelection = this._curateSelectionHandlers.clearSelection.bind(this._curateSelectionHandlers);
    this._curateSelectionHandlers.updateSelection = () => {
      const before = Array.isArray(this.dragSelection) ? [...this.dragSelection] : [];
      originalUpdateSelection();
      const after = Array.isArray(this.dragSelection) ? [...this.dragSelection] : [];
      if (before.length !== after.length || before.some((id, idx) => id !== after[idx])) {
        this._emitSelectionChanged(after);
      }
    };
    this._curateSelectionHandlers.clearSelection = () => {
      const before = Array.isArray(this.dragSelection) ? [...this.dragSelection] : [];
      originalClearSelection();
      if (before.length) {
        this._emitSelectionChanged([]);
      }
    };

    // Bind selection end handler for window events
    this._handleCurateSelectionEnd = () => {
      if (this.dragSelecting) {
        this.dragSelecting = false;
        this.dragStartIndex = null;
        this.dragEndIndex = null;
      }
      const hadLongPress = this._curateLongPressTriggered;
      this._curateSelectionHandlers.cancelPressState();
      if (hadLongPress) {
        this._curateSuppressClick = true;
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    // Listen for pointer/key release to end selection
    window.addEventListener('pointerup', this._handleCurateSelectionEnd);
    window.addEventListener('keyup', this._handleCurateSelectionEnd);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Remove window event listeners
    window.removeEventListener('pointerup', this._handleCurateSelectionEnd);
    window.removeEventListener('keyup', this._handleCurateSelectionEnd);

    // Cancel any active press timers
    if (this._curatePressTimer) {
      clearTimeout(this._curatePressTimer);
    }
  }

  // ========================================
  // Selection Handlers
  // ========================================

  _flashCurateSelection(imageId) {
    this._curateFlashSelectionIds.add(imageId);
    this.requestUpdate();
    setTimeout(() => {
      this._curateFlashSelectionIds.delete(imageId);
      this.requestUpdate();
    }, 300);
  }

  _handleCuratePointerDownWithOrder(event, index, imageId, order) {
    this._curateLeftOrder = order;
    this._curateSelectionHandlers.handlePointerDown(event, index, imageId);
  }

  _handleCuratePointerMove(event) {
    this._curateSelectionHandlers.handlePointerMove(event);
  }

  _handleCurateSelectHoverWithOrder(index, order) {
    this._curateLeftOrder = order;
    this._curateSelectionHandlers.handleSelectHover(index);
  }

  _handleCurateImageClick(event, image, imageSet) {
    // Don't open modal if we're in selection mode or if long-press was triggered
    if (this.dragSelecting || this._curateLongPressTriggered) {
      event.preventDefault();
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    if (this._curateSuppressClick) {
      this._curateSuppressClick = false;
      return;
    }
    if (this.dragSelection?.length) {
      this.dispatchEvent(new CustomEvent('selection-changed', {
        detail: { selection: [] },
        bubbles: true,
        composed: true
      }));
      return;
    }

    this.dispatchEvent(new CustomEvent('image-clicked', {
      detail: {
        event,
        image,
        imageSet: imageSet || this.images || []
      },
      bubbles: true,
      composed: true
    }));
  }

  _emitSelectionChanged(selection) {
    this.dispatchEvent(new CustomEvent('selection-changed', {
      detail: { selection },
      bubbles: true,
      composed: true
    }));
  }

  // ========================================
  // Selection State Management
  // ========================================

  _cancelCuratePressState() {
    return this._curateSelectionHandlers.cancelPressState();
  }

  // ========================================
  // Reordering Handlers
  // ========================================

  _handleCurateExploreReorderStart(event, image) {
    if (this.dragSelecting) {
      event.preventDefault();
      return;
    }
    if (this._curatePressActive) {
      this._cancelCuratePressState();
    }

    // Handle dragging selection or single image
    let ids = [image.id];
    if (this.dragSelection.length && this.dragSelection.includes(image.id)) {
      ids = this.dragSelection;
    } else if (this.dragSelection.length) {
      // Clear selection if dragging non-selected image
      this.dispatchEvent(new CustomEvent('selection-changed', {
        detail: { selection: [image.id] },
        bubbles: true,
        composed: true
      }));
    }

    this._curateReorderDraggedId = image.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', ids.join(','));
    event.dataTransfer.setData('application/x-photocat-source', 'available');
  }

  _handleCurateExploreReorderOver(event, targetImageId) {
    if (!this._curateReorderDraggedId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    // TODO: Visual feedback for reorder target
  }

  _handleCurateExploreReorderEnd(event) {
    this._curateReorderDraggedId = null;
  }

  // ========================================
  // UI Control Handlers
  // ========================================

  _handleCurateQuickSort(orderBy) {
    const newDateOrder = this.orderBy === orderBy
      ? (this.dateOrder === 'asc' ? 'desc' : 'asc')
      : 'desc';

    this.dispatchEvent(new CustomEvent('sort-changed', {
      detail: { orderBy, dateOrder: newDateOrder },
      bubbles: true,
      composed: true
    }));
  }

  _getCurateQuickSortArrow(orderBy) {
    if (this.orderBy !== orderBy) return '';
    return this.dateOrder === 'asc' ? '↑' : '↓';
  }

  _handleCurateKeywordSelect(event, mode) {
    // Pass the original event so parent can access event.target.value
    this.dispatchEvent(new CustomEvent('keyword-selected', {
      detail: { event, mode },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateChipFiltersChanged(event) {
    const filters = event.detail?.filters || [];
    this.dispatchEvent(new CustomEvent('curate-filters-changed', {
      detail: { filters },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateDropboxInput(event) {
    const query = event.detail?.query || '';
    this._curateDropboxQuery = query;
    if (this._curateDropboxFetchTimer) {
      clearTimeout(this._curateDropboxFetchTimer);
    }
    if (query.length < 2) {
      this.dropboxFolders = [];
      return;
    }
    this._curateDropboxFetchTimer = setTimeout(() => {
      this._fetchDropboxFolders(query);
    }, 500);
  }

  async _fetchDropboxFolders(query) {
    if (!this.tenant) return;
    try {
      const response = await getDropboxFolders(this.tenant, { query });
      this.dropboxFolders = response?.folders || [];
    } catch (error) {
      console.error('Error fetching Dropbox folders:', error);
      this.dropboxFolders = [];
    }
  }

  _buildActiveFiltersFromSelection() {
    const filters = [];
    const selected = this.selectedKeywordValueMain || '';
    if (selected) {
      if (selected === '__untagged__') {
        filters.push({
          type: 'keyword',
          category: 'Untagged',
          value: '__untagged__',
          displayLabel: 'Keywords',
          displayValue: 'Untagged',
        });
      } else {
        const [encodedCategory, ...encodedKeywordParts] = selected.split('::');
        const category = decodeURIComponent(encodedCategory || '');
        const keyword = decodeURIComponent(encodedKeywordParts.join('::') || '');
        if (keyword) {
          filters.push({
            type: 'keyword',
            category,
            value: keyword,
            displayLabel: 'Keywords',
            displayValue: keyword,
          });
        }
      }
    }

    if (this.minRating !== null && this.minRating !== undefined && this.minRating !== '') {
      const displayValue = this.minRating === 'unrated'
        ? 'Unrated'
        : (this.minRating === 0
          ? html`<span class="text-gray-600" title="Rating 0" aria-label="Trash">🗑</span>`
          : `${this.minRating}+`);
      filters.push({
        type: 'rating',
        value: this.minRating,
        displayLabel: 'Rating',
        displayValue,
      });
    }

    if (this.dropboxPathPrefix) {
      filters.push({
        type: 'folder',
        value: this.dropboxPathPrefix,
        displayLabel: 'Folder',
        displayValue: this.dropboxPathPrefix,
      });
    }

    return filters;
  }

  _handleThumbSizeChange(event) {
    const nextSize = Number(event.target.value);
    if (!Number.isFinite(nextSize)) return;
    this.thumbSize = nextSize;
    this.dispatchEvent(new CustomEvent('thumb-size-changed', {
      detail: { size: nextSize },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateLimitChange = (newLimit) => {
    this.dispatchEvent(new CustomEvent('pagination-changed', {
      detail: { offset: 0, limit: newLimit },
      bubbles: true,
      composed: true
    }));
  };

  _handleCuratePagePrev = () => {
    const newOffset = Math.max(0, this.offset - this.limit);
    this.dispatchEvent(new CustomEvent('pagination-changed', {
      detail: { offset: newOffset, limit: this.limit },
      bubbles: true,
      composed: true
    }));
  };

  _handleCuratePageNext = () => {
    const newOffset = this.offset + this.limit;
    this.dispatchEvent(new CustomEvent('pagination-changed', {
      detail: { offset: newOffset, limit: this.limit },
      bubbles: true,
      composed: true
    }));
  };

  // ========================================
  // Hotspot Handlers
  // ========================================

  _handleCurateExploreRatingToggle(event) {
    const enabled = event.target.checked;
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'rating-toggle', enabled },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreRatingDragOver(event) {
    event.preventDefault();
    this._curateExploreRatingDragTarget = true;
  }

  _handleCurateExploreRatingDragLeave(event) {
    this._curateExploreRatingDragTarget = false;
  }

  _handleCurateExploreRatingDrop(event) {
    event.preventDefault();
    this._curateExploreRatingDragTarget = false;

    this.dispatchEvent(new CustomEvent('rating-drop', {
      detail: { event },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotDragOver(event, targetId) {
    event.preventDefault();
    this._curateExploreHotspotDragTarget = targetId;
  }

  _handleCurateExploreHotspotDragLeave(event) {
    this._curateExploreHotspotDragTarget = null;
  }

  _handleCurateExploreHotspotDrop(event, targetId) {
    event.preventDefault();
    this._curateExploreHotspotDragTarget = null;

    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'hotspot-drop', targetId, event },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotTypeChange(event, targetId) {
    const type = event.target.value;
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'type-change', targetId, value: type },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotRatingChange(event, targetId) {
    const rating = event.target.value;
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'rating-change', targetId, value: rating },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotKeywordChange(event, targetId) {
    const keyword = event.target.value;
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'keyword-change', targetId, value: keyword },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotActionChange(event, targetId) {
    const action = event.target.value;
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'action-change', targetId, value: action },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotRemoveTarget(targetId) {
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'remove-target', targetId },
      bubbles: true,
      composed: true
    }));
  }

  _handleCurateExploreHotspotAddTarget() {
    this.dispatchEvent(new CustomEvent('hotspot-changed', {
      detail: { type: 'add-target' },
      bubbles: true,
      composed: true
    }));
  }

  // ========================================
  // Helper Methods
  // ========================================

  _getKeywordsByCategory() {
    if (this.keywords && this.keywords.length) {
      return getKeywordsByCategoryFromList(this.keywords);
    }
    return getKeywordsByCategory(this.tagStatsBySource, this.activeCurateTagSource);
  }

  _getCategoryCount(category) {
    if (this.keywords && this.keywords.length) {
      return getCategoryCountFromList(this.keywords, category);
    }
    return getCategoryCount(this.tagStatsBySource, category, this.activeCurateTagSource);
  }

  // ========================================
  // Render
  // ========================================

  render() {
    const leftImages = (this.images || []).filter((image) => image && image.id);
    const offset = this.offset ?? 0;
    const limit = this.limit ?? 100;
    const total = this.total ?? 0;
    const totalFormatted = total.toLocaleString('en-US');
    const leftPaneLabel = `Images (${total})`;
    const totalLabel = `${totalFormatted} ITEMS`;
    const curateCountLabel = `${offset + 1}-${Math.min(offset + limit, total)} OF ${totalFormatted}`;
    const curateHasPrev = offset > 0;
    const curateHasMore = offset + limit < total;
    const activeFilters = this._buildActiveFiltersFromSelection();

    // Update left order for selection
    this._curateLeftOrder = leftImages.map(img => img.id);

    return html`
      <div>
        <div class="curate-header-layout mb-4">
          <div class="w-full">
            <filter-chips
              .tenant=${this.tenant}
              .tagStatsBySource=${this.tagStatsBySource}
              .activeCurateTagSource=${this.activeCurateTagSource || 'permatags'}
              .keywords=${this.keywords}
              .imageStats=${this.imageStats}
              .activeFilters=${activeFilters}
              .dropboxFolders=${this.dropboxFolders || []}
              .renderSortControls=${() => html`
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-gray-700">Sort:</span>
                  <div class="curate-audit-toggle">
                    <button
                      class=${this.orderBy === 'rating' ? 'active' : ''}
                      @click=${() => this._handleCurateQuickSort('rating')}
                    >
                      Rating ${this._getCurateQuickSortArrow('rating')}
                    </button>
                    <button
                      class=${this.orderBy === 'photo_creation' ? 'active' : ''}
                      @click=${() => this._handleCurateQuickSort('photo_creation')}
                    >
                      Photo Date ${this._getCurateQuickSortArrow('photo_creation')}
                    </button>
                    <button
                      class=${this.orderBy === 'processed' ? 'active' : ''}
                      @click=${() => this._handleCurateQuickSort('processed')}
                    >
                      Process Date ${this._getCurateQuickSortArrow('processed')}
                    </button>
                  </div>
                </div>
              `}
              @filters-changed=${this._handleCurateChipFiltersChanged}
              @folder-search=${this._handleCurateDropboxInput}
            ></filter-chips>
          </div>
          <div></div>
        </div>

        <div class="curate-layout" style="--curate-thumb-size: ${this.thumbSize}px;">
          <div class="curate-pane">
              <div class="curate-pane-header" style="padding: 4px;">
                  ${renderResultsPagination({
                    total,
                    offset,
                    limit,
                    count: leftImages.length,
                    onPrev: this._handleCuratePagePrev,
                    onNext: this._handleCuratePageNext,
                    onLimitChange: (e) => this._handleCurateLimitChange(Number(e.target.value)),
                    disabled: this.loading,
                  })}
              </div>
              ${this.loading ? html`
                <div class="curate-loading-overlay" aria-label="Loading">
                  <span class="curate-spinner large"></span>
                </div>
              ` : html``}
              <div class="curate-pane-body">
                  ${renderImageGrid({
                    images: leftImages,
                    selection: this.dragSelection,
                    flashSelectionIds: this._curateFlashSelectionIds,
                    selectionHandlers: this._curateSelectionHandlers,
                    renderFunctions: {
                      renderCurateRatingWidget: this.renderCurateRatingWidget,
                      renderCurateRatingStatic: this.renderCurateRatingStatic,
                      renderCuratePermatagSummary: this.renderCuratePermatagSummary,
                      renderCurateAiMLScore: this.renderCurateAiMLScore,
                      formatCurateDate: this.formatCurateDate,
                    },
                    eventHandlers: {
                      onImageClick: (event, image) => this._handleCurateImageClick(event, image, leftImages),
                      onDragStart: (event, image) => this._handleCurateExploreReorderStart(event, image),
                      onDragOver: (event, targetImageId) => this._handleCurateExploreReorderOver(event, targetImageId),
                      onDragEnd: (event) => this._handleCurateExploreReorderEnd(event),
                      onPointerDown: (event, index, imageId) => this._handleCuratePointerDownWithOrder(event, index, imageId, this._curateLeftOrder),
                      onPointerMove: (event) => this._handleCuratePointerMove(event),
                      onPointerEnter: (index) => this._handleCurateSelectHoverWithOrder(index, this._curateLeftOrder),
                    },
                    options: {
                      enableReordering: true,
                      showPermatags: true,
                      showAiScore: true,
                      emptyMessage: 'No images available.',
                    },
                  })}
                  ${renderResultsPagination({
                    total,
                    offset,
                    limit,
                    count: leftImages.length,
                    onPrev: this._handleCuratePagePrev,
                    onNext: this._handleCuratePageNext,
                    onLimitChange: (e) => this._handleCurateLimitChange(Number(e.target.value)),
                    disabled: this.loading,
                  })}
              </div>
          </div>
          <div class="curate-pane utility-targets">
              <div class="curate-pane-header">
                  <div class="curate-pane-header-row">
                      <span>Hotspots</span>
                      <div class="curate-rating-checkbox" style="margin-left: auto;">
                          <input
                              type="checkbox"
                              id="rating-checkbox-explore"
                              .checked=${this.curateExploreRatingEnabled}
                              @change=${this._handleCurateExploreRatingToggle}
                          />
                          <label for="rating-checkbox-explore">Rating</label>
                      </div>
                  </div>
              </div>
              <div class="curate-pane-body">
                ${this.curateExploreRatingEnabled ? html`
                  <div
                    class="curate-rating-drop-zone ${this._curateExploreRatingDragTarget ? 'active' : ''}"
                    @dragover=${(event) => this._handleCurateExploreRatingDragOver(event)}
                    @dragleave=${this._handleCurateExploreRatingDragLeave}
                    @drop=${(event) => this._handleCurateExploreRatingDrop(event)}
                  >
                    <div class="curate-rating-drop-zone-star">⭐</div>
                    <div class="curate-rating-drop-zone-content">
                      <div class="curate-rating-drop-hint">Drop to rate</div>
                      <div class="curate-rating-count">${this.curateExploreRatingCount || 0} rated</div>
                    </div>
                  </div>
                ` : html``}
                <div class="curate-utility-panel">
                  ${(this.curateExploreTargets || []).map((target) => {
                    const isFirstTarget = (this.curateExploreTargets?.[0]?.id === target.id);
                    const isRating = target.type === 'rating';
                    const selectedValue = target.keyword
                      ? `${encodeURIComponent(target.category || 'Uncategorized')}::${encodeURIComponent(target.keyword)}`
                      : '';
                    return html`
                      <div
                        class="curate-utility-box ${this._curateExploreHotspotDragTarget === target.id ? 'active' : ''}"
                        @dragover=${(event) => this._handleCurateExploreHotspotDragOver(event, target.id)}
                        @dragleave=${this._handleCurateExploreHotspotDragLeave}
                        @drop=${(event) => this._handleCurateExploreHotspotDrop(event, target.id)}
                      >
                        <div class="curate-utility-controls">
                          <select
                            class="curate-utility-type-select"
                            .value=${target.type || 'keyword'}
                            @change=${(event) => this._handleCurateExploreHotspotTypeChange(event, target.id)}
                          >
                            <option value="keyword">Keyword</option>
                            <option value="rating">Rating</option>
                          </select>
                          ${isRating ? html`
                            <select
                              class="curate-utility-select"
                              .value=${target.rating ?? ''}
                              @change=${(event) => this._handleCurateExploreHotspotRatingChange(event, target.id)}
                            >
                              <option value="">Select rating…</option>
                              <option value="0">🗑️ Garbage</option>
                              <option value="1">⭐ 1 Star</option>
                              <option value="2">⭐⭐ 2 Stars</option>
                              <option value="3">⭐⭐⭐ 3 Stars</option>
                            </select>
                          ` : html`
                            <select
                              class="curate-utility-select ${selectedValue ? 'selected' : ''}"
                              .value=${selectedValue}
                              @change=${(event) => this._handleCurateExploreHotspotKeywordChange(event, target.id)}
                            >
                              <option value="">Select keyword…</option>
                              ${this._getKeywordsByCategory().map(([category, keywords]) => html`
                                <optgroup label="${category}">
                                  ${keywords.map((kw) => html`
                                    <option value=${`${encodeURIComponent(category)}::${encodeURIComponent(kw.keyword)}`}>
                                      ${kw.keyword}
                                    </option>
                                  `)}
                                </optgroup>
                              `)}
                            </select>
                            <select
                              class="curate-utility-action"
                              .value=${target.action || 'add'}
                              @change=${(event) => this._handleCurateExploreHotspotActionChange(event, target.id)}
                            >
                              <option value="add">Add</option>
                              <option value="remove">Remove</option>
                            </select>
                          `}
                        </div>
                        ${!isFirstTarget ? html`
                          <button
                            type="button"
                            class="curate-utility-remove"
                            title="Remove box"
                            @click=${() => this._handleCurateExploreHotspotRemoveTarget(target.id)}
                          >
                            ×
                          </button>
                        ` : html``}
                        <div class="curate-utility-count">${target.count || 0}</div>
                        <div class="curate-utility-drop-hint">Drop images here</div>
                      </div>
                    `;
                  })}
                  <button class="curate-utility-add" @click=${this._handleCurateExploreHotspotAddTarget}>
                    +
                  </button>
                </div>
                </div>
              </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('curate-explore-tab', CurateExploreTab);
