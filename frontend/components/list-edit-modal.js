import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';

class ListEditModal extends LitElement {
  static styles = [tailwind, css`
    :host {
      display: block;
    }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .modal-content {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      width: 500px;
    }
  `];

  static properties = {
    list: { type: Object },
    active: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.list = null;
    this.active = false;
  }

  _handleSave(e) {
    e.preventDefault();
    const title = this.shadowRoot.getElementById('title').value.trim();
    const description = this.shadowRoot.getElementById('description').value;
    if (!title) {
      return;
    }
    const updatedList = { ...this.list, title, notebox: description };
    this.dispatchEvent(new CustomEvent('save-list', { detail: updatedList }));
  }

  _handleCancel() {
    this.dispatchEvent(new CustomEvent('close-modal'));
  }

  render() {
    if (!this.active || !this.list) {
      return html``;
    }

    return html`
      <div class="modal-overlay" @click=${this._handleCancel}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <h3 class="text-xl font-bold mb-2">Edit List</h3>
          <form>
            <div class="mb-4">
              <label for="title" class="block text-gray-700 font-bold mb-2">Title</label>
              <input id="title" class="w-full p-2 border border-gray-300 rounded-lg" .value=${this.list.title || ''} required>
            </div>
            <div class="mb-4">
              <label for="description" class="block text-gray-700 font-bold mb-2">Notes</label>
              <textarea id="description" class="w-full p-2 border border-gray-300 rounded-lg" .value=${this.list.notebox}></textarea>
            </div>
            <div class="flex justify-end">
              <button @click=${this._handleCancel} type="button" class="border border-gray-400 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 mr-2">Cancel</button>
              <button @click=${this._handleSave} type="submit" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

customElements.define('list-edit-modal', ListEditModal);
