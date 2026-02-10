import { LitElement, html } from 'lit';
import { formatStatNumber } from './shared/formatting.js';
import { renderPropertyRows, renderPropertySection } from './shared/widgets/property-grid.js';

export class HomeInsightsTab extends LitElement {
  createRenderRoot() {
    return this;
  }

  static properties = {
    imageStats: { type: Object },
    keywords: { type: Array },
  };

  constructor() {
    super();
    this.imageStats = null;
    this.keywords = [];
  }

  _formatAge(dateValue) {
    if (!dateValue) return '--';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '--';
    const diffMs = Date.now() - date.getTime();
    const clamped = diffMs < 0 ? 0 : diffMs;
    const days = Math.floor(clamped / 86400000);
    if (days < 1) {
      const hours = Math.max(1, Math.floor(clamped / 3600000));
      return `${hours}h`;
    }
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  }

  _formatDate(dateValue) {
    if (!dateValue) return '--';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  _formatDateTime(dateValue) {
    if (!dateValue) return '--';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  _buildMockBins(total, labels, fractions) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const bins = [];
    let allocated = 0;
    labels.forEach((label, index) => {
      const fraction = fractions[index] ?? 0;
      const count = index === labels.length - 1
        ? Math.max(0, safeTotal - allocated)
        : Math.round(safeTotal * fraction);
      allocated += count;
      bins.push({ label, count });
    });
    return bins;
  }

  _renderBarList(bins, { max = null } = {}) {
    const maxValue = max ?? Math.max(...bins.map((bin) => bin.count), 0);
    return html`
      <div class="space-y-2">
        ${bins.map((bin) => {
          const width = maxValue ? Math.round((bin.count / maxValue) * 100) : 0;
          return html`
            <div class="flex items-center gap-3">
              <div class="w-20 text-xs text-gray-500">${bin.label}</div>
              <div class="flex-1 bg-gray-100 rounded-full h-2">
                <div class="h-2 rounded-full bg-blue-500" style="width: ${width}%"></div>
              </div>
              <div class="w-12 text-xs text-gray-500 text-right">${formatStatNumber(bin.count)}</div>
            </div>
          `;
        })}
      </div>
    `;
  }

  render() {
    const imageCount = this.imageStats?.image_count || 0;
    const positiveTaggedAssetCount = Number.isFinite(this.imageStats?.positive_permatag_image_count)
      ? this.imageStats.positive_permatag_image_count
      : (this.imageStats?.tagged_image_count || 0);
    const coveragePct = imageCount ? Math.round((positiveTaggedAssetCount / imageCount) * 100) : 0;
    const assetsMostRecent = this.imageStats?.asset_newest || this.imageStats?.image_newest || null;

    const photoAgeBins = Array.isArray(this.imageStats?.photo_age_bins) && this.imageStats.photo_age_bins.length
      ? this.imageStats.photo_age_bins
      : this._buildMockBins(
        imageCount,
        ['0-6mo', '6-12mo', '1-2y', '2-5y', '5-10y', '10y+'],
        [0.14, 0.2, 0.24, 0.22, 0.12, 0.08]
      );

    const assetsRows = [
      { label: 'Total assets', value: formatStatNumber(imageCount) },
      {
        label: 'Most recent asset',
        value: html`<span class=${assetsMostRecent ? 'text-gray-900' : 'text-amber-700'}>${this._formatDateTime(assetsMostRecent)}</span>`,
      },
      {
        label: 'Tag Coverage',
        value: `${coveragePct}% (${formatStatNumber(positiveTaggedAssetCount)} / ${formatStatNumber(imageCount)})`,
      },
    ];

    return html`
      <div class="container home-insights-large">
        <div class="grid grid-cols-1 gap-3">
          ${renderPropertySection({
            title: 'Library Statistics',
            body: html`
              ${renderPropertyRows(assetsRows)}
              <div class="prop-content">
                <div class="text-[10px] font-semibold uppercase tracking-[0.03em] text-gray-500 mb-2">File Age Distribution</div>
                ${this._renderBarList(photoAgeBins)}
              </div>
            `,
          })}
        </div>
      </div>
    `;
  }
}

customElements.define('home-insights-tab', HomeInsightsTab);
