import { LitElement, html, css } from 'lit';
import { tailwind } from '../../tailwind-lit.js';
import {
  getKeywordsByCategory,
  getCategoryCount,
  getKeywordsByCategoryFromList,
  getCategoryCountFromList,
} from '../keyword-utils.js';

class KeywordDropdown extends LitElement {
  static styles = [
    tailwind,
    css`
      :host {
        display: block;
      }
    `,
  ];

  static properties = {
    value: { type: String },
    placeholder: { type: String },
    tagStatsBySource: { type: Object },
    activeCurateTagSource: { type: String },
    keywords: { type: Array },
    imageStats: { type: Object },
    includeUntagged: { type: Boolean },
    disabled: { type: Boolean },
    compact: { type: Boolean },
    open: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.value = '';
    this.placeholder = 'Select a keyword...';
    this.tagStatsBySource = {};
    this.activeCurateTagSource = 'permatags';
    this.keywords = [];
    this.imageStats = {};
    this.includeUntagged = true;
    this.disabled = false;
    this.compact = false;
    this.open = false;
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('pointerdown', this._handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._handleOutsideClick);
  }

  _handleOutsideClick(event) {
    if (!this.open) return;
    const path = event.composedPath ? event.composedPath() : [];
    if (!path.includes(this)) {
      this.open = false;
    }
  }

  _toggleOpen(event) {
    event?.stopPropagation?.();
    if (this.disabled) return;
    this.open = !this.open;
  }

  _selectValue(value) {
    this.value = value;
    this.open = false;
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    this.dispatchEvent(new CustomEvent('keyword-selected', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
  }

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

  _getSelectedLabel() {
    if (!this.value) {
      return this.placeholder;
    }
    if (this.value === '__untagged__') {
      const count = this.imageStats?.untagged_positive_count || 0;
      return `Untagged (${count})`;
    }
    const [rawCategory, rawKeyword] = this.value.split('::');
    if (!rawKeyword) {
      return this.placeholder;
    }
    const category = decodeURIComponent(rawCategory || '');
    const keyword = decodeURIComponent(rawKeyword || '');
    let count = 0;
    if (this.keywords && this.keywords.length) {
      const match = this.keywords.find((kw) => {
        const kwCategory = kw.category || 'Uncategorized';
        return kwCategory === category && kw.keyword === keyword;
      });
      count = match?.count || 0;
    } else {
      const categoryStats = this.tagStatsBySource?.[this.activeCurateTagSource] || this.tagStatsBySource?.permatags || {};
      const keywordStats = (categoryStats[category] || []).find((kw) => kw.keyword === keyword);
      count = keywordStats?.count || 0;
    }
    return count ? `${keyword} (${count})` : keyword;
  }

  _renderMenu() {
    if (!this.open) return html``;
    const categories = this._getKeywordsByCategory();
    const untaggedCount = this.imageStats?.untagged_positive_count || 0;

    return html`
      <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[300px] max-w-[400px] max-h-[400px] overflow-y-auto">
        ${this.includeUntagged ? html`
          <div
            class="px-4 py-2 cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-100 transition-colors"
            @click=${() => this._selectValue('__untagged__')}
          >
            <strong>Untagged</strong> (${untaggedCount})
          </div>
        ` : ''}
        ${categories.map(([category, keywords]) => html`
          <div class="px-4 py-2 font-semibold text-gray-600 bg-gray-50 text-xs uppercase tracking-wide">
            ${category}
          </div>
          ${keywords.map((kw) => html`
            <div
              class="px-4 py-2 cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-gray-100 transition-colors"
              @click=${() => this._selectValue(`${encodeURIComponent(category)}::${encodeURIComponent(kw.keyword)}`)}
            >
              ${kw.keyword} <span class="text-gray-500 text-sm">(${kw.count || 0})</span>
            </div>
          `)}
        `)}
      </div>
    `;
  }

  render() {
    const hasValue = Boolean(this.value);
    const label = this._getSelectedLabel();
    const paddingClass = this.compact ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-lg';

    return html`
      <div class="relative">
        <button
          type="button"
          class="w-full ${paddingClass} border rounded-lg text-left flex items-center justify-between gap-2 ${hasValue ? 'bg-yellow-100 border-yellow-200' : 'bg-white'}"
          @click=${this._toggleOpen}
          ?disabled=${this.disabled}
        >
          <span class="truncate">${label}</span>
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        ${this._renderMenu()}
      </div>
    `;
  }
}

customElements.define('keyword-dropdown', KeywordDropdown);
