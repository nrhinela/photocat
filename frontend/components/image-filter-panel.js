import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';
import { getImages } from '../services/api.js';
import './filter-chips.js';

/**
 * ImageFilterPanel - Reusable component for managing image search/filtering
 *
 * Provides independent state management for different filter panels (search, curate, audit, etc.)
 * Each instance maintains its own filters, images, and pagination state
 *
 * Properties:
 *  - tabId: Unique identifier for this panel instance (e.g., 'search', 'curate-home', 'curate-audit')
 *  - tenant: Tenant ID for API calls
 *  - filters: Current filter state for this panel
 *  - images: Current images to display
 *  - imageStats: Image statistics for filter UI
 *  - tagStatsBySource: Tag statistics organized by source
 *  - activeCurateTagSource: Currently selected tag source
 *
 * Events:
 *  - filters-changed: Emitted when filters change, detail: { tabId, filters }
 *  - images-loaded: Emitted when images are loaded, detail: { tabId, images, total }
 */
export class ImageFilterPanel extends LitElement {
  static styles = [tailwind, css`
    :host {
      display: block;
    }
    .loading {
      opacity: 0.6;
      pointer-events: none;
    }
  `];

  static properties = {
    tabId: { type: String },
    tenant: { type: String },
    filters: { type: Object },
    images: { type: Array },
    imageStats: { type: Object },
    tagStatsBySource: { type: Object },
    activeCurateTagSource: { type: String },
    loading: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.tabId = 'default';
    this.tenant = null;
    this.filters = {
      limit: 100,
      offset: 0,
      sortOrder: 'desc',
      orderBy: 'photo_creation',
      hideZeroRating: true,
    };
    this.images = [];
    this.imageStats = null;
    this.tagStatsBySource = {};
    this.activeCurateTagSource = 'permatags';
    this.loading = false;
  }

  /**
   * Build request-ready filters from current state
   * Consolidates all filter parameters into a single object for API calls
   */
  _buildRequestFilters() {
    const requestFilters = {
      limit: this.filters.limit,
      offset: this.filters.offset || 0,
      sortOrder: this.filters.sortOrder,
    };

    // Rating filter
    if (this.filters.rating !== undefined && this.filters.rating !== null) {
      if (this.filters.rating === 'unrated') {
        requestFilters.ratingOperator = 'is_null';
      } else {
        requestFilters.rating = this.filters.rating;
        requestFilters.ratingOperator = this.filters.rating === 0 ? 'eq' : 'gte';
      }
    }

    // Keyword/category filters
    if (this.filters.keywords && Object.keys(this.filters.keywords).length > 0) {
      const hasSelections = Object.values(this.filters.keywords)
        .some((keywordsSet) => keywordsSet && keywordsSet.size > 0);
      if (hasSelections) {
        requestFilters.keywords = this.filters.keywords;
        requestFilters.operators = this.filters.operators || {};
        requestFilters.categoryFilterSource = this.filters.categoryFilterSource || 'permatags';
      }
    }

    // Folder filter
    if (this.filters.dropboxPathPrefix) {
      requestFilters.dropboxPathPrefix = this.filters.dropboxPathPrefix;
    }

    // Ordering
    if (this.filters.orderBy) {
      requestFilters.orderBy = this.filters.orderBy;
    }

    // Hide deleted flag
    if (this.filters.hideZeroRating) {
      requestFilters.hideZeroRating = true;
    }

    // Permatag filters (curate-specific)
    if (this.filters.permatagPositiveMissing) {
      requestFilters.permatagPositiveMissing = true;
    }

    return requestFilters;
  }

  /**
   * Handle filter changes from filter-chips component
   */
  _handleFilterChanged(event) {
    const chipFilters = event.detail.filters;

    // Reset and apply chip filters
    this.filters = {
      ...this.filters,
      keywords: {},
      operators: {},
      rating: undefined,
      dropboxPathPrefix: '',
      permatagPositiveMissing: false,
    };

    // Apply each filter from chips
    chipFilters.forEach(filter => {
      switch (filter.type) {
        case 'keyword':
          if (filter.value === '__untagged__') {
            this.filters.permatagPositiveMissing = true;
          } else {
            this.filters.keywords = { [filter.category]: new Set([filter.value]) };
            this.filters.operators = { [filter.category]: 'OR' };
          }
          break;
        case 'rating':
          this.filters.rating = filter.value;
          break;
        case 'folder':
          this.filters.dropboxPathPrefix = filter.value;
          break;
      }
    });

    // Reset pagination on filter change
    this.filters.offset = 0;

    // Emit to parent
    this._emitFilterChanged();

    // Fetch with new filters
    this._fetchImages();
  }

  /**
   * Emit filter-changed event to parent
   */
  _emitFilterChanged() {
    this.dispatchEvent(new CustomEvent('filters-changed', {
      detail: { tabId: this.tabId, filters: this.filters },
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Fetch images from API with current filters
   */
  async _fetchImages() {
    if (!this.tenant) return;

    this.loading = true;
    try {
      const requestFilters = this._buildRequestFilters();
      const result = await getImages(this.tenant, requestFilters);

      const images = Array.isArray(result) ? result : (result.images || []);
      const total = Array.isArray(result) ? null : (result.total || 0);

      this.images = images;

      // Emit to parent
      this.dispatchEvent(new CustomEvent('images-loaded', {
        detail: { tabId: this.tabId, images, total },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error(`[ImageFilterPanel ${this.tabId}] Error fetching images:`, error);
      this.images = [];
    } finally {
      this.loading = false;
    }
  }

  /**
   * Handle pagination change
   */
  _handlePaginationChange(newOffset) {
    this.filters.offset = newOffset;
    this._emitFilterChanged();
    this._fetchImages();
  }

  /**
   * Handle limit/results per page change
   */
  _handleLimitChange(newLimit) {
    this.filters.limit = newLimit;
    this.filters.offset = 0;
    this._emitFilterChanged();
    this._fetchImages();
  }

  render() {
    return html`
      <div class=${this.loading ? 'loading' : ''}>
        <!-- Filter Controls -->
        <filter-chips
          .tenant=${this.tenant}
          .tagStatsBySource=${this.tagStatsBySource}
          .activeCurateTagSource=${this.activeCurateTagSource || 'permatags'}
          .imageStats=${this.imageStats}
          .activeFilters=${this.filters.activeFilters || []}
          @filters-changed=${this._handleFilterChanged}
        >
          <slot name="sort-controls"></slot>
          <slot name="view-controls"></slot>
        </filter-chips>

        <!-- Results Info -->
        <div class="flex items-center justify-between mb-4 text-sm text-gray-600">
          <div>${this.images.length} items</div>
          <div class="flex items-center gap-2">
            <span>Results per page:</span>
            <select
              .value=${String(this.filters.limit)}
              @change=${(e) => this._handleLimitChange(Number(e.target.value))}
              class="border border-gray-300 rounded px-2 py-1"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>

        <!-- Image Grid -->
        <div class="grid grid-cols-auto gap-2">
          ${this.images.map((image, index) => html`
            <div class="relative group">
              <img
                src=${image.thumbnail_url}
                alt="Image ${image.id}"
                class="w-full h-auto rounded cursor-pointer hover:opacity-80"
                @click=${() => this._handleImageClick(image, index)}
              >
              <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                <slot name="image-actions" .image=${image}></slot>
              </div>
            </div>
          `)}
        </div>

        <!-- Empty State -->
        ${this.images.length === 0 ? html`
          <div class="text-center py-8 text-gray-500">
            No images available
          </div>
        ` : ''}

        <!-- Pagination -->
        ${this.images.length > 0 ? html`
          <div class="flex items-center justify-center gap-2 mt-4">
            <button
              @click=${() => this._handlePaginationChange(Math.max(0, this.filters.offset - this.filters.limit))}
              class="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
              ?disabled=${this.filters.offset === 0}
            >
              ← Previous
            </button>
            <span class="text-sm text-gray-600">
              ${this.filters.offset + 1} - ${Math.min(this.filters.offset + this.filters.limit, this.images.length)}
            </span>
            <button
              @click=${() => this._handlePaginationChange(this.filters.offset + this.filters.limit)}
              class="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Hook for subclasses to handle image clicks
   */
  _handleImageClick(image, index) {
    this.dispatchEvent(new CustomEvent('image-clicked', {
      detail: { tabId: this.tabId, image, index },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('image-filter-panel', ImageFilterPanel);
