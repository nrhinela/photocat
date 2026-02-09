import { css, html } from 'lit';

export const propertyGridStyles = css`
  .prop-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prop-section {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #ffffff;
    overflow: visible;
  }
  .prop-section-title {
    padding: 7px 9px;
    font-size: 9px;
    line-height: 1.2;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #6b7280;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
  }
  .prop-content {
    padding: 8px 9px;
  }
  .prop-rows {
    display: flex;
    flex-direction: column;
  }
  .prop-rows-scroll {
    max-height: 240px;
    overflow: auto;
  }
  .prop-row {
    display: grid;
    grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
    gap: 6px 10px;
    align-items: start;
    padding: 6px 9px;
    border-top: 1px solid #f1f5f9;
    font-size: 11px;
    color: #111827;
  }
  .prop-row:first-child {
    border-top: 0;
  }
  .prop-key {
    font-weight: 600;
    color: #4b5563;
  }
  .prop-value {
    min-width: 0;
    color: #111827;
    overflow-wrap: anywhere;
  }
  .prop-link {
    color: #2563eb;
    text-decoration: underline;
    text-underline-offset: 2px;
    overflow-wrap: anywhere;
  }
  .prop-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 9px;
    font-size: 10px;
    color: #6b7280;
  }
  @media (max-width: 760px) {
    .prop-row {
      grid-template-columns: 1fr;
    }
  }
`;

export function renderPropertyRows(rows, { scroll = false } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const rowsClass = scroll ? 'prop-rows prop-rows-scroll' : 'prop-rows';
  return html`
    <div class=${rowsClass}>
      ${safeRows.map((row) => html`
        <div class="prop-row">
          <div class="prop-key">${row.label ?? ''}</div>
          <div class="prop-value">${row.value ?? ''}</div>
        </div>
      `)}
    </div>
  `;
}

export function renderPropertySection({ title, rows = null, body = null, scroll = false }) {
  return html`
    <div class="prop-section">
      ${title ? html`<div class="prop-section-title">${title}</div>` : html``}
      ${body !== null ? html`<div class="prop-content">${body}</div>` : renderPropertyRows(rows, { scroll })}
    </div>
  `;
}
