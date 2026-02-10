import { LitElement, html } from 'lit';
import { formatStatNumber } from './shared/formatting.js';

/**
 * Home Tab Component
 *
 * Dashboard view showing:
 * - Image statistics (total, reviewed)
 * - Navigation cards to main features
 *
 * @fires navigate - When a navigation card is clicked
 */
export class HomeTab extends LitElement {
  // Use Light DOM to access Tailwind CSS classes
  createRenderRoot() {
    return this;
  }

  static properties = {
    imageStats: { type: Object },
    navCards: { type: Array },
  };

  constructor() {
    super();
    this.imageStats = null;
    this.navCards = [];
  }

  _handleNavigate(tabKey) {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { tab: tabKey },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const imageCount = formatStatNumber(this.imageStats?.image_count);
    const reviewedCount = formatStatNumber(this.imageStats?.reviewed_image_count);

    return html`
      <div slot="home" class="container">
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px] border border-gray-200 rounded-lg p-3 bg-white shadow">
            <div class="text-xs text-gray-500 uppercase">Images</div>
            <div class="text-2xl font-semibold text-gray-900">${imageCount}</div>
          </div>
          <div class="flex-1 min-w-[200px] border border-gray-200 rounded-lg p-3 bg-white shadow">
            <div class="text-xs text-gray-500 uppercase">Reviewed</div>
            <div class="text-2xl font-semibold text-gray-900">${reviewedCount}</div>
          </div>
        </div>
        <div class="home-nav-grid">
          ${this.navCards.map((card) => html`
            <button
              class="home-nav-button"
              type="button"
              @click=${() => this._handleNavigate(card.key)}
            >
              <div>
                <div class="text-lg font-semibold text-gray-900">${card.label}</div>
                <div class="text-sm text-gray-500">${card.subtitle}</div>
              </div>
              <span class="text-2xl text-blue-600"><i class="fas ${card.icon}"></i></span>
            </button>
          `)}
        </div>
      </div>
    `;
  }
}

customElements.define('home-tab', HomeTab);
