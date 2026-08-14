import React, { useState } from 'react';
import { BookOpen, Plus, RefreshCw, Tag, Star, Search, Filter } from 'lucide-react';
import { useCatalog } from '../hooks/useCatalog.js';

export default function CatalogManager() {
  const {
    items,
    categories,
    loading,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    dietaryFilter,
    setDietaryFilter,
    addItem,
    refreshCatalog,
  } = useCatalog();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    name_tamil: '',
    category_id: 1,
    price: '',
    stt_hints: '',
    dietary_tags: 'veg',
    is_special: false,
  });

  async function handleAdd(e) {
    e.preventDefault();
    const res = await addItem({
      ...newItem,
      category_id: parseInt(newItem.category_id, 10) || 1,
      price: parseFloat(newItem.price) || 0,
      stt_hints: newItem.stt_hints.split(',').map(s => s.trim()).filter(Boolean),
      is_special: newItem.is_special ? 1 : 0,
    });

    if (res.success) {
      setShowAddForm(false);
      setNewItem({ name: '', name_tamil: '', category_id: 1, price: '', stt_hints: '', dietary_tags: 'veg', is_special: false });
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Catalog & Speech Recognition Hints</h2>
          <p className="page-subtitle">Multi-tenant menu items, categories, dietary tags, and STT phrase matching hints</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={refreshCatalog}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="text-input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search dish in English, Tamil (சிக்கன்), or keywords..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'veg', 'non-veg'].map(tag => (
            <button
              key={tag}
              className={`btn btn-sm ${dietaryFilter === tag ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDietaryFilter(tag)}
            >
              {tag === 'all' ? 'All Diets' : tag.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          className={`btn btn-sm ${selectedCategory === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setSelectedCategory('all')}
        >
          All Categories
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`btn btn-sm ${selectedCategory === String(cat.id) ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedCategory(String(cat.id))}
          >
            {cat.name} {cat.name_tamil && `(${cat.name_tamil})`}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <span className="card-title">Add Menu Item</span>
          </div>
          <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name (English)</label>
              <input className="text-input" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Chicken Biryani" required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name (Tamil)</label>
              <input className="text-input" value={newItem.name_tamil} onChange={e => setNewItem({ ...newItem, name_tamil: e.target.value })} placeholder="சிக்கன் பிரியாணி" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Category</label>
              <select className="text-input" value={newItem.category_id} onChange={e => setNewItem({ ...newItem, category_id: e.target.value })}>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Price (₹)</label>
              <input className="text-input" type="number" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} placeholder="220" required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dietary Tag</label>
              <select className="text-input" value={newItem.dietary_tags} onChange={e => setNewItem({ ...newItem, dietary_tags: e.target.value })}>
                <option value="veg">Vegetarian (Veg)</option>
                <option value="non-veg">Non-Vegetarian</option>
                <option value="none">None / Standard</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>STT Phonetic Hints (comma-separated)</label>
              <input className="text-input" value={newItem.stt_hints} onChange={e => setNewItem({ ...newItem, stt_hints: e.target.value })} placeholder="cb, dum biryani, kozhi biriyani" />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={newItem.is_special} onChange={e => setNewItem({ ...newItem, is_special: e.target.checked })} />
                Mark as Daily Special ⭐
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary btn-sm">Save Menu Item</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Items Grid */}
      {items.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen className="empty-state-icon" />
            <h3>No menu items found</h3>
            <p>Try adjusting your search or category filter</p>
          </div>
        </div>
      ) : (
        <div className="catalog-grid">
          {items.map(item => (
            <div key={item.id} className="catalog-card">
              <div className="catalog-card-header">
                <div>
                  <div className="catalog-item-name">{item.name}</div>
                  {item.name_tamil && <div className="catalog-item-tamil">{item.name_tamil}</div>}
                </div>
                <div className="catalog-item-price">₹{item.price}</div>
              </div>

              <div className="catalog-tags">
                <span className={`catalog-category cat-${item.category || item.category_name?.toLowerCase() || 'food'}`}>
                  {item.category_name || item.category || 'General'}
                </span>
                {item.dietary_tags && item.dietary_tags !== 'none' && (
                  <span className={`dietary-badge ${item.dietary_tags}`}>
                    <Tag size={9} /> {item.dietary_tags}
                  </span>
                )}
                {item.is_special && (
                  <span className="dietary-badge special">
                    <Star size={9} /> Special
                  </span>
                )}
              </div>

              {item.stt_hints && item.stt_hints.length > 0 && (
                <div className="stt-hints-section">
                  <span className="stt-hints-label">STT Hints:</span>
                  <div className="stt-hints-list">
                    {(Array.isArray(item.stt_hints) ? item.stt_hints : []).map((hint, i) => (
                      <span key={i} className="stt-hint-pill">{hint}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
