import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';
import { getLists, createList, updateList, deleteList, getListItems, deleteListItem } from '../services/api.js';
import './list-edit-modal.js';
import './image-card.js';

class ListEditor extends LitElement {
  static styles = [tailwind, css`
    :host {
      display: block;
    }
    .left-justified-header {
      text-align: left;
    }
  `];

  static properties = {
    tenant: { type: String },
    lists: { type: Array },
    editingList: { type: Object },
    selectedList: { type: Object },
    listItems: { type: Array },
  };

  constructor() {
    super();
    this.lists = [];
    this.editingList = null;
    this.selectedList = null;
    this.listItems = [];
    this._isVisible = false;
    this._hasRefreshedOnce = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.fetchLists();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('tenant')) {
      this.fetchLists();
      this.selectedList = null;
      this.listItems = [];
    }
  }

  // Refresh data when component becomes visible (tab is clicked)
  _checkVisibility() {
    const isNowVisible = this.offsetParent !== null;

    // If component just became visible and we haven't refreshed yet, refresh the data
    if (isNowVisible && !this._isVisible && !this._hasRefreshedOnce) {
      this._isVisible = true;
      this._hasRefreshedOnce = true;

      if (this._refreshTimer) {
        clearTimeout(this._refreshTimer);
      }
      this._refreshTimer = setTimeout(() => {
        this.fetchLists();
        if (this.selectedList) {
          this._fetchListItems(this.selectedList.id);
        }
      }, 100);
    }

    this._isVisible = isNowVisible;
  }

  async fetchLists() {
    if (!this.tenant) {
      console.warn('fetchLists: Tenant ID is not available.');
      return;
    }
    console.log('fetchLists: Fetching lists for tenant:', this.tenant);
    try {
      const fetchedLists = await getLists(this.tenant);
      console.log('fetchLists: Fetched lists:', fetchedLists);
      this.lists = fetchedLists;
      this.dispatchEvent(new CustomEvent('lists-updated', { bubbles: true, composed: true }));
    } catch (error) {
      console.error('Error fetching lists:', error);
    }
  }

  _createList() {
    console.log('Add New List button clicked!');
    this.editingList = { title: '', notebox: '' };
  }

  _editList(list) {
    this.editingList = list;
  }

  _closeModal() {
    this.editingList = null;
  }

  async _handleSaveList(e) {
    try {
      let savedList;
      if (e.detail.id) {
        savedList = await updateList(this.tenant, e.detail);
      } else {
        savedList = await createList(this.tenant, e.detail);
      }
      await this.fetchLists();
      if (this.selectedList) {
        const refreshed = this.lists.find(list => list.id === this.selectedList.id);
        this.selectedList = refreshed || null;
      }
      this.requestUpdate();
      this.editingList = null;
      this.dispatchEvent(new CustomEvent('lists-updated', { bubbles: true, composed: true }));
    } catch (error) {
      console.error('Error updating list:', error);
    }
  }

  async _selectList(list) {
    this.selectedList = list;
    await this._fetchListItems(list.id);
  }

  async _fetchListItems(listId) {
    try {
      this.listItems = await getListItems(this.tenant, listId);
    } catch (error) {
      console.error('Error fetching list items:', error);
      this.listItems = [];
    }
  }

  async _removeListItem(itemId) {
    try {
      await deleteListItem(this.tenant, itemId);
      if (this.selectedList) {
        await this._fetchListItems(this.selectedList.id);
      }
      await this.fetchLists();
    } catch (error) {
      console.error('Error deleting list item:', error);
    }
  }

  async _deleteList(list) {
    const confirmed = window.confirm(`Delete list "${list.title}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteList(this.tenant, list.id);
      this.lists = this.lists.filter((entry) => entry.id !== list.id);
      if (this.selectedList && this.selectedList.id === list.id) {
        this.selectedList = null;
        this.listItems = [];
      }
      this.requestUpdate();
      this.dispatchEvent(new CustomEvent('lists-updated', { bubbles: true, composed: true }));
    } catch (error) {
      console.error('Error deleting list:', error);
    }
  }

  render() {
    // Check visibility on each render to detect when tab becomes active
    this._checkVisibility();

    return html`
      <div class="p-4">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-lg font-semibold text-gray-900">Lists</h2>
            <div class="ml-auto flex items-center gap-2">
              <button
                @click=${() => this.fetchLists()}
                class="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
                title="Refresh"
              >
                <span aria-hidden="true">↻</span>
                Refresh
              </button>
              <button
                @click=${this._createList}
                class="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
              >
                <span aria-hidden="true">+</span>
                Add New List
              </button>
            </div>
        </div>
        ${this.lists.length === 0
          ? html`<p class="text-base text-gray-600">No lists found.</p>`
          : html`
            <table class="min-w-full bg-white border border-gray-300">
              <thead>
                <tr class="bg-gray-50">
                  <th class="py-2 px-4 border-b left-justified-header text-xs font-semibold text-gray-700">Title</th>
                  <th class="py-2 px-4 border-b left-justified-header text-xs font-semibold text-gray-700">Item Count</th>
                  <th class="py-2 px-4 border-b left-justified-header text-xs font-semibold text-gray-700">Created At</th>
                  <th class="py-2 px-4 border-b left-justified-header text-xs font-semibold text-gray-700">Notes</th>
                  <th class="py-2 px-4 border-b left-justified-header text-xs font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.lists.map(list => html`
                  <tr class="hover:bg-gray-50 border-b">
                    <td class="py-2 px-4 text-xs text-gray-900">${list.title}</td>
                    <td class="py-2 px-4 text-center text-xs text-gray-700">${list.item_count}</td>
                    <td class="py-2 px-4 text-xs text-gray-700">${new Date(list.created_at).toLocaleDateString()}</td>
                    <td class="py-2 px-4 text-xs text-gray-600">${list.notebox || '—'}</td>
                    <td class="py-2 px-4 text-left">
                      <button @click=${() => this._selectList(list)} class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 mr-2">View</button>
                      <button @click=${() => this._editList(list)} class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">Edit</button>
                      <button @click=${() => this._deleteList(list)} class="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 ml-2">Delete</button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
      </div>

      ${this.selectedList ? html`
        <div class="p-4 border-t border-gray-200">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-2xl font-bold text-gray-900 mb-1">${this.selectedList.title}</h3>
              <p class="text-base text-gray-600">${this.selectedList.notebox || 'No notes.'}</p>
            </div>
            <button @click=${() => { this.selectedList = null; this.listItems = []; }} class="text-gray-500 hover:text-gray-700 text-2xl">
              ×
            </button>
          </div>
          ${this.listItems.length === 0 ? html`
            <p class="text-base text-gray-500">No items in this list yet.</p>
          ` : html`
            <div class="divide-y divide-gray-200">
              ${this.listItems.map(item => html`
                <div class="py-3">
                  <image-card .image=${item.image} .tenant=${this.tenant} .showAddToList=${false} .listMode=${true}></image-card>
                  <div class="flex items-center justify-between mt-2 text-sm text-gray-500">
                    <span>Added: ${new Date(item.added_at).toLocaleString()}</span>
                    <button @click=${() => this._removeListItem(item.id)} class="text-sm text-red-600 hover:text-red-700">Remove</button>
                  </div>
                </div>
              `)}
            </div>
          `}
        </div>
      ` : ''}

      ${this.editingList ? html`<list-edit-modal .list=${this.editingList} .active=${true} @save-list=${this._handleSaveList} @close-modal=${this._closeModal}></list-edit-modal>` : ''}
    `;
  }
}

customElements.define('list-editor', ListEditor);
