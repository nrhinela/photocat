import { LitElement, html } from 'lit';

export class RightPanel extends LitElement {
  createRenderRoot() {
    return this;
  }

  static properties = {
    tools: { type: Array },
    activeTool: { type: String },
  };

  constructor() {
    super();
    this.tools = [];
    this.activeTool = '';
  }

  firstUpdated() {
    this._syncSlots();
  }

  updated() {
    this._syncSlots();
  }

  _syncSlots() {
    const slottedNodes = Array.from(this.querySelectorAll('[slot]') || []);
    if (!slottedNodes.length) return;

    const slotMap = new Map();
    slottedNodes.forEach((node) => {
      const slotName = node.getAttribute('slot');
      if (!slotName) return;
      const list = slotMap.get(slotName) || [];
      list.push(node);
      slotMap.set(slotName, list);
    });

    const containers = Array.from(this.querySelectorAll('[data-slot]'));
    containers.forEach((container) => {
      const slotName = container.getAttribute('data-slot');
      const nodes = slotMap.get(slotName) || [];
      if (!nodes.length) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        return;
      }
      const keep = nodes[nodes.length - 1];
      nodes.forEach((node) => {
        if (node !== keep && node.parentElement) {
          node.remove();
        }
      });
      if (keep.parentElement !== container) {
        container.appendChild(keep);
      }
      slotMap.delete(slotName);
    });

    slotMap.forEach((nodes) => {
      nodes.forEach((node) => {
        if (node?.parentElement === this) {
          node.remove();
        }
      });
    });
  }

  _handleToolChange(tool) {
    this.dispatchEvent(new CustomEvent('tool-changed', {
      detail: { tool },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const tools = Array.isArray(this.tools) ? this.tools : [];
    const activeTool = this.activeTool || tools[0]?.id || '';
    return html`
        <div class="curate-pane utility-targets">
          <div class="curate-pane-header right-panel-header">
            <div class="curate-pane-header-row">
              ${tools.length ? html`
                <div class="curate-audit-toggle">
                ${tools.map((tool) => html`
                  <button
                    class=${activeTool === tool.id ? 'active' : ''}
                    @click=${() => this._handleToolChange(tool.id)}
                  >
                    ${tool.label || tool.id}
                  </button>
                `)}
              </div>
            ` : html``}
            <div data-slot="header-right"></div>
          </div>
        </div>
        <div class="curate-pane-body">
          ${tools.length ? tools.map((tool) => html`
            <div class=${activeTool === tool.id ? '' : 'hidden'}>
              <div data-slot=${`tool-${tool.id}`}></div>
            </div>
          `) : html`
            <div data-slot="default"></div>
          `}
        </div>
      </div>
    `;
  }
}

customElements.define('right-panel', RightPanel);
