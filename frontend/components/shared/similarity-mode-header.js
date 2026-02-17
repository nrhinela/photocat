import { html } from 'lit';

/**
 * Render a shared similarity-mode header for result panes.
 * Used in Search and Curate to avoid divergent UI treatments.
 */
export function renderSimilarityModeHeader({ onContinue } = {}) {
  const handleContinue = typeof onContinue === 'function' ? onContinue : null;
  return html`
    <div class="w-full flex items-center justify-between gap-3">
      <div class="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900">Similarity Results</div>
      ${handleContinue ? html`
        <button
          type="button"
          class="inline-flex items-center px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50"
          @click=${handleContinue}
        >
          Continue
        </button>
      ` : html``}
    </div>
  `;
}
