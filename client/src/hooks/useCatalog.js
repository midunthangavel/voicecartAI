import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../services/apiClient';

const isLocal = typeof window !== 'undefined' &&
  (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('10.'));
const apiBase = isLocal ? '' : 'https://voicecartai.onrender.com';

/**
 * Custom Hook: Multi-Tenant Menu Catalog & Categories
 * 
 * Fetches categorized bilingual dishes, supports search by Tamil/English names,
 * and category filtering.
 */
export function useCatalog() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCatalogData = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsData, catsData] = await Promise.all([
        apiFetch(`${apiBase}/api/catalog`),
        apiFetch(`${apiBase}/api/categories`),
      ]);

      setItems(itemsData);
      setCategories(catsData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogData();
  }, [fetchCatalogData]);

  const addItem = useCallback(async (newItem) => {
    try {
      await apiFetch(`${apiBase}/api/catalog`, {
        method: 'POST',
        body: JSON.stringify(newItem),
      });
      fetchCatalogData();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [fetchCatalogData]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category Match
      if (selectedCategory !== 'all') {
        const catMatch =
          item.category_id === parseInt(selectedCategory, 10) ||
          item.category_name?.toLowerCase() === selectedCategory.toLowerCase() ||
          item.category?.toLowerCase() === selectedCategory.toLowerCase();
        if (!catMatch) return false;
      }

      // Dietary Filter
      if (dietaryFilter !== 'all') {
        if (item.dietary_tags !== dietaryFilter) return false;
      }

      // Search Query (English, Tamil, and Phonetic Hints)
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.name?.toLowerCase().includes(q);
        const tamilMatch = item.name_tamil?.toLowerCase().includes(q);
        const hintMatch = Array.isArray(item.stt_hints) && item.stt_hints.some(h => h.toLowerCase().includes(q));
        if (!nameMatch && !tamilMatch && !hintMatch) return false;
      }

      return true;
    });
  }, [items, selectedCategory, dietaryFilter, searchQuery]);

  return {
    items: filteredItems,
    allItems: items,
    categories,
    loading,
    error,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    dietaryFilter,
    setDietaryFilter,
    addItem,
    refreshCatalog: fetchCatalogData,
  };
}

export default useCatalog;
