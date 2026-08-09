import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, RefreshCw, Tag, Star } from 'lucide-react';

export default function CatalogManager() {
  const [catalog, setCatalog] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '', name_tamil: '', category: 'food', price: '', stt_hints: '', dietary_tags: 'veg', is_special: false,
  });

  useEffect(() => {
    fetchCatalog();
  }, []);

  async function fetchCatalog() {
    try {
      const res = await fetch('/api/catalog');
      if (res.ok) setCatalog(await res.json());
    } catch {}
  }

  async function addItem(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          price: parseFloat(newItem.price) || 0,
          stt_hints: newItem.stt_hints.split(',').map(s => s.trim()).filter(Boolean),
          dietary_tags: newItem.dietary_tags.split(',').map(s => s.trim()).filter(Boolean),
          is_special: newItem.is_special ? 1 : 0,
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewItem({ name: '', name_tamil: '', category: 'food', price: '', stt_hints: '', dietary_tags: 'veg', is_special: false });
        fetchCatalog();
      }
    } catch (err) {
      console.error('Add item error:', err);
    }
  }

  const categoryClass = (cat) => `catalog-category cat-${cat}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Catalog & STT Hints</h2>
          <p className="page-subtitle">Manage menu items, dietary tags, daily specials, and phonetic phrase hints</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchCatalog}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <span className="card-title">Add Menu Item</span>
          </div>
          <form onSubmit={addItem} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
              <select className="text-input" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
                <option value="biryani">Biryani</option>
                <option value="curry">Curry</option>
                <option value="bread">Bread</option>
                <option value="main">Main</option>
                <option value="starter">Starter</option>
                <option value="beverage">Beverage</option>
                <option value="dessert">Dessert</option>
                <option value="food">Other Food</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Price (₹)</label>
              <input className="text-input" type="number" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} placeholder="220" required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dietary Tags (comma-separated)</label>
              <input className="text-input" value={newItem.dietary_tags} onChange={e => setNewItem({ ...newItem, dietary_tags: e.target.value })} placeholder="non-veg, halal, gluten-free" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
              <input type="checkbox" id="is_special" checked={newItem.is_special} onChange={e => setNewItem({ ...newItem, is_special: e.target.checked })} />
              <label htmlFor="is_special" style={{ fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Star size={14} color="var(--accent-amber)" /> Mark as Today's Special
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                STT Phrase Hints <span style={{ color: 'var(--text-muted)' }}>(comma-separated alternative spellings / pronunciations)</span>
              </label>
              <input className="text-input" value={newItem.stt_hints} onChange={e => setNewItem({ ...newItem, stt_hints: e.target.value })} placeholder="chicken biryani, chiken biriyani, kozhi biryani" />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm">Add to Menu</button>
            </div>
          </form>
        </div>
      )}

      {/* Catalog Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Menu Items</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{catalog.length} items</span>
        </div>

        {catalog.length === 0 ? (
          <div className="empty-state">
            <BookOpen className="empty-state-icon" />
            <h3>Catalog empty</h3>
            <p>Start the backend server to load the demo catalog with seeded menu items</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tamil</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Dietary / Special</th>
                  <th>STT Hints</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>
                      {item.name}
                      {item.is_special ? <Star size={12} color="var(--accent-amber)" style={{ marginLeft: '4px', verticalAlign: 'middle' }} title="Today's Special" /> : null}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{item.name_tamil || '—'}</td>
                    <td>
                      <span className={categoryClass(item.category)}>{item.category}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>₹{item.price}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(Array.isArray(item.dietary_tags) ? item.dietary_tags : JSON.parse(item.dietary_tags || '[]')).map((tag, i) => (
                          <span key={i} style={{
                            fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px',
                            background: tag.includes('non-veg') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: tag.includes('non-veg') ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                            fontWeight: 600,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="catalog-hints">
                        {(item.stt_hints || []).map((hint, i) => (
                          <span key={i} className="catalog-hint-tag">{hint}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`slot-status ${item.available ? 'confirmed' : 'greeting'}`}>
                        {item.available ? 'Active' : 'Off'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
