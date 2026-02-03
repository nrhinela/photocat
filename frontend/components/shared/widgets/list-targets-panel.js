import { LitElement, html } from 'lit';

export class ListTargetsPanel extends LitElement {
  createRenderRoot() {
    return this;
  }

  static properties = {
    listsLoading: { type: Boolean },
    listTargets: { type: Array },
    lists: { type: Array },
    listDragTargetId: { type: String },
  };

  constructor() {
    super();
    this.listsLoading = false;
    this.listTargets = [];
    this.lists = [];
    this.listDragTargetId = null;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _getListSize(target) {
    if (!target?.listId) return 0;
    if (target.itemsListId && String(target.itemsListId) === String(target.listId)) {
      return Array.isArray(target.items) ? target.items.length : 0;
    }
    const list = (this.lists || []).find((entry) => String(entry.id) === String(target.listId));
    if (list && Number.isFinite(list.item_count)) {
      return list.item_count;
    }
    return 0;
  }

  _handleDragOver(event, targetId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    this._emit('list-target-dragover', { targetId, event });
  }

  _handleDragLeave(event, targetId) {
    if (event && event.currentTarget !== event.target) {
      return;
    }
    this._emit('list-target-dragleave', { targetId, event });
  }

  _handleDrop(event, targetId) {
    event.preventDefault();
    this._emit('list-target-drop', { targetId, event });
  }

  render() {
    if (this.listsLoading) {
      return html`<div class="text-xs text-gray-500">Loading lists…</div>`;
    }

    return html`
      <div class="space-y-3">
        ${(this.listTargets || []).map((target) => html`
          <div
            class="list-target-card ${this.listDragTargetId === target.id ? 'list-target-card--active' : ''}"
            @dragover=${(event) => this._handleDragOver(event, target.id)}
            @dragleave=${(event) => this._handleDragLeave(event, target.id)}
            @drop=${(event) => this._handleDrop(event, target.id)}
          >
            <div class="list-target-header">
              <select
                class="list-target-select px-2 py-1 border rounded text-xs"
                .value=${target.listId || ''}
                @change=${(event) => this._emit('list-target-select', { targetId: target.id, value: event.target.value })}
              >
                <option value="" ?selected=${!target.listId}>Select list…</option>
                <option value="__new__">New list…</option>
                ${(this.lists || []).map((list) => html`
                  <option
                    value=${String(list.id)}
                    ?selected=${String(list.id) === String(target.listId)}
                  >
                    ${list.title}
                  </option>
                `)}
              </select>
              ${(this.listTargets || []).length > 1 ? html`
                <button
                  class="text-xs text-gray-500 hover:text-gray-700"
                  title="Remove list target"
                  @click=${() => this._emit('list-target-remove', { targetId: target.id })}
                >
                  ×
                </button>
              ` : html``}
              <button
                class="list-target-tab ${target.mode === 'view' ? 'active' : ''}"
                @click=${() => this._emit('list-target-mode', { targetId: target.id, mode: 'view' })}
                ?disabled=${!target.listId}
              >
                ${target.mode === 'view' ? 'Back' : 'View'}
              </button>
            </div>
            ${target.isCreating ? html`
              <div class="mt-2 flex items-center gap-2">
                <input
                  class="flex-1 px-2 py-1 border rounded text-xs"
                  .value=${target.draftTitle || ''}
                  @input=${(event) => this._emit('list-target-draft-change', { targetId: target.id, value: event.target.value })}
                  @keydown=${(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      this._emit('list-target-create-save', { targetId: target.id });
                    }
                  }}
                >
                <button
                  class="px-2 py-1 text-xs border rounded text-gray-600 hover:bg-gray-50"
                  @click=${() => this._emit('list-target-create-save', { targetId: target.id })}
                >
                  Save
                </button>
                <button
                  class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                  @click=${() => this._emit('list-target-create-cancel', { targetId: target.id })}
                >
                  Cancel
                </button>
              </div>
            ` : html``}
            ${target.mode === 'view' ? html`
              <div class="mt-2">
                ${target.itemsLoading ? html`
                  <div class="text-xs text-gray-500">Loading list items…</div>
                ` : target.itemsError ? html`
                  <div class="text-xs text-red-500">${target.itemsError}</div>
                ` : target.listId && (target.items || []).length ? html`
                  <div class="list-target-thumbs">
                    <div class="list-target-thumbs-track">
                      ${(target.items || []).map((item, index) => {
                        const photo = item?.photo || {};
                        const id = photo.id ?? item.photo_id ?? item.id;
                        const src = photo.thumbnail_url || (id ? `/api/v1/images/${id}/thumbnail` : '');
                        return html`
                          <button
                            class="list-target-thumb"
                            @click=${(event) => this._emit('list-target-item-click', { targetId: target.id, index, event })}
                            title=${photo.filename || ''}
                          >
                            <img src=${src} alt=${photo.filename || ''} loading="lazy">
                          </button>
                        `;
                      })}
                    </div>
                  </div>
                ` : html`
                  <div class="text-xs text-gray-500">
                    ${target.listId ? 'No items in this list yet.' : 'Select a list to view items.'}
                  </div>
                `}
              </div>
            ` : html`
              <div class="list-target-drop">
                <div class="list-target-drop-count">
                  ${target.addedCount || 0}
                </div>
                <div class="list-target-drop-sub">
                  List size: ${this._getListSize(target)}
                </div>
                <div class="list-target-drop-label">
                  ${target.error
                    ? target.error
                    : (target.status || (target.listId ? 'Drop images here' : 'Select a list to add items'))}
                </div>
              </div>
            `}
          </div>
        `)}
        <button
          class="curate-utility-add list-target-add"
          @click=${() => this._emit('list-target-add', {})}
          title="Add list target"
        >
          +
        </button>
      </div>
    `;
  }
}

customElements.define('list-targets-panel', ListTargetsPanel);
