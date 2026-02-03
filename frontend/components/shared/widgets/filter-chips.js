import { LitElement, html } from 'lit';
import { tailwind } from '../../tailwind-lit.js';
import { getKeywordsByCategory, getCategoryCount, getKeywordsByCategoryFromList, getCategoryCountFromList } from '../keyword-utils.js';

class FilterChips extends LitElement {
  // Use Light DOM to access Tailwind CSS classes
  createRenderRoot() {
    return this;
  }

  static properties = {
    tenant: { type: String },
    tagStatsBySource: { type: Object },
    activeCurateTagSource: { type: String },
    keywords: { type: Array },
    imageStats: { type: Object },
    activeFilters: { type: Array },
    availableFilterTypes: { type: Array },
    filterMenuOpen: { type: Boolean },
    valueSelectorOpen: { type: String },
    dropboxFolders: { type: Array },
    searchDropboxQuery: { type: String },
    renderSortControls: { type: Object },
    renderFiltersActions: { type: Object },
    lists: { type: Array },
    listFilterMode: { type: String },
  };

  constructor() {
    super();
    this.tenant = '';
    this.tagStatsBySource = {};
    this.activeCurateTagSource = 'permatags';
    this.keywords = [];
    this.imageStats = {};
    this.activeFilters = [];
    this.availableFilterTypes = null;
    this.filterMenuOpen = false;
    this.valueSelectorOpen = null;
    this.dropboxFolders = [];
    this.searchDropboxQuery = '';
    this.renderSortControls = null;
    this.renderFiltersActions = null;
    this.lists = [];
    this.listFilterMode = 'include';
  }

  _getAvailableFilterTypes() {
    const active = new Set(this.activeFilters.map(f => f.type));
    const all = [
      { type: 'keyword', label: 'Keywords', icon: '🏷️' },
      { type: 'rating', label: 'Rating', icon: '⭐' },
      { type: 'folder', label: 'Folder', icon: '📂' },
      { type: 'list', label: 'List', icon: '🧾' },
    ];
    const allowed = Array.isArray(this.availableFilterTypes) && this.availableFilterTypes.length
      ? new Set(this.availableFilterTypes)
      : null;
    return all
      .filter(f => !active.has(f.type))
      .filter(f => !allowed || allowed.has(f.type));
  }

  _handleAddFilterClick() {
    this.filterMenuOpen = !this.filterMenuOpen;
    if (this.filterMenuOpen) {
      this.valueSelectorOpen = null;
    }
  }

  _handleFilterTypeSelect(type) {
    this.filterMenuOpen = false;
    this.valueSelectorOpen = type;
    if (type === 'list') {
      if (!this.listFilterMode) {
        this.listFilterMode = 'include';
      }
      if (!Array.isArray(this.lists) || this.lists.length === 0) {
        this._requestLists();
      }
    }
  }

  _handleEditFilter(type, index) {
    // Close any open menus and open the value selector for this filter type
    this.filterMenuOpen = false;
    this.valueSelectorOpen = type;
    if (type === 'list') {
      const existing = this.activeFilters[index];
      this.listFilterMode = existing?.mode === 'exclude' ? 'exclude' : 'include';
      if (!Array.isArray(this.lists) || this.lists.length === 0) {
        this._requestLists();
      }
    }
  }

  _handleKeywordSelect(category, keyword) {
    this.valueSelectorOpen = null;
    const filter = {
      type: 'keyword',
      category,
      value: keyword,
      displayLabel: 'Keywords',
      displayValue: keyword,
    };
    this._addFilter(filter);
  }

  _handleRatingSelect(rating) {
    this.valueSelectorOpen = null;
    const displayValue = rating === 'unrated'
      ? 'Unrated'
      : (rating === 0 ? html`<span class="text-gray-600" title="Rating 0" aria-label="Trash">🗑</span>` : `${rating}+`);
    const filter = {
      type: 'rating',
      value: rating,
      displayLabel: 'Rating',
      displayValue,
    };
    this._addFilter(filter);
  }

  _handleFolderSelect(folder) {
    this.valueSelectorOpen = null;
    this.searchDropboxQuery = ''; // Clear the input
    const filter = {
      type: 'folder',
      value: folder,
      displayLabel: 'Folder',
      displayValue: folder,
    };
    this._addFilter(filter);
  }

  _handleListModeChange(mode) {
    this.listFilterMode = mode === 'exclude' ? 'exclude' : 'include';
  }

  _handleListSelect(list) {
    if (!list) return;
    this.valueSelectorOpen = null;
    const mode = this.listFilterMode === 'exclude' ? 'exclude' : 'include';
    const title = list.title || `List ${list.id}`;
    const displayValue = mode === 'exclude' ? `Not in ${title}` : title;
    const filter = {
      type: 'list',
      value: list.id,
      mode,
      displayLabel: 'List',
      displayValue,
    };
    this._addFilter(filter);
  }

  _addFilter(filter) {
    const nextFilters = [...this.activeFilters];
    const existingIndex = nextFilters.findIndex((entry) => entry.type === filter.type);
    if (existingIndex >= 0) {
      nextFilters[existingIndex] = filter;
    } else {
      nextFilters.push(filter);
    }
    this.activeFilters = nextFilters;
    this.dispatchEvent(new CustomEvent('filters-changed', {
      detail: { filters: this.activeFilters },
      bubbles: true,
      composed: true,
    }));
  }

  _removeFilter(index) {
    const removed = this.activeFilters[index];
    this.activeFilters = this.activeFilters.filter((_, i) => i !== index);
    if (removed?.type === 'list') {
      this.listFilterMode = 'include';
    }
    this.dispatchEvent(new CustomEvent('filters-changed', {
      detail: { filters: this.activeFilters },
      bubbles: true,
      composed: true,
    }));
  }

  _getKeywordsByCategory() {
    // Group keywords by category with counts, returns array of [category, keywords] tuples
    if (this.keywords && this.keywords.length) {
      return getKeywordsByCategoryFromList(this.keywords);
    }
    return getKeywordsByCategory(this.tagStatsBySource, this.activeCurateTagSource);
  }

  _getCategoryCount(category) {
    // Get total positive permatag count for a category
    if (this.keywords && this.keywords.length) {
      return getCategoryCountFromList(this.keywords, category);
    }
    return getCategoryCount(this.tagStatsBySource, category, this.activeCurateTagSource);
  }

  _renderFilterMenu() {
    const available = this._getAvailableFilterTypes();
    if (!available.length) return html``;

    return html`
      <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]">
        ${available.map(filterType => html`
          <div
            class="px-4 py-2.5 cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
            @click=${() => this._handleFilterTypeSelect(filterType.type)}
          >
            <span class="mr-2">${filterType.icon}</span>
            <span>${filterType.label}</span>
          </div>
        `)}
      </div>
    `;
  }

  _renderValueSelector() {
    if (!this.valueSelectorOpen) return html``;

    switch (this.valueSelectorOpen) {
      case 'keyword':
        return this._renderKeywordSelector();
      case 'rating':
        return this._renderRatingSelector();
      case 'folder':
        return this._renderFolderSelector();
      case 'list':
        return this._renderListSelector();
      default:
        return html``;
    }
  }

  _renderKeywordSelector() {
    const categories = this._getKeywordsByCategory();
    const untaggedCount = this.imageStats?.untagged_positive_count || 0;

    return html`
      <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[520px] max-w-[640px] max-h-[400px] overflow-y-auto">
        ${untaggedCount > 0 ? html`
          <div
            class="px-4 py-2 cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-100 transition-colors"
            @click=${() => this._handleKeywordSelect('Untagged', '__untagged__')}
          >
            <strong>Untagged</strong> (${untaggedCount})
          </div>
        ` : ''}
        ${categories.map(([category, keywords]) => html`
          <div class="px-4 py-2 font-semibold text-gray-600 bg-gray-50 text-xs uppercase tracking-wide">${category}</div>
          ${keywords.map(kw => html`
            <div
              class="px-4 py-2 cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-100 transition-colors"
              @click=${() => this._handleKeywordSelect(category, kw.keyword)}
            >
              ${kw.keyword} <span class="text-gray-500 text-sm">(${kw.count || 0})</span>
            </div>
          `)}
        `)}
      </div>
    `;
  }

  _renderRatingSelector() {
    return html`
      <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[300px] max-w-[400px] max-h-[400px] overflow-y-auto">
        <div class="p-4">
          <div class="text-sm font-semibold text-gray-700 mb-3">Rating</div>
          <div class="flex flex-nowrap gap-2">
            <button
              class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              title="Rating is not set"
              @click=${() => this._handleRatingSelect('unrated')}
            >
              <span class="text-gray-400" aria-hidden="true">☆</span>
              <span class="ml-1">Unrated</span>
            </button>
            ${[0, 1, 2, 3].map(rating => {
              const label = rating === 0
                ? html`<span class="text-gray-600" aria-label="Trash">🗑</span>`
                : `${rating}+`;
              const title = rating === 0 ? 'Rating = 0' : `Rating >= ${rating}`;
              return html`
                <button
                  class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                  title=${title}
                  @click=${() => this._handleRatingSelect(rating)}
                >
                  ${rating === 0
                    ? html`<span class="ml-0">${label}</span>`
                    : html`<span class="text-yellow-500" aria-hidden="true">★</span><span class="ml-1">${label}</span>`}
                </button>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  _renderFolderSelector() {
    return html`
      <div class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-full">
        <div class="p-4">
          <div class="text-sm font-semibold text-gray-700 mb-2">Dropbox Folder</div>
          <input
            type="text"
            class="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Search folders..."
            .value=${this.searchDropboxQuery}
            @input=${(e) => {
              this.searchDropboxQuery = e.target.value;
              // Trigger folder search
              this.dispatchEvent(new CustomEvent('folder-search', {
                detail: { query: e.target.value },
                bubbles: true,
                composed: true,
              }));
            }}
          >
          ${this.dropboxFolders && this.dropboxFolders.length > 0 ? html`
            <div class="mt-2 max-h-64 overflow-y-auto border rounded-lg">
              ${this.dropboxFolders.map(folder => html`
                <div
                  class="px-4 py-2 cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-100 transition-colors"
                  @click=${() => this._handleFolderSelect(folder)}
                >
                  ${folder}
                </div>
              `)}
            </div>
          ` : this.searchDropboxQuery.trim() ? html`
            <div class="mt-2 text-xs text-gray-500 p-2">
              No folders found. Type to search...
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderListSelector() {
    const lists = Array.isArray(this.lists) ? [...this.lists] : [];
    lists.sort((a, b) => (a?.title || '').localeCompare(b?.title || ''));
    return html`
      <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[360px] max-w-[520px] max-h-[400px] overflow-hidden">
        <div class="p-4">
          <div class="text-sm font-semibold text-gray-700 mb-3">List</div>
          <div class="inline-flex items-center gap-2 mb-3">
            <button
              class=${`px-3 py-1.5 text-xs rounded-full border ${this.listFilterMode !== 'exclude' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}
              @click=${() => this._handleListModeChange('include')}
              type="button"
            >
              In list
            </button>
            <button
              class=${`px-3 py-1.5 text-xs rounded-full border ${this.listFilterMode === 'exclude' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}
              @click=${() => this._handleListModeChange('exclude')}
              type="button"
            >
              Not in list
            </button>
          </div>
          ${lists.length ? html`
            <div class="max-h-64 overflow-y-auto border rounded-lg">
              ${lists.map((list) => html`
                <div
                  class="px-4 py-2 cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-100 transition-colors flex items-center justify-between gap-2"
                  @click=${() => this._handleListSelect(list)}
                >
                  <span>${list.title || `List ${list.id}`}</span>
                  ${Number.isFinite(list.item_count) ? html`
                    <span class="text-xs text-gray-500">${list.item_count}</span>
                  ` : ''}
                </div>
              `)}
            </div>
          ` : html`
            <div class="text-xs text-gray-500 mb-2">No lists available.</div>
            <button
              class="px-3 py-1.5 text-xs border rounded-full text-gray-700 hover:bg-gray-50"
              @click=${this._requestLists}
              type="button"
            >
              Refresh lists
            </button>
          `}
        </div>
      </div>
    `;
  }

  _requestLists() {
    this.dispatchEvent(new CustomEvent('lists-requested', {
      bubbles: true,
      composed: true,
    }));
  }

  _handleClickOutside(e) {
    if (!e.composedPath().includes(this)) {
      this.filterMenuOpen = false;
      this.valueSelectorOpen = null;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._handleClickOutside.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleClickOutside.bind(this));
  }

  render() {
    const sortControls = typeof this.renderSortControls === 'function'
      ? this.renderSortControls()
      : (this.renderSortControls || html``);
    const hasSortControls = !!this.renderSortControls;

    return html`
      <div class="bg-white rounded-lg shadow p-4">
        <!-- FILTERS Section -->
        <div class="mb-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-gray-700">Filters:</span>
            <!-- Active filter chips -->
            ${this.activeFilters.map((filter, index) => html`
              <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm cursor-pointer hover:bg-blue-100"
                   @click=${() => this._handleEditFilter(filter.type, index)}>
                <span class="font-medium text-blue-900">${filter.displayLabel}:</span>
                <span class="text-blue-700">${filter.displayValue}</span>
                <button
                  @click=${(e) => { e.stopPropagation(); this._removeFilter(index); }}
                  class="ml-1 text-blue-600 hover:text-blue-800"
                  aria-label="Remove filter"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            `)}

            <!-- Add filter button -->
            <div class="relative flex-1 min-w-[220px]">
              <button
                @click=${this._handleAddFilterClick}
                class="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-full text-sm text-gray-700 hover:bg-gray-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                <span>Add filter</span>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              ${this.filterMenuOpen ? this._renderFilterMenu() : ''}
              ${this._renderValueSelector()}
            </div>
            ${this.renderFiltersActions ? html`
              <div class="ml-auto flex items-center">
                ${this.renderFiltersActions()}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- SORT & DISPLAY Section -->
        ${hasSortControls ? html`
          <div class="border-t pt-4">
            <div class="flex flex-wrap items-center gap-4">
              ${sortControls}
            </div>
          </div>
        ` : html``}
      </div>
    `;
  }
}

customElements.define('filter-chips', FilterChips);
