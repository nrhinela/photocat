import { LitElement, html, css } from 'lit';
import './image-card.js';
import { getImages } from '../services/api.js';
import { tailwind } from './tailwind-lit.js';

class ImageGallery extends LitElement {
  static styles = [tailwind, css`
    :host {
      display: block;
    }
  `];

  static properties = {
    images: { type: Array },
    filters: { type: Object },
    tenant: { type: String },
    activeListName: { type: String },
    activeListItemIds: { type: Object },
    keywords: { type: Array },
  };
  
  constructor() {
    super();
    this.images = [];
    this.filters = {};
    this.activeListName = '';
    this.activeListItemIds = new Set();
    this.keywords = [];
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('filters') || changedProperties.has('tenant')) {
      this.fetchImages();
    }
  }

  async fetchImages() {
    if (!this.tenant) return;
    try {
      this.images = await getImages(this.tenant, this.filters);
    } catch (error) {
      console.error('Error fetching images:', error);
    }
  }

  render() {
    return html`
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${this.images.map((image) => html`
          <image-card
            .image=${image}
            .tenant=${this.tenant}
            .activeListName=${this.activeListName}
            .isInActiveList=${this.activeListItemIds.has(image.id)}
            .keywords=${this.keywords}
          ></image-card>
        `)}
      </div>
    `;
  }
}

customElements.define('image-gallery', ImageGallery);
