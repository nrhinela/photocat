import { LitElement, html, css } from 'lit';
import './app-header.js';
import './image-gallery.js';
import './filter-controls.js';
import './image-modal.js';
import './upload-modal.js';
import './tab-container.js'; // Import the new tab container
import './list-editor.js'; // Import the new list editor
import './permatag-editor.js';

import { tailwind } from './tailwind-lit.js';
import { getLists, getActiveList, getListItems, updateList, getKeywords } from '../services/api.js';

class PhotoCatApp extends LitElement {
  static styles = [tailwind, css`
    :host {
      display: block;
    }
    .container {
        max-width: 1280px;
        margin: 0 auto;
        padding: 16px;
    }
  `];

  static properties = {
      filters: { type: Object },
      tenant: { type: String },
      selectedImage: { type: Object },
      showUploadModal: { type: Boolean },
      activeTab: { type: String }, // New property for active tab
      lists: { type: Array },
      activeListId: { type: String },
      activeListName: { type: String },
      activeListItemIds: { type: Object },
      keywords: { type: Array },
  }

  constructor() {
      super();
      this.filters = {};
      this.tenant = 'bcg'; // Default tenant
      this.selectedImage = null;
      this.showUploadModal = false;
      this.activeTab = 'search'; // Default to search tab
      this.lists = [];
      this.activeListId = '';
      this.activeListName = '';
      this.activeListItemIds = new Set();
      this.keywords = [];
  }

  connectedCallback() {
      super.connectedCallback();
      this.fetchLists();
      this.fetchKeywords();
  }

  _handleFilterChange(e) {
      this.filters = e.detail;
  }

  _handleTenantChange(e) {
      this.tenant = e.detail;
      this.fetchLists();
      this.fetchKeywords();
  }

  _handleImageSelected(e) {
      console.log('Image selected:', e.detail);
      this.selectedImage = e.detail;
  }

  _handleCloseModal() {
      this.selectedImage = null;
  }

  _handleOpenUploadModal() {
      this.showUploadModal = true;
  }

    _handleCloseUploadModal() {
        this.showUploadModal = false;
    }
    
    _handleUploadComplete() {
        this.shadowRoot.querySelector('tab-container').querySelector('image-gallery').fetchImages();
        this.showUploadModal = false;
    }

  render() {
    return html`
        <app-header 
            .tenant=${this.tenant} 
            @tenant-change=${this._handleTenantChange}
            @open-upload-modal=${this._handleOpenUploadModal}
            .activeTab=${this.activeTab}
            @tab-change=${(e) => this.activeTab = e.detail}
        ></app-header>
        
        <tab-container .activeTab=${this.activeTab}>
            <div slot="search" class="container">
                <filter-controls .tenant=${this.tenant} .lists=${this.lists} @filter-change=${this._handleFilterChange}></filter-controls>
                <div class="flex items-center gap-3 mb-4">
                    <div class="text-sm text-gray-700 font-semibold">
                        Active List: ${this.activeListName || 'None'}
                    </div>
                    <div class="ml-4">
                        <select class="px-3 py-2 border rounded-lg" .value=${this.activeListId} @change=${this._handleActiveListChange}>
                        <option value="">None</option>
                        ${this.lists.map((list) => html`
                            <option value=${String(list.id)}>${list.title}</option>
                        `)}
                        </select>
                    </div>
                </div>
                <image-gallery
                    .tenant=${this.tenant}
                    .filters=${this.filters}
                    .activeListName=${this.activeListName}
                    .activeListItemIds=${this.activeListItemIds}
                    .keywords=${this.keywords}
                    @image-selected=${this._handleImageSelected}
                    @list-item-added=${this._handleListItemAdded}
                    @image-retagged=${this._handleImageRetagged}
                ></image-gallery>
            </div>
            <div slot="lists" class="container p-4">
                <list-editor .tenant=${this.tenant} @lists-updated=${this._handleListsUpdated}></list-editor>
            </div>
        </tab-container>

        ${this.selectedImage ? html`
          <image-modal
            .image=${this.selectedImage}
            .tenant=${this.tenant}
            .active=${true}
            @close=${this._handleCloseModal}
            @image-retagged=${this._handleImageRetagged}
          ></image-modal>
        ` : ''}
        ${this.showUploadModal ? html`<upload-modal .tenant=${this.tenant} @close=${this._handleCloseUploadModal} @upload-complete=${this._handleUploadComplete} active></upload-modal>` : ''}
    `;
  }

  async fetchLists() {
      if (!this.tenant) return;
      try {
          const results = await Promise.allSettled([
              getLists(this.tenant),
              getActiveList(this.tenant),
          ]);
          const listsResult = results[0];
          const activeResult = results[1];
          if (listsResult.status === 'fulfilled') {
              this.lists = listsResult.value;
          } else {
              console.error('Error fetching lists:', listsResult.reason);
              this.lists = [];
          }
          if (activeResult.status === 'fulfilled') {
              this.activeListId = activeResult.value?.id ? String(activeResult.value.id) : '';
          } else {
              console.error('Error fetching active list:', activeResult.reason);
              this.activeListId = '';
          }
          if (!this.activeListId && this.lists.length > 0) {
              const activeList = this.lists.find((list) => list.is_active);
              this.activeListId = activeList ? String(activeList.id) : '';
          }
          const activeList = this.lists.find((list) => String(list.id) === this.activeListId);
          this.activeListName = activeList ? activeList.title : '';
          await this.fetchActiveListItems();
      } catch (error) {
          console.error('Error fetching lists:', error);
      }
  }

  async fetchKeywords() {
      if (!this.tenant) return;
      try {
          const keywordsByCategory = await getKeywords(this.tenant);
          const flat = [];
          Object.values(keywordsByCategory || {}).forEach((list) => {
              list.forEach((kw) => {
                  flat.push({ keyword: kw.keyword, category: kw.category });
              });
          });
          this.keywords = flat.sort((a, b) => a.keyword.localeCompare(b.keyword));
      } catch (error) {
          console.error('Error fetching keywords:', error);
          this.keywords = [];
      }
  }

  async fetchActiveListItems() {
      if (!this.activeListId) {
          this.activeListItemIds = new Set();
          return;
      }
      try {
          const items = await getListItems(this.tenant, this.activeListId);
          this.activeListItemIds = new Set(items.map((item) => item.photo_id));
      } catch (error) {
          console.error('Error fetching active list items:', error);
          this.activeListItemIds = new Set();
      }
  }

  async _handleActiveListChange(e) {
      const selectedId = e.target.value;
      const previousActiveId = this.activeListId;
      this.activeListId = selectedId;
      const selectedList = this.lists.find((list) => String(list.id) === selectedId);
      this.activeListName = selectedList ? selectedList.title : '';
      this.activeListItemIds = new Set();
      try {
          if (!selectedId && previousActiveId) {
              await updateList(this.tenant, { id: previousActiveId, is_active: false });
          } else if (selectedId) {
              await updateList(this.tenant, { id: selectedId, is_active: true });
          }
          await this.fetchLists();
      } catch (error) {
          console.error('Error updating active list:', error);
      }
  }

  async _handleListItemAdded() {
      await this.fetchActiveListItems();
  }

  async _handleListsUpdated() {
      await this.fetchLists();
  }

  async _handleImageRetagged() {
      const gallery = this.shadowRoot.querySelector('image-gallery');
      if (gallery && typeof gallery.fetchImages === 'function') {
          await gallery.fetchImages();
      }
  }
}

customElements.define('photocat-app', PhotoCatApp);
