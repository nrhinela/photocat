import { LitElement, html, css } from 'lit';
import './app-header.js';
import './image-gallery.js';
import './filter-controls.js';

class PhotoCatApp extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .container {
        max-width: 1280px;
        margin: 0 auto;
        padding: 16px;
    }
  `;

  static properties = {
      filters: { type: Object },
      tenant: { type: String },
  }

  constructor() {
      super();
      this.filters = {};
      this.tenant = 'bcg'; // Default tenant
  }

  _handleFilterChange(e) {
      this.filters = e.detail;
  }

  _handleTenantChange(e) {
      this.tenant = e.detail;
  }

  render() {
    return html`
        <app-header @tenant-change=${this._handleTenantChange}></app-header>
        <div class="container">
            <filter-controls .tenant=${this.tenant} @filter-change=${this._handleFilterChange}></filter-controls>
            <image-gallery .tenant=${this.tenant} .filters=${this.filters}></image-gallery>
        </div>
    `;
  }
}

customElements.define('photocat-app', PhotoCatApp);
