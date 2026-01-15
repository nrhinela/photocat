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
  }

  connectedCallback() {
    super.connectedCallback();
    this.fetchLists();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('tenant')) {
      this.fetchLists();
      this.selectedList = null;
      this.listItems = [];
    }
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
    this.editingList = { title: '', notebox: '', is_active: false };
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
    return html`
      <div class="p-4">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold">Lists Editor</h2>
            <button @click=${this._createList} class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                <i class="fas fa-plus mr-2"></i>Add New
            </button>
        </div>
        ${this.lists.length === 0
          ? html`<p>No lists found.</p>`
          : html`
            <table class="min-w-full bg-white border border-gray-300">
              <thead>
                <tr>
                  <th class="py-2 px-4 border-b left-justified-header">Active</th>
                  <th class="py-2 px-4 border-b left-justified-header">Title</th>
                  <th class="py-2 px-4 border-b left-justified-header">Item Count</th>
                  <th class="py-2 px-4 border-b left-justified-header">Created At</th>
                  <th class="py-2 px-4 border-b left-justified-header">Notes</th>
                  <th class="py-2 px-4 border-b left-justified-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.lists.map(list => html`
                  <tr class="hover:bg-gray-50">
                    <td class="py-2 px-4 border-b text-center">${list.is_active ? '✅' : '❌'}</td>
                    <td class="py-2 px-4 border-b">${list.title}</td>
                    <td class="py-2 px-4 border-b text-center">${list.item_count}</td>
                    <td class="py-2 px-4 border-b">${new Date(list.created_at).toLocaleDateString()}</td>
                    <td class="py-2 px-4 border-b">${list.notebox}</td>
                    <td class="py-2 px-4 border-b text-left"> 
                      <button @click=${() => this._selectList(list)} class="bg-blue-600 text-white px-3 py-1 rounded mr-2">View</button>
                      <button @click=${() => this._editList(list)} class="bg-green-500 text-white px-3 py-1 rounded">Edit</button>
                      <button @click=${() => this._deleteList(list)} class="bg-red-600 text-white px-3 py-1 rounded ml-2">Delete</button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
      </div>

      ${this.selectedList ? html`
        <div class="p-4">
          <h3 class="text-xl font-bold mb-1">${this.selectedList.title}</h3>
          <p class="text-sm text-gray-600 mb-4">${this.selectedList.notebox || 'No notes yet.'}</p>
          ${this.listItems.length === 0 ? html`
            <p class="text-sm text-gray-500">No items in this list yet.</p>
          ` : html`
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              ${this.listItems.map(item => html`
                <div>
                  <image-card .image=${item.image} .tenant=${this.tenant} .showAddToList=${false}></image-card>
                  <div class="flex items-center justify-between mt-1">
                    <p class="text-xs text-gray-500">Added: ${new Date(item.added_at).toLocaleString()}</p>
                    <button @click=${() => this._removeListItem(item.id)} class="text-xs text-red-600 hover:text-red-700">Remove</button>
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
