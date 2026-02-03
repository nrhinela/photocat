import { LitElement, html } from 'lit';

export class RatingTargetPanel extends LitElement {
  createRenderRoot() {
    return this;
  }

  static properties = {
    targets: { type: Array },
    dragTargetId: { type: String },
  };

  constructor() {
    super();
    this.targets = [];
    this.dragTargetId = null;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _handleDragOver(event, targetId) {
    event.preventDefault();
    this._emit('rating-dragover', { event, targetId });
  }

  _handleDragLeave(event, targetId) {
    if (event && event.currentTarget !== event.target) return;
    this._emit('rating-dragleave', { event, targetId });
  }

  _handleDrop(event, targetId) {
    event.preventDefault();
    this._emit('rating-drop', { event, targetId });
  }

  render() {
    const targets = Array.isArray(this.targets) ? this.targets : [];
    const firstId = targets[0]?.id;
    return html`
      <div class="curate-utility-panel">
        ${targets.map((target) => {
          const isFirstTarget = firstId === target.id;
          return html`
            <div
              class="curate-utility-box ${this.dragTargetId === target.id ? 'active' : ''}"
              @dragover=${(event) => this._handleDragOver(event, target.id)}
              @dragleave=${(event) => this._handleDragLeave(event, target.id)}
              @drop=${(event) => this._handleDrop(event, target.id)}
            >
              <div class="curate-utility-controls rating-target-controls">
                <select
                  class="curate-utility-select ${target.rating ? 'selected' : ''}"
                  .value=${target.rating || ''}
                  ?disabled=${!!target.prompt}
                  @change=${(event) => this._emit('rating-change', { targetId: target.id, value: event.target.value })}
                >
                  ${target.prompt ? html`
                    <option value="">Prompt on drop…</option>
                  ` : html`
                    <option value="">Select rating…</option>
                    <option value="0">🗑️ Garbage</option>
                    <option value="1">⭐ 1 Star</option>
                    <option value="2">⭐⭐ 2 Stars</option>
                    <option value="3">⭐⭐⭐ 3 Stars</option>
                  `}
                </select>
              </div>
              ${!isFirstTarget ? html`
                <button
                  type="button"
                  class="curate-utility-remove"
                  title="Remove box"
                  @click=${() => this._emit('rating-remove', { targetId: target.id })}
                >
                  ×
                </button>
              ` : html``}
              <div class="curate-utility-count">${target.count || 0}</div>
              <div class="curate-utility-drop-hint">Drop images here</div>
            </div>
          `;
        })}
        <button class="curate-utility-add" @click=${() => this._emit('rating-add', {})}>
          +
        </button>
      </div>
    `;
  }
}

customElements.define('rating-target-panel', RatingTargetPanel);
