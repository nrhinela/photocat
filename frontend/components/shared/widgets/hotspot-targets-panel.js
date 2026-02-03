import { LitElement, html } from 'lit';

export class HotspotTargetsPanel extends LitElement {
  createRenderRoot() {
    return this;
  }

  static properties = {
    targets: { type: Array },
    keywordsByCategory: { type: Array },
    dragTargetId: { type: String },
    ratingEnabled: { type: Boolean },
    ratingCount: { type: Number },
    ratingDragTarget: { type: Boolean },
    mode: { type: String },
  };

  constructor() {
    super();
    this.targets = [];
    this.keywordsByCategory = [];
    this.dragTargetId = null;
    this.ratingEnabled = false;
    this.ratingCount = 0;
    this.ratingDragTarget = false;
    this.mode = 'hotspots';
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
    this._emit('hotspot-dragover', { targetId, event });
  }

  _handleDragLeave(event) {
    this._emit('hotspot-dragleave', { event });
  }

  _handleDrop(event, targetId) {
    event.preventDefault();
    this._emit('hotspot-drop', { targetId, event });
  }

  _handleRatingDragOver(event) {
    event.preventDefault();
    this._emit('rating-dragover', { event });
  }

  _handleRatingDragLeave() {
    this._emit('rating-dragleave', {});
  }

  _handleRatingDrop(event) {
    event.preventDefault();
    this._emit('rating-drop', { event });
  }

  render() {
    const targets = Array.isArray(this.targets) ? this.targets : [];
    const keywordsByCategory = Array.isArray(this.keywordsByCategory) ? this.keywordsByCategory : [];
    const firstId = targets[0]?.id;
    const isTagsMode = this.mode === 'tags';

    return html`
      ${this.ratingEnabled ? html`
        <div
          class="curate-rating-drop-zone ${this.ratingDragTarget ? 'active' : ''}"
          @dragover=${(event) => this._handleRatingDragOver(event)}
          @dragleave=${() => this._handleRatingDragLeave()}
          @drop=${(event) => this._handleRatingDrop(event)}
        >
          <div class="curate-rating-drop-zone-star">⭐</div>
          <div class="curate-rating-drop-zone-content">
            <div class="curate-rating-drop-hint">Drop to rate</div>
            <div class="curate-rating-count">${this.ratingCount || 0} rated</div>
          </div>
        </div>
      ` : html``}
      <div class="curate-utility-panel">
        ${targets.map((target) => {
          const isFirstTarget = firstId === target.id;
          const isRating = !isTagsMode && target.type === 'rating';
          const selectedValue = target.keyword
            ? `${encodeURIComponent(target.category || 'Uncategorized')}::${encodeURIComponent(target.keyword)}`
            : '';
          const controlsClass = `curate-utility-controls${isTagsMode ? ' curate-utility-controls--tags' : ''}`;

          return html`
            <div
              class="curate-utility-box ${this.dragTargetId === target.id ? 'active' : ''}"
              @dragover=${(event) => this._handleDragOver(event, target.id)}
              @dragleave=${(event) => this._handleDragLeave(event)}
              @drop=${(event) => this._handleDrop(event, target.id)}
            >
              <div class=${controlsClass}>
                ${!isTagsMode ? html`
                  <select
                    class="curate-utility-type-select"
                    .value=${target.type || 'keyword'}
                    @change=${(event) => this._emit('hotspot-type-change', { targetId: target.id, value: event.target.value })}
                  >
                    <option value="keyword">Keyword</option>
                    <option value="rating">Rating</option>
                  </select>
                ` : html``}
                ${isRating ? html`
                  <select
                    class="curate-utility-select"
                    .value=${target.rating ?? ''}
                    @change=${(event) => this._emit('hotspot-rating-change', { targetId: target.id, value: event.target.value })}
                  >
                    <option value="">Select rating…</option>
                    <option value="0">🗑️ Garbage</option>
                    <option value="1">⭐ 1 Star</option>
                    <option value="2">⭐⭐ 2 Stars</option>
                    <option value="3">⭐⭐⭐ 3 Stars</option>
                  </select>
                ` : html`
                  <select
                    class="curate-utility-select ${selectedValue ? 'selected' : ''}"
                    .value=${selectedValue}
                    @change=${(event) => this._emit('hotspot-keyword-change', { targetId: target.id, value: event.target.value })}
                  >
                    <option value="">Select keyword…</option>
                    ${keywordsByCategory.map(([category, keywords]) => html`
                      <optgroup label="${category}">
                        ${keywords.map((kw) => html`
                          <option value=${`${encodeURIComponent(category)}::${encodeURIComponent(kw.keyword)}`}>
                            ${kw.keyword}
                          </option>
                        `)}
                      </optgroup>
                    `)}
                  </select>
                  <select
                    class="curate-utility-action"
                    .value=${target.action || 'add'}
                    @change=${(event) => this._emit('hotspot-action-change', { targetId: target.id, value: event.target.value })}
                  >
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                  </select>
                `}
              </div>
              ${!isFirstTarget ? html`
                <button
                  type="button"
                  class="curate-utility-remove"
                  title="Remove box"
                  @click=${() => this._emit('hotspot-remove', { targetId: target.id })}
                >
                  ×
                </button>
              ` : html``}
              <div class="curate-utility-count">${target.count || 0}</div>
              <div class="curate-utility-drop-hint">Drop images here</div>
            </div>
          `;
        })}
        <button class="curate-utility-add" @click=${() => this._emit('hotspot-add', {})}>
          +
        </button>
      </div>
    `;
  }
}

customElements.define('hotspot-targets-panel', HotspotTargetsPanel);
