import { LitElement, html, css } from 'lit';
import { uploadImages } from '../services/api.js';
import { tailwind } from './tailwind-lit.js';

class UploadModal extends LitElement {
  static styles = [tailwind, css`
    .modal {
        display: none;
        position: fixed;
        z-index: 50;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.75);
    }
    .modal.active {
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 24px 0;
    }
    .modal-content {
        background-color: #fefefe;
        margin: auto;
        padding: 24px;
        border: 1px solid #888;
        width: min(96vw, 1280px);
        max-width: 1280px;
        border-radius: 0.5rem;
        max-height: none;
        overflow: visible;
    }
    .close {
        color: #aaaaaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
    }
    .close:hover,
    .close:focus {
        color: #000;
        text-decoration: none;
        cursor: pointer;
    }
  `];

  static properties = {
    active: { type: Boolean, reflect: true },
    tenant: { type: String },
    results: { type: Array },
    isProcessing: { type: Boolean },
  };

  constructor() {
    super();
    this.active = false;
    this.results = [];
    this.isProcessing = false;
  }

  render() {
    return html`
      <div class="modal ${this.active ? 'active' : ''}" @click=${this._closeModal}>
        <div class="modal-content" @click=${e => e.stopPropagation()}>
          <span class="close" @click=${this._closeModal}>&times;</span>
          <h2 class="text-2xl font-bold text-gray-800">Test Tagging</h2>
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mt-4">
              ${this.isProcessing ? html`
                <i class="fas fa-spinner fa-spin text-5xl text-blue-500 mb-3"></i>
                <p class="text-gray-600">Tagging images...</p>
              ` : html`
                <i class="fas fa-cloud-upload-alt text-6xl text-gray-400 mb-4"></i>
                <p class="text-gray-600 mb-4">Upload images to preview tags without saving.</p>
                <input type="file" id="fileInput" multiple accept="image/*" class="hidden" @change=${this._handleFileSelect}>
                <button @click=${() => this.shadowRoot.getElementById('fileInput').click()} class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                    Select Files
                </button>
              `}
          </div>
          ${this.results.length ? html`
            <div class="mt-6 space-y-4 max-h-64 overflow-auto">
              ${this.results.map((result) => html`
                <div class="border border-gray-200 rounded-lg p-3">
                  <div class="font-semibold text-gray-700">${result.filename}</div>
                  ${result.status !== 'success' ? html`
                    <div class="text-sm text-red-600">${result.message || 'Failed to tag.'}</div>
                  ` : html`
                    <div class="mt-3 flex flex-row gap-4 items-stretch">
                      <div class="w-40 flex-shrink-0">
                        ${result.thumbnail_base64 ? html`
                          <img
                            class="w-40 h-40 rounded border border-gray-200 object-cover"
                            src="data:image/jpeg;base64,${result.thumbnail_base64}"
                            alt=${result.filename}
                          />
                        ` : html``}
                      </div>
                      <div class="flex-1 min-h-40 text-xs text-gray-600 space-y-3">
                        ${result.tags?.length ? this._renderGroupedTags(result.tags) : html`
                          <div class="text-gray-500">No tags detected.</div>
                        `}
                      </div>
                    </div>
                  `}
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _closeModal() {
    this.active = false;
    this.results = [];
    this.isProcessing = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  async _handleFileSelect(e) {
      const files = e.target.files;
      if (files.length > 0) {
          try {
              this.isProcessing = true;
              const response = await uploadImages(this.tenant, files);
              this.results = response?.results || [];
          } catch (error) {
              console.error('Upload failed:', error);
              this.results = [{
                filename: 'Upload failed',
                status: 'error',
                message: error.message,
              }];
          } finally {
              this.isProcessing = false;
          }
      }
  }

  _renderGroupedTags(tags) {
    const grouped = {};
    tags.forEach((tag) => {
      const category = tag.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tag);
    });

    const sortedCategories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    sortedCategories.forEach((category) => {
      grouped[category].sort((a, b) => b.confidence - a.confidence);
    });

    return html`
      ${sortedCategories.map((category) => html`
        <div>
          <div class="font-semibold text-gray-700 mb-1">${category}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            ${grouped[category].map((tag) => html`
              <div>${tag.keyword} · ${(tag.confidence * 100).toFixed(1)}%</div>
            `)}
          </div>
        </div>
      `)}
    `;
  }
}

customElements.define('upload-modal', UploadModal);
