import { LitElement, html, css } from 'lit';
import './image-card.js';
import { getImages } from '../services/api.js';

class ImageGallery extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }
  `;

  static properties = {
    images: { type: Array },
    filters: { type: Object },
    tenant: { type: String },
  };

  constructor() {
    super();
    this.images = [];
    this.filters = {};
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
      <div class="grid">
        ${this.images.map((image) => html`<image-card .image=${image} .tenant=${this.tenant}></image-card>`)}
      </div>
    `;
  }
}

customElements.define('image-gallery', ImageGallery);
