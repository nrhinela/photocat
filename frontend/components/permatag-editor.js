import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';
import { getKeywords, getPermatags, addPermatag, deletePermatag, getImageDetails, retagImage, freezePermatags } from '../services/api.js';

class PermatagEditor extends LitElement {
  static styles = [tailwind, css`
    .permatag {
      cursor: pointer;
      transition: background-color 0.2s;
      padding: 4px 8px;
      border-radius: 9999px;
      border: 1px solid transparent;
    }
    .permatag-default {
      background-color: #f3f4f6; /* gray-200 */
      border-color: #d1d5db; /* gray-300 */
    }
    .permatag-positive {
      background-color: #d1fae5; /* green-100 */
      border-color: #6ee7b7; /* green-300 */
      color: #065f46; /* green-800 */
    }
    .permatag-negative {
      background-color: #fee2e2; /* red-100 */
      border-color: #fca5a5; /* red-300 */
      color: #991b1b; /* red-800 */
    }
    .ml-recommended {
      background-color: #ecfdf5; /* emerald-50 */
    }
    .freeze-button {
      background-color: #059669; /* emerald-600 */
    }
    .freeze-button:hover {
      background-color: #047857; /* emerald-700 */
    }
  `];

  static properties = {
    imageId: { type: Number },
    tenant: { type: String },
    mode: { type: String },
    allKeywords: { type: Object, state: true },
    imagePermatags: { type: Array, state: true },
    machineTags: { type: Array, state: true },
    isLoading: { type: Boolean, state: true },
    isRetagging: { type: Boolean, state: true },
    isFreezing: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.isLoading = true;
    this.allKeywords = {};
    this.imagePermatags = [];
    this.machineTags = [];
    this.mode = 'all';
    this.isRetagging = false;
    this.isFreezing = false;
    console.log('PermatagEditor: Constructor called.');
  }

  connectedCallback() {
    super.connectedCallback();
    console.log('PermatagEditor: connectedCallback called.');
    console.log('PermatagEditor: imageId from props:', this.imageId);
    console.log('PermatagEditor: tenant from props:', this.tenant);
    this._handlePermatagEvent = (event) => {
      if (event?.detail?.imageId === this.imageId) {
        this.fetchData();
      }
    };
    window.addEventListener('permatags-changed', this._handlePermatagEvent);
    this.fetchData();
  }

  disconnectedCallback() {
    window.removeEventListener('permatags-changed', this._handlePermatagEvent);
    super.disconnectedCallback();
  }

  willUpdate(changedProperties) {
      if (changedProperties.has('imageId') && this.imageId && changedProperties.get('imageId') !== this.imageId) {
          console.log('PermatagEditor: imageId changed, refetching data.');
          this.fetchData();
      }
      if (changedProperties.has('tenant') && this.tenant && changedProperties.get('tenant') !== this.tenant) {
          console.log('PermatagEditor: tenant changed, refetching data.');
          this.fetchData();
      }
  }

  async fetchData() {
    this.isLoading = true;
    console.log('PermatagEditor: Starting fetchData for imageId', this.imageId, 'and tenant', this.tenant);
    if (!this.tenant || !this.imageId) {
        console.warn('PermatagEditor: Cannot fetch data, tenant or imageId is missing.');
        this.isLoading = false;
        return;
    }
    try {
      const [keywords, permatags, imageDetails] = await Promise.all([
        getKeywords(this.tenant),
        getPermatags(this.tenant, this.imageId), // This is the new function
        getImageDetails(this.tenant, this.imageId),
      ]);
      this.allKeywords = keywords || {}; 
      this.imagePermatags = permatags.permatags || [];
      this.machineTags = imageDetails.tags || [];
      console.log('PermatagEditor: Data fetched successfully.');
      console.log('PermatagEditor: allKeywords (after processing):', this.allKeywords); // Verify content
      console.log('PermatagEditor: imagePermatags:', this.imagePermatags);
      console.log('PermatagEditor: machineTags:', this.machineTags);
    } catch (error) {
      console.error('PermatagEditor: Failed to fetch permatag data:', error);
    } finally {
      this.isLoading = false;
      console.log('PermatagEditor: isLoading set to false.');
    }
  }

  async handlePermatagChange(keyword, newSignum) {
    const permatag = this.imagePermatags.find(p => p.keyword === keyword.keyword);

    try {
      if (newSignum === null) {
        if (permatag) {
          console.log('PermatagEditor: Deleting permatag:', permatag.id);
          await deletePermatag(this.tenant, this.imageId, permatag.id);
        }
      } else {
        console.log('PermatagEditor: Adding/Updating permatag:', keyword.keyword, 'signum:', newSignum);
        await addPermatag(this.tenant, this.imageId, keyword.keyword, keyword.category, newSignum); // Updated arguments
      }
      window.dispatchEvent(new CustomEvent('permatags-changed', {
        detail: { imageId: this.imageId }
      }));
    } catch (error) {
        console.error("PermatagEditor: Failed to update permatag", error);
    } finally {
        this.fetchData();
    }
  }

  renderCategory(category, keywords) {
    console.log(`PermatagEditor: Attempting to render category: ${category} with ${keywords.length} keywords.`); // Check if this is called
    if (keywords.length === 0) {
        console.log(`PermatagEditor: Category "${category}" has no keywords to render.`);
        return html``; // Don't render an empty category table
    }
    return html`
      <div class="mb-4">
        <h4 class="font-medium text-gray-600 text-sm capitalize mb-2">${category.replace(/_/g, ' ')}</h4>
        <table class="min-w-full bg-white border border-gray-300">
          <thead>
            <tr>
              <th class="py-2 px-4 border-b text-left">Keyword</th>
              <th class="py-2 px-4 border-b text-center">Zero-Shot ML Tags</th>
              <th class="py-2 px-4 border-b text-center">Approve</th>
              <th class="py-2 px-4 border-b text-center">Reject</th>
              <th class="py-2 px-4 border-b text-center"></th>
            </tr>
          </thead>
          <tbody>
            ${keywords.map(kw => this.renderKeywordRow(kw))}
          </tbody>
        </table>
      </div>
    `;
  }
  renderKeywordRow(keyword) {
    const permatag = this.imagePermatags.find(p => p.keyword === keyword.keyword);
    const signum = permatag ? permatag.signum : 0;
    const hasMachineTag = this.machineTags.some(mt => mt.keyword === keyword.keyword);

    // console.log(`PermatagEditor: Rendering keyword row for: ${keyword.keyword}, Signum: ${signum}, ML: ${hasMachineTag}`);

    return html`
      <tr class=${hasMachineTag ? 'ml-recommended' : ''}>
        <td class="py-2 px-4 border-b">${keyword.keyword}</td>
        <td class="py-2 px-4 border-b text-center">${hasMachineTag ? html`<span class="text-green-600" aria-label="Machine tag">✓</span>` : ''}</td>
        <td class="py-2 px-4 border-b text-center">
          <input type="radio" name="${keyword.keyword}" .checked=${signum === 1} @change=${() => this.handlePermatagChange(keyword, 1)}>
        </td>
        <td class="py-2 px-4 border-b text-center">
          <input type="radio" name="${keyword.keyword}" .checked=${signum === -1} @change=${() => this.handlePermatagChange(keyword, -1)}>
        </td>
        <td class="py-2 px-4 border-b text-center">
          <button @click=${() => this.handlePermatagChange(keyword, null)} class="text-gray-500 hover:text-black">Clear</button>
        </td>
      </tr>
    `;
  }

  render() {
    console.log('PermatagEditor: Render method called.');
    console.log('PermatagEditor: Current isLoading state:', this.isLoading);
    console.log('PermatagEditor: Current allKeywords keys:', Object.keys(this.allKeywords));

    if (this.isLoading) {
      console.log('PermatagEditor: Displaying loading message.');
      return html`<p>Loading keywords...</p>`;
    }

    console.log('PermatagEditor: Rendering main content (isLoading is false).'); // Check if this is reached
    if (this.mode !== 'side' && Object.keys(this.allKeywords).length === 0) {
        console.log('PermatagEditor: allKeywords is empty, no keyword grid will be rendered.');
        return html`<p class="text-sm text-gray-500">No keywords available for tagging.</p>`;
    }


    const sortedCategories = Object.entries(this.allKeywords)
      .sort(([a], [b]) => a.localeCompare(b));
    const gridSection = html`
      <div class="mt-4">
        <h3 class="font-semibold text-gray-700 mb-2">Edit Permatags</h3>
        <div class="space-y-4">
          ${sortedCategories.map(([category, keywords]) => {
            const sortedKeywords = [...keywords].sort((a, b) => a.keyword.localeCompare(b.keyword));
            return this.renderCategory(category, sortedKeywords);
          })}
        </div>
      </div>
    `;
    const sideSection = html`
      <div class="mt-6">
          <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold text-gray-700">Zero-Shot ML Tags</h4>
              <div class="flex items-center gap-2">
                <button
                  class="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded shadow transition-colors text-xs"
                  @click=${this._handleRetag}
                  ?disabled=${this.isRetagging}
                >
                  <i class="fas fa-sync-alt mr-1"></i>${this.isRetagging ? 'Retagging...' : 'Retag'}
                </button>
                <button
                  class="freeze-button text-white px-2 py-1 rounded shadow transition-colors text-xs"
                  @click=${this._handleFreeze}
                  ?disabled=${this.isFreezing}
                >
                  ${this.isFreezing ? 'Freezing...' : 'Freeze'}
                </button>
              </div>
          </div>
          ${this.renderMachineTags()}
      </div>
      <div class="mt-6">
          <h4 class="font-semibold text-gray-700 mb-2">Permatags</h4>
          ${this.renderCurrentPermatags()}
      </div>
      <div class="mt-6">
          <h4 class="font-semibold text-gray-700 mb-2">Add Custom Keyword</h4>
          <div class="flex gap-2">
            <input id="custom-keyword-input" class="flex-grow border rounded px-2 py-1" type="text" placeholder="e.g., family-vacation">
            <button @click=${this.addCustomKeyword} class="bg-blue-600 text-white px-4 py-1 rounded shadow hover:bg-blue-700 whitespace-nowrap">Add</button>
          </div>
      </div>
    `;

    if (this.mode === 'grid') {
      return gridSection;
    }
    if (this.mode === 'side') {
      return sideSection;
    }
    return html`${gridSection}${sideSection}`;
  }

  renderCurrentPermatags() {
      if (this.imagePermatags.length === 0) {
          return html`<p class="text-sm text-gray-500">No permatags set for this image.</p>`;
      }
      const sortedPermatags = [...this.imagePermatags].sort((a, b) => {
          if (a.signum !== b.signum) {
              return b.signum - a.signum;
          }
          return a.keyword.localeCompare(b.keyword);
      });

      return html`
          <div class="flex flex-wrap gap-2">
              ${sortedPermatags.map(ptag => html`
                  <div class="flex items-center rounded-full text-sm ${ptag.signum === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                      <span class="px-3 py-1">${ptag.keyword}</span>
                      <button @click=${() => this.handleDeletePermatag(ptag.id)} class="ml-1 pr-2 text-gray-500 hover:text-black">
                          &times;
                      </button>
                  </div>
              `)}
          </div>
      `;
  }

  renderMachineTags() {
      if (this.machineTags.length === 0) {
          return html`<p class="text-xs text-gray-500">No machine tags found.</p>`;
      }
      const sortedTags = [...this.machineTags].sort((a, b) => a.keyword.localeCompare(b.keyword));
      return html`
          <table class="min-w-full text-xs text-gray-600">
              <thead>
                  <tr class="text-left text-gray-500">
                      <th class="py-1 pr-2 font-medium">Keyword</th>
                      <th class="py-1 pr-2 font-medium">Conf</th>
                      <th class="py-1 font-medium">Created</th>
                  </tr>
              </thead>
              <tbody>
                  ${sortedTags.map(tag => html`
                      <tr>
                          <td class="py-1 pr-2">${tag.keyword}</td>
                          <td class="py-1 pr-2">${Math.round((tag.confidence || 0) * 100)}%</td>
                          <td class="py-1">${tag.created_at || 'Unknown'}</td>
                      </tr>
                  `)}
              </tbody>
          </table>
      `;
  }

  async _handleRetag() {
      if (!this.imageId || this.isRetagging) return;
      this.isRetagging = true;
      try {
          await retagImage(this.tenant, this.imageId);
          await this.fetchData();
          window.dispatchEvent(new CustomEvent('image-retagged', {
              detail: { imageId: this.imageId }
          }));
      } catch (error) {
          console.error('PermatagEditor: Failed to retag image:', error);
      } finally {
          this.isRetagging = false;
      }
  }

  async _handleFreeze() {
      if (!this.imageId || this.isFreezing) return;
      this.isFreezing = true;
      try {
          await freezePermatags(this.tenant, this.imageId);
          await this.fetchData();
          window.dispatchEvent(new CustomEvent('permatags-changed', {
              detail: { imageId: this.imageId }
          }));
      } catch (error) {
          console.error('PermatagEditor: Failed to freeze permatags:', error);
      } finally {
          this.isFreezing = false;
      }
  }
  
  async addCustomKeyword() {
    const input = this.shadowRoot.getElementById('custom-keyword-input');
    const keyword = input.value.trim();
    if (!keyword) return;

    try {
        console.log('PermatagEditor: Adding custom keyword:', keyword);
        await addPermatag(this.tenant, this.imageId, keyword, 'custom', 1); // Updated arguments
        input.value = '';
        window.dispatchEvent(new CustomEvent('permatags-changed', {
          detail: { imageId: this.imageId }
        }));
    } catch (error) {
        console.error("PermatagEditor: Failed to add custom permatag", error);
    } finally {
        this.fetchData();
    }
  }

  async handleDeletePermatag(permatagId) {
      try {
          console.log('PermatagEditor: Deleting permatag with ID:', permatagId);
          await deletePermatag(this.tenant, this.imageId, permatagId);
          window.dispatchEvent(new CustomEvent('permatags-changed', {
            detail: { imageId: this.imageId }
          }));
      } catch (error) {
          console.error("PermatagEditor: Failed to delete permatag", error);
      } finally {
          this.fetchData();
      }
  }
}

customElements.define('permatag-editor', PermatagEditor);
