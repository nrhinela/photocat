import { LitElement, html, css } from 'lit';
import { setRating, addToList, retagImage, addPermatag, getPermatags, deletePermatag } from '../services/api.js';
import { tailwind } from './tailwind-lit.js';

class ImageCard extends LitElement {
  static styles = [tailwind, css`
    .image-card {
      transition: transform 0.2s;
    }
    .image-card:hover {
      transform: scale(1.02);
    }
    .image-card .fa-star {
      color: #fbbf24; /* text-yellow-400 */
    }
    .image-link {
      cursor: pointer;
    }
  `];

  static properties = {
    image: { type: Object },
    tenant: { type: String },
    showAddToList: { type: Boolean },
    activeListName: { type: String },
    isInActiveList: { type: Boolean },
    isRetagging: { type: Boolean },
    keywords: { type: Array },
  };

  constructor() {
    super();
    this.image = {};
    this.showAddToList = true;
    this.activeListName = '';
    this.isInActiveList = false;
    this.isRetagging = false;
    this.keywords = [];
  }

  async _handleRetag(e) {
    e.stopPropagation();
    try {
        this.isRetagging = true;
        await retagImage(this.tenant, this.image.id);
        this.dispatchEvent(new CustomEvent('image-retagged', {
          detail: { imageId: this.image.id },
          bubbles: true,
          composed: true,
        }));
    } catch (error) {
        console.error('Failed to retag image:', error);
    } finally {
        this.isRetagging = false;
    }
  }

  async _handleAddToList(e) {
    e.stopPropagation();
    try {
        const result = await addToList(this.tenant, this.image.id);
        this.dispatchEvent(new CustomEvent('list-item-added', {
          detail: { photoId: this.image.id, listId: result?.list_id },
          bubbles: true,
          composed: true,
        }));
    } catch (error) {
        console.error('Failed to add to list:', error);
    }
  }

  async _handleRemoveTag(e, tag) {
    e.stopPropagation();
    try {
      await addPermatag(this.tenant, this.image.id, tag.keyword, tag.category, -1);
      window.dispatchEvent(new CustomEvent('permatags-changed', {
        detail: { imageId: this.image.id }
      }));
      this.dispatchEvent(new CustomEvent('image-retagged', {
        detail: { imageId: this.image.id },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  }

  async _handleAddTag(e) {
    e.stopPropagation();
    const input = this.shadowRoot.getElementById(`add-tag-${this.image.id}`);
    const value = input ? input.value.trim() : '';
    if (!value) return;
    const keywordEntry = this.keywords.find((kw) => kw.keyword === value);
    if (!keywordEntry) {
      return;
    }
    try {
      const permatags = await getPermatags(this.tenant, this.image.id);
      const existingNegative = (permatags.permatags || []).find(
        (ptag) => ptag.keyword === value && ptag.signum === -1
      );
      if (existingNegative) {
        await deletePermatag(this.tenant, this.image.id, existingNegative.id);
      }
      await addPermatag(this.tenant, this.image.id, value, keywordEntry.category, 1);
      if (input) input.value = '';
      window.dispatchEvent(new CustomEvent('permatags-changed', {
        detail: { imageId: this.image.id }
      }));
      this.dispatchEvent(new CustomEvent('image-retagged', {
        detail: { imageId: this.image.id },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error('Failed to add tag:', error);
    }
  }

  async _handleRating(e, rating) {
    e.stopPropagation();
    try {
        const updatedImage = await setRating(this.tenant, this.image.id, rating);
        this.image = { ...this.image, rating: updatedImage.rating };
    } catch (error) {
        console.error('Failed to set rating:', error);
    }
  }
  
  _handleCardClick() {
      this.dispatchEvent(new CustomEvent('image-selected', { detail: this.image, bubbles: true, composed: true }));
  }

  _renderTagText(tags) {
    if (!tags || tags.length === 0) {
      return html`<span class="text-xs text-gray-500">No tags yet.</span>`;
    }
    const sortedTags = [...tags].sort((a, b) => a.keyword.localeCompare(b.keyword));
    return html`
      <div class="flex flex-wrap items-center gap-1">
        ${sortedTags.map(tag => html`
          <span class="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">
            ${tag.keyword}
            <button
              type="button"
              class="text-gray-500 hover:text-red-600"
              title="Remove tag"
              @click=${(e) => this._handleRemoveTag(e, tag)}
            >
              ×
            </button>
          </span>
        `)}
      </div>
    `;
  }

  _formatDropboxPath(path) {
    if (!path) return '';
    return path.replace(/_/g, '_\u200b');
  }

  render() {
    if (!this.image.id) {
      return html`<div>Loading...</div>`;
    }

    const tagsText = this._renderTagText(this.image.calculated_tags);
    const dropboxPath = this.image.dropbox_path || '';
    const dropboxHref = dropboxPath
      ? `https://www.dropbox.com/home${encodeURIComponent(dropboxPath)}`
      : '';
    const formattedPath = this._formatDropboxPath(dropboxPath);
    const listName = this.activeListName || 'None';
    const canAddToList = !!this.activeListName && this.showAddToList;
    const addLabel = this.isInActiveList ? 'Added' : 'Add';

    return html`
      <div class="image-card bg-white rounded-lg shadow overflow-hidden">
        <div class="aspect-square bg-gray-200 relative image-link" @click=${this._handleCardClick}>
          <img
            src="${this.image.thumbnail_url || `/api/v1/images/${this.image.id}/thumbnail`}"
            alt="${this.image.filename}"
            class="w-full h-full object-cover"
            loading="lazy"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 400%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22400%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E';"
          />
          ${this.image.tags_applied ? html`<div class="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs"><i class="fas fa-tag"></i></div>` : ''}
        </div>
        <div class="p-3 text-xs text-gray-600 space-y-1">
          <div>
            <span class="font-semibold text-gray-700">file:</span>
            ${dropboxHref ? html`
              <a
                href=${dropboxHref}
                target="dropbox"
                class="ml-1 text-blue-600 hover:text-blue-700 break-all whitespace-normal"
                @click=${(e) => e.stopPropagation()}
                title=${dropboxPath}
              >
                ${formattedPath}
              </a>
            ` : html`<span class="ml-1 text-gray-400">Unknown</span>`}
          </div>
          <div>
            <span class="font-semibold text-gray-700">size:</span>
            <span class="ml-1">${this.image.width} × ${this.image.height}</span>
          </div>
          <div>
            <span class="font-semibold text-gray-700">uploaded:</span>
            <span class="ml-1">${this.image.modified_time ? new Date(this.image.modified_time).toLocaleDateString() : 'Unknown'}</span>
          </div>
          <div>
            <span class="font-semibold text-gray-700">list [${listName}]:</span>
            ${this.showAddToList ? html`
              <button
                type="button"
                class="ml-1 ${this.isInActiveList ? 'text-gray-500' : 'text-green-700 hover:text-green-800'}"
                @click=${this._handleAddToList}
                ?disabled=${!canAddToList || this.isInActiveList}
              >
                ${addLabel}
              </button>
            ` : html`<span class="ml-1 text-gray-400">Unavailable</span>`}
          </div>
          <div class="flex items-center">
            <span class="font-semibold text-gray-700 mr-1">rating:</span>
            <span class="star-rating" data-image-id="${this.image.id}">
              <button
                type="button"
                class="cursor-pointer mx-0.5 ${this.image.rating == 0 ? 'text-gray-700' : 'text-gray-600 hover:text-gray-800'}"
                title="0 stars"
                @click=${(e) => this._handleRating(e, 0)}
              >
                ${this.image.rating == 0 ? '❌' : '🗑'}
              </button>
              ${[1, 2, 3].map((star) => html`
                <button
                  type="button"
                  class="cursor-pointer mx-0.5 text-yellow-500 hover:text-yellow-600"
                  title="${star} star${star > 1 ? 's' : ''}"
                  @click=${(e) => this._handleRating(e, star)}
                >
                  ${this.image.rating && this.image.rating >= star ? '★' : '☆'}
                </button>
              `)}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-gray-700">tags:</span>
            <button
              type="button"
              class="text-purple-600 hover:text-purple-700 text-xs"
              @click=${this._handleRetag}
            >
              [${this.isRetagging ? 'processing' : 'retag'}]
            </button>
            ${tagsText}
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold text-gray-700" for="add-tag-${this.image.id}">Add tag:</label>
            <input
              id="add-tag-${this.image.id}"
              list="keyword-list"
              class="flex-1 min-w-[120px] border rounded px-2 py-1 text-xs"
              type="text"
              placeholder="Start typing..."
              @click=${(e) => e.stopPropagation()}
            >
            <button
              type="button"
              class="text-xs text-blue-600 hover:text-blue-700"
              @click=${this._handleAddTag}
            >
              Add
            </button>
          </div>
        </div>
      </div>
      <datalist id="keyword-list">
        ${this.keywords.map((kw) => html`<option value=${kw.keyword}></option>`)}
      </datalist>
    `;
  }

}

customElements.define('image-card', ImageCard);
