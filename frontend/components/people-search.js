import { LitElement, html, css } from 'lit';
import { tailwind } from './tailwind-lit.js';

class PeopleSearch extends LitElement {
  static properties = {
    categories: { type: Array },
    people: { type: Array },
    selectedPeople: { type: Set },
    loading: { type: Boolean },
    error: { type: String },
    searchQuery: { type: String },
    selectedCategory: { type: String },
  };

  static styles = [tailwind, css`
    :host {
      display: block;
    }
    .container {
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
    .controls {
      display: flex;
      gap: 8px;
    }
    .search-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 12px;
    }
    .filter-select {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 12px;
      background: #ffffff;
    }
    .people-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    .person-item {
      display: flex;
      align-items: center;
      padding: 8px;
      background: #f9fafb;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .person-item:hover {
      background: #f3f4f6;
    }
    .person-item.selected {
      background: #dbeafe;
      border-left: 3px solid #3b82f6;
      padding-left: 5px;
    }
    .checkbox {
      margin-right: 8px;
      cursor: pointer;
    }
    .person-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .person-name {
      font-size: 12px;
      font-weight: 600;
      color: #111827;
    }
    .person-category {
      font-size: 11px;
      color: #6b7280;
    }
    .person-count {
      font-size: 11px;
      color: #9ca3af;
      margin-left: 8px;
    }
    .empty-state {
      text-align: center;
      padding: 24px;
      color: #6b7280;
      font-size: 12px;
    }
    .loading {
      text-align: center;
      padding: 16px;
      color: #6b7280;
      font-size: 12px;
    }
    .selected-count {
      font-size: 12px;
      color: #6b7280;
      padding: 8px 0;
      border-top: 1px solid #e5e7eb;
    }
  `];

  constructor() {
    super();
    this.categories = [];
    this.people = [];
    this.selectedPeople = new Set();
    this.loading = false;
    this.error = '';
    this.searchQuery = '';
    this.selectedCategory = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    try {
      await this.loadCategories();
      await this.loadPeople();
    } catch (err) {
      this.error = err.message || 'Failed to load data';
    } finally {
      this.loading = false;
    }
  }

  async loadCategories() {
    const tenantId = localStorage.getItem('tenantId') || 'default';
    const response = await fetch('/api/v1/config/people/categories', {
      headers: { 'X-Tenant-ID': tenantId }
    });
    if (!response.ok) throw new Error('Failed to load categories');
    this.categories = await response.json();
  }

  async loadPeople() {
    const tenantId = localStorage.getItem('tenantId') || 'default';
    const params = new URLSearchParams();
    if (this.selectedCategory) params.append('person_category', this.selectedCategory);
    params.append('limit', '500');

    const response = await fetch(`/api/v1/people?${params}`, {
      headers: { 'X-Tenant-ID': tenantId }
    });
    if (!response.ok) throw new Error('Failed to load people');
    let data = await response.json();

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      data = data.filter(p => p.name.toLowerCase().includes(query));
    }

    this.people = data;
  }

  togglePerson(personId) {
    if (this.selectedPeople.has(personId)) {
      this.selectedPeople.delete(personId);
    } else {
      this.selectedPeople.add(personId);
    }
    this.selectedPeople = new Set(this.selectedPeople);
    this.dispatchEvent(new CustomEvent('selection-changed', {
      detail: { selectedPeople: Array.from(this.selectedPeople) }
    }));
  }

  render() {
    return html`
      <div class="container">
        <div class="title">Search People</div>

        <div class="controls">
          <input
            type="text"
            class="search-input"
            placeholder="Search by name..."
            .value="${this.searchQuery}"
            @input="${(e) => { this.searchQuery = e.target.value; this.loadPeople(); }}"
          />
          <select
            class="filter-select"
            .value="${this.selectedCategory}"
            @change="${(e) => { this.selectedCategory = e.target.value; this.loadPeople(); }}"
          >
            <option value="">All Categories</option>
            ${this.categories.map(cat => html`
              <option value="${cat.name}">${cat.display_name}</option>
            `)}
          </select>
        </div>

        ${this.loading ? html`
          <div class="loading">Loading...</div>
        ` : this.people.length === 0 ? html`
          <div class="empty-state">No people found</div>
        ` : html`
          <div class="people-list">
            ${this.people.map(person => html`
              <div
                class="person-item ${this.selectedPeople.has(person.id) ? 'selected' : ''}"
                @click="${() => this.togglePerson(person.id)}"
              >
                <input
                  type="checkbox"
                  class="checkbox"
                  .checked="${this.selectedPeople.has(person.id)}"
                />
                <div class="person-info">
                  <div class="person-name">${person.name}</div>
                  <div class="person-category">${person.person_category}</div>
                </div>
                <div class="person-count">${person.tag_count || 0} tags</div>
              </div>
            `)}
          </div>
        `}

        ${this.selectedPeople.size > 0 ? html`
          <div class="selected-count">
            ✓ ${this.selectedPeople.size} person${this.selectedPeople.size !== 1 ? 's' : ''} selected
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('people-search', PeopleSearch);
