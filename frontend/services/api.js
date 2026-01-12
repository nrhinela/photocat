const API_BASE_URL = 'http://localhost:8000/api/v1';

export async function getImages(tenantId, filters = {}) {
  const params = new URLSearchParams();

  if (filters.search) {
      // The backend doesn't seem to have a direct text search endpoint,
      // but the old frontend had a client-side search. We will add a 'keywords'
      // parameter for now, which is a deprecated feature of the API, but might work.
      params.append('keywords', filters.search);
  }

  if (filters.sort) {
    // The backend seems to sort by relevance score when keywords are provided,
    // and by ID desc otherwise. We will ignore this for now.
  }
  
  if (filters.date) {
    // The backend doesn't seem to have a date filter.
  }

  if (filters.keywords && Object.keys(filters.keywords).length > 0) {
      const categoryFilters = {};
      for (const [category, keywordsSet] of Object.entries(filters.keywords)) {
          if (keywordsSet.size > 0) {
              categoryFilters[category] = {
                  keywords: [...keywordsSet],
                  operator: filters.operators[category] || 'OR',
              };
          }
      }
      if (Object.keys(categoryFilters).length > 0) {
        params.append('category_filters', JSON.stringify(categoryFilters));
      }
  }


  const response = await fetch(`${API_BASE_URL}/images?${params.toString()}`, {
    headers: {
      'X-Tenant-ID': tenantId,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch images');
  }

  const data = await response.json();
  return data.images || [];
}

export async function getKeywords(tenantId) {
    const response = await fetch(`${API_BASE_URL}/keywords`, {
        headers: {
        'X-Tenant-ID': tenantId,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch keywords');
    }

    const data = await response.json();
    return data.keywords_by_category || {};
}

export async function getTenants() {
    const response = await fetch(`${API_BASE_URL}/tenants`);

    if (!response.ok) {
        throw new Error('Failed to fetch tenants');
    }

    const data = await response.json();
    return data || [];
}
