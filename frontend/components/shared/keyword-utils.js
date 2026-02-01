/**
 * Keyword Utilities
 *
 * Shared utilities for working with keyword/category data structures
 * used in curate filtering and tagging workflows.
 */

/**
 * Group keywords by category with counts
 * @param {Object} tagStatsBySource - Tag statistics organized by source
 * @param {string} activeTagSource - Currently active tag source (e.g., 'permatags')
 * @returns {Array<[string, Array<{keyword: string, count: number}>]>} Array of [category, keywords] tuples sorted alphabetically
 */
export function getKeywordsByCategory(tagStatsBySource, activeTagSource = 'permatags') {
  const sourceStats = tagStatsBySource?.[activeTagSource] || tagStatsBySource?.permatags || {};
  const result = [];

  Object.entries(sourceStats).forEach(([category, keywords]) => {
    const categoryKeywords = (keywords || [])
      .map(kw => ({
        keyword: kw.keyword,
        count: kw.count || 0
      }))
      .sort((a, b) => a.keyword.localeCompare(b.keyword));

    if (categoryKeywords.length > 0) {
      result.push([category, categoryKeywords]);
    }
  });

  // Sort categories alphabetically
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Get total positive permatag count for a category
 * @param {Object} tagStatsBySource - Tag statistics organized by source
 * @param {string} category - Category name
 * @param {string} activeTagSource - Currently active tag source (e.g., 'permatags')
 * @returns {number} Total count for the category
 */
export function getCategoryCount(tagStatsBySource, category, activeTagSource = 'permatags') {
  const sourceStats = tagStatsBySource?.[activeTagSource] || tagStatsBySource?.permatags || {};
  const keywords = sourceStats[category] || [];
  return (keywords || []).reduce((sum, kw) => sum + (kw.count || 0), 0);
}

/**
 * Group a flat keyword list by category with counts
 * @param {Array<{keyword: string, category?: string, count?: number}>} keywords
 * @returns {Array<[string, Array<{keyword: string, count: number}>]>}
 */
export function getKeywordsByCategoryFromList(keywords = []) {
  const categoryMap = new Map();
  (keywords || []).forEach((kw) => {
    if (!kw?.keyword) return;
    const category = kw.category || 'Uncategorized';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category).push({
      keyword: kw.keyword,
      count: kw.count || 0,
    });
  });

  return Array.from(categoryMap.entries())
    .map(([category, items]) => [
      category,
      items.sort((a, b) => a.keyword.localeCompare(b.keyword)),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Get total keyword count for a category from a flat keyword list
 * @param {Array<{keyword: string, category?: string, count?: number}>} keywords
 * @param {string} category
 * @returns {number}
 */
export function getCategoryCountFromList(keywords = [], category) {
  return (keywords || []).reduce((sum, kw) => {
    if (!kw?.keyword) return sum;
    const kwCategory = kw.category || 'Uncategorized';
    if (kwCategory !== category) return sum;
    return sum + (kw.count || 0);
  }, 0);
}
