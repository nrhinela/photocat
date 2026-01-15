import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';
import {
  getKeywordCategories,
  createKeywordCategory,
  updateKeywordCategory,
  deleteKeywordCategory,
  getKeywordsInCategory,
  createKeyword,
  updateKeyword,
  deleteKeyword,
} from '../services/api.js';

class TaggingAdmin extends LitElement {
  static styles = [tailwind, css`
    :host {
      display: block;
    }
    .modal-backdrop {
      background: rgba(15, 23, 42, 0.45);
    }
  `];

  static properties = {
    tenant: { type: String },
    categories: { type: Array },
    keywordsByCategory: { type: Object },
    expandedCategories: { type: Object },
    isLoading: { type: Boolean },
    dialog: { type: Object },
    error: { type: String },
  };

  constructor() {
    super();
    this.tenant = '';
    this.categories = [];
    this.keywordsByCategory = {};
    this.expandedCategories = new Set();
    this.isLoading = false;
    this.dialog = null;
    this.error = '';
  }

  updated(changedProperties) {
    if (changedProperties.has('tenant')) {
      this.loadCategories();
    }
  }

  async loadCategories(options = {}) {
    if (!this.tenant) return;
    this.isLoading = true;
    this.error = '';
    try {
      const categories = await getKeywordCategories(this.tenant);
      this.categories = categories || [];
      if (!options.preserveExpanded) {
        this.keywordsByCategory = {};
        this.expandedCategories = new Set();
      }
    } catch (error) {
      console.error('Failed to load keyword categories:', error);
      this.error = 'Failed to load categories.';
    } finally {
      this.isLoading = false;
    }
  }

  async toggleCategory(categoryId) {
    if (this.expandedCategories.has(categoryId)) {
      this.expandedCategories.delete(categoryId);
      this.expandedCategories = new Set(this.expandedCategories);
      return;
    }
    try {
      const keywords = await getKeywordsInCategory(this.tenant, categoryId);
      this.keywordsByCategory = {
        ...this.keywordsByCategory,
        [categoryId]: keywords || [],
      };
      this.expandedCategories.add(categoryId);
      this.expandedCategories = new Set(this.expandedCategories);
    } catch (error) {
      console.error('Failed to load keywords:', error);
      this.error = 'Failed to load keywords.';
    }
  }

  openCategoryDialog(mode, category = null) {
    this.dialog = {
      type: 'category',
      mode,
      categoryId: category?.id || null,
      name: category?.name || '',
    };
  }

  openKeywordDialog(mode, category, keyword = null) {
    this.dialog = {
      type: 'keyword',
      mode,
      categoryId: category.id,
      categoryName: category.name,
      keywordId: keyword?.id || null,
      keyword: keyword?.keyword || '',
      prompt: keyword?.prompt || '',
    };
  }

  openConfirmDialog(action, payload) {
    this.dialog = {
      type: 'confirm',
      action,
      payload,
    };
  }

  closeDialog() {
    this.dialog = null;
  }

  async handleCategorySubmit(e) {
    e.preventDefault();
    const payload = {
      name: this.dialog?.name?.trim(),
    };
    if (!payload.name) return;
    try {
      if (this.dialog.mode === 'create') {
        await createKeywordCategory(this.tenant, payload);
      } else if (this.dialog.mode === 'edit') {
        await updateKeywordCategory(this.tenant, this.dialog.categoryId, payload);
      }
      await this.loadCategories({ preserveExpanded: this.dialog.mode === 'edit' });
      if (this.dialog.mode === 'create') {
        this.closeDialog();
      }
    } catch (error) {
      console.error('Failed to save category:', error);
      this.error = 'Failed to save category.';
    }
  }

  async handleKeywordSubmit(e) {
    e.preventDefault();
    const payload = {
      keyword: this.dialog?.keyword?.trim(),
      prompt: this.dialog?.prompt?.trim() || '',
    };
    if (!payload.keyword) return;
    try {
      if (this.dialog.mode === 'create') {
        await createKeyword(this.tenant, this.dialog.categoryId, payload);
      } else if (this.dialog.mode === 'edit') {
        await updateKeyword(this.tenant, this.dialog.keywordId, payload);
      }
      const keywords = await getKeywordsInCategory(this.tenant, this.dialog.categoryId);
      this.keywordsByCategory = {
        ...this.keywordsByCategory,
        [this.dialog.categoryId]: keywords || [],
      };
      await this.loadCategories({ preserveExpanded: this.dialog.mode === 'edit' });
      if (this.dialog.mode === 'create') {
        this.closeDialog();
      }
    } catch (error) {
      console.error('Failed to save keyword:', error);
      this.error = 'Failed to save keyword.';
    }
  }

  async handleConfirm() {
    if (!this.dialog) return;
    const { action, payload } = this.dialog;
    try {
      if (action === 'delete-category') {
        await deleteKeywordCategory(this.tenant, payload.categoryId);
        await this.loadCategories();
      }
      if (action === 'delete-keyword') {
        await deleteKeyword(this.tenant, payload.keywordId);
        const keywords = await getKeywordsInCategory(this.tenant, payload.categoryId);
        this.keywordsByCategory = {
          ...this.keywordsByCategory,
          [payload.categoryId]: keywords || [],
        };
        await this.loadCategories();
      }
      this.closeDialog();
    } catch (error) {
      console.error('Failed to delete item:', error);
      this.error = 'Failed to delete item.';
    }
  }

  renderDialog() {
    if (!this.dialog) return null;

    if (this.dialog.type === 'confirm') {
      const message = this.dialog.action === 'delete-category'
        ? 'Delete this category and all keywords?'
        : 'Delete this keyword?';
      return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Confirm Delete</h3>
            <p class="text-sm text-gray-600 mb-6">${message}</p>
            <div class="flex justify-end gap-3">
              <button class="px-4 py-2 border rounded-lg" @click=${this.closeDialog}>Cancel</button>
              <button class="px-4 py-2 bg-red-600 text-white rounded-lg" @click=${this.handleConfirm}>Delete</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this.dialog.type === 'category') {
      return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">
              ${this.dialog.mode === 'create' ? 'New Category' : 'Edit Category'}
            </h3>
            <form @submit=${this.handleCategorySubmit}>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Category Name</label>
              <input
                class="w-full border rounded-lg px-3 py-2 mb-6"
                .value=${this.dialog.name}
                @input=${(e) => { this.dialog = { ...this.dialog, name: e.target.value }; }}
                placeholder="e.g. Circus Skills"
                required
              />
              <div class="flex justify-between items-center gap-3">
                ${this.dialog.mode === 'edit' ? html`
                  <button
                    type="button"
                    class="px-4 py-2 bg-red-600 text-white rounded-lg"
                    @click=${() => this.openConfirmDialog('delete-category', { categoryId: this.dialog.categoryId })}
                  >
                    Delete
                  </button>
                ` : html`<span></span>`}
                <div class="flex gap-3">
                  <button type="button" class="px-4 py-2 border rounded-lg" @click=${this.closeDialog}>Cancel</button>
                  <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Save</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (this.dialog.type === 'keyword') {
      return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">
              ${this.dialog.mode === 'create' ? 'Add Keyword' : 'Edit Keyword'}
            </h3>
            <p class="text-sm text-gray-500 mb-4">Category: ${this.dialog.categoryName}</p>
            <form @submit=${this.handleKeywordSubmit}>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Keyword</label>
              <input
                class="w-full border rounded-lg px-3 py-2 mb-4"
                .value=${this.dialog.keyword}
                @input=${(e) => { this.dialog = { ...this.dialog, keyword: e.target.value }; }}
                placeholder="e.g. aerial-silks"
                required
              />
              <label class="block text-sm font-semibold text-gray-700 mb-2">Prompt</label>
              <textarea
                class="w-full border rounded-lg px-3 py-2 mb-6"
                rows="3"
                .value=${this.dialog.prompt}
                @input=${(e) => { this.dialog = { ...this.dialog, prompt: e.target.value }; }}
                placeholder="Optional prompt for ML tagging"
              ></textarea>
              <div class="flex justify-between items-center gap-3">
                ${this.dialog.mode === 'edit' ? html`
                  <button
                    type="button"
                    class="px-4 py-2 bg-red-600 text-white rounded-lg"
                    @click=${() => this.openConfirmDialog('delete-keyword', { categoryId: this.dialog.categoryId, keywordId: this.dialog.keywordId })}
                  >
                    Delete
                  </button>
                ` : html`<span></span>`}
                <div class="flex gap-3">
                  ${this.dialog.mode === 'edit' ? html`
                    <button type="button" class="px-4 py-2 border rounded-lg" @click=${this.closeDialog}>Close</button>
                    <button type="button" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg" @click=${this._openUploadModal}>
                      Test
                    </button>
                  ` : html`
                    <button type="button" class="px-4 py-2 border rounded-lg" @click=${this.closeDialog}>Cancel</button>
                  `}
                  <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Save</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    return null;
  }

  renderCategory(category) {
    const isExpanded = this.expandedCategories.has(category.id);
    const keywords = [...(this.keywordsByCategory[category.id] || [])].sort((a, b) =>
      a.keyword.localeCompare(b.keyword)
    );
    return html`
      <div class="border border-gray-200 rounded-lg bg-white">
        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-2">
            <button class="flex items-center gap-2 text-left" @click=${() => this.toggleCategory(category.id)}>
              <span class="text-sm font-semibold text-gray-700">${isExpanded ? '▾' : '▸'}</span>
              <span class="font-semibold text-gray-800">${category.name}</span>
              <span class="text-xs text-gray-500">- (${category.keyword_count} keywords) -</span>
            </button>
            <button
              class="text-xs text-blue-600 hover:text-blue-700"
              @click=${() => this.openCategoryDialog('edit', category)}
            >
              [edit]
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button class="text-xs text-gray-600 hover:text-gray-800" @click=${() => this.toggleCategory(category.id)}>
              ${isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        ${isExpanded ? html`
          <div class="border-t border-gray-200 px-4 py-3">
            <div class="mb-3">
              <button class="text-xs text-blue-600 hover:text-blue-700" @click=${() => this.openKeywordDialog('create', category)}>
                + Add keyword
              </button>
            </div>
            ${keywords.length ? html`
              <div class="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-500 mb-2">
                <div>Keyword</div>
                <div>Prompt</div>
                <div class="text-right">Actions</div>
              </div>
              <div class="divide-y divide-gray-100">
                ${keywords.map((kw) => html`
                  <div class="grid grid-cols-3 gap-2 text-sm text-gray-700 items-start py-2">
                    <div class="font-medium">${kw.keyword}</div>
                    <div class="text-gray-500">${kw.prompt || '—'}</div>
                    <div class="flex items-center justify-end gap-2">
                      <button class="text-xs text-blue-600" @click=${() => this.openKeywordDialog('edit', category, kw)}>Edit</button>
                    </div>
                  </div>
                `)}
              </div>
            ` : html`<div class="text-sm text-gray-500">No keywords yet.</div>`}
          </div>
        ` : ''}
      </div>
    `;
  }

  render() {
    return html`
      <div class="max-w-6xl mx-auto">
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-xl font-semibold text-gray-800">Keywords Configuration</h2>
              <p class="text-sm text-gray-500">Define categories and keywords for image tagging.</p>
            </div>
            <div class="flex items-center gap-3">
              <button class="px-4 py-2 bg-blue-600 text-white rounded-lg" @click=${this._openUploadModal}>
                <i class="fas fa-flask mr-2"></i>Test
              </button>
            </div>
          </div>
          <div class="bg-blue-50 border border-blue-100 text-blue-700 text-sm rounded-lg p-3 mb-6">
            How scoring works: Keywords within the same category are scored relative to each other. Improving one keyword prompt may affect scores for others in that category.
          </div>

          ${this.error ? html`<div class="text-sm text-red-600 mb-4">${this.error}</div>` : ''}
          ${this.isLoading ? html`<div class="text-sm text-gray-500">Loading categories…</div>` : ''}
          <div class="mb-3">
            <button class="text-sm text-blue-600 hover:text-blue-700" @click=${() => this.openCategoryDialog('create')}>
              + New category
            </button>
          </div>
          <div class="space-y-4">
            ${this.categories.map((category) => this.renderCategory(category))}
          </div>
        </div>
      </div>
      ${this.renderDialog()}
    `;
  }

  _openUploadModal() {
    this.dispatchEvent(new CustomEvent('open-upload-modal', { bubbles: true, composed: true }));
  }
}

customElements.define('tagging-admin', TaggingAdmin);
