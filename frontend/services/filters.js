/**
 * Filter UI state management helpers.
 *
 * These functions manage UI-state for filters and construct API query parameters.
 * All actual data filtering happens server-side in the API.
 * This prevents data inconsistency between client and server.
 */

/**
 * Build query parameters from filter UI state.
 * Does NOT filter data - only builds URL params for API request.
 *
 * @param {Object} filters - Current filter state
 * @returns {Object} - Query parameters object
 */
export function buildFilterQuery(filters) {
  const params = {};

  // Add all filter values, skipping empty/undefined
  if (filters.keywords && filters.keywords.length > 0) {
    params.keywords = filters.keywords.join(',');
  }
  if (filters.category) {
    params.category = filters.category;
  }
  if (filters.minRating !== undefined && filters.minRating !== null && filters.minRating !== '') {
    params.minRating = filters.minRating;
  }
  if (filters.maxRating !== undefined && filters.maxRating !== null && filters.maxRating !== '') {
    params.maxRating = filters.maxRating;
  }
  if (filters.listId) {
    params.listId = filters.listId;
  }
  if (filters.reviewed !== undefined && filters.reviewed !== null) {
    params.reviewed = filters.reviewed;
  }
  if (filters.hideZeroRating) {
    params.hideZeroRating = true;
  }

  return params;
}

/**
 * Provide default filter state for UI.
 *
 * @returns {Object} - Default filter state
 */
export function resetFilterState() {
  return {
    keywords: [],
    category: '',
    minRating: 0,
    maxRating: 5,
    listId: null,
    reviewed: undefined,
    hideZeroRating: false,
    sortBy: 'date_desc',
    pageSize: 50,
    currentPage: 1,
  };
}

/**
 * Immutable filter state update.
 * Returns new state object without mutating the original.
 *
 * @param {Object} current - Current filter state
 * @param {string} field - Field to update
 * @param {*} value - New value
 * @returns {Object} - New filter state
 */
export function updateFilterState(current, field, value) {
  return {
    ...current,
    [field]: value,
  };
}

/**
 * Add keyword to filter state.
 * Maintains immutability by returning new arrays.
 *
 * @param {Object} current - Current filter state
 * @param {string} keyword - Keyword to add
 * @returns {Object} - New filter state with keyword added
 */
export function addKeywordFilter(current, keyword) {
  if (current.keywords.includes(keyword)) {
    return current; // Already exists
  }
  return {
    ...current,
    keywords: [...current.keywords, keyword],
  };
}

/**
 * Remove keyword from filter state.
 *
 * @param {Object} current - Current filter state
 * @param {string} keyword - Keyword to remove
 * @returns {Object} - New filter state with keyword removed
 */
export function removeKeywordFilter(current, keyword) {
  return {
    ...current,
    keywords: current.keywords.filter(k => k !== keyword),
  };
}

/**
 * Clear all filters.
 *
 * @param {Object} current - Current filter state
 * @returns {Object} - Reset filter state
 */
export function clearAllFilters(current) {
  return {
    ...current,
    ...resetFilterState(),
  };
}

/**
 * Check if any filters are active.
 *
 * @param {Object} filters - Filter state
 * @returns {boolean} - True if any filters are active
 */
export function hasActiveFilters(filters) {
  return (
    (filters.keywords && filters.keywords.length > 0) ||
    filters.category ||
    filters.minRating > 0 ||
    filters.maxRating < 5 ||
    filters.listId ||
    filters.reviewed !== undefined ||
    filters.hideZeroRating
  );
}
