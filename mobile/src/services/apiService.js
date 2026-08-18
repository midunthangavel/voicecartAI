// REST API Service for Food Catalog & Branch Configuration

const getHttpBaseUrl = (serverWsUrl) => {
  return serverWsUrl
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/web-stream.*$/i, '');
};

export async function fetchMenuCatalog(serverUrl) {
  try {
    const baseUrl = getHttpBaseUrl(serverUrl);
    const res = await fetch(`${baseUrl}/api/catalog?tenant_id=t_annapoorna&restaurant_id=r_coimbatore_01`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.warn('[API] Catalog fetch fallback:', err.message);
    // Fallback default catalog if offline
    return [
      { id: 1, name: 'Chicken Biryani', name_tamil: 'சிக்கன் பிரியாணி', price: 220, category_name: 'Biryanis & Rice', dietary_tags: 'non-veg', available: 1, is_special: 1 },
      { id: 2, name: 'Mutton Biryani', name_tamil: 'ஆட்டு பிரியாணி', price: 280, category_name: 'Biryanis & Rice', dietary_tags: 'non-veg', available: 1, is_special: 1 },
      { id: 3, name: 'Paneer Butter Masala', name_tamil: 'பன்னீர் பட்டர் மசாலா', price: 180, category_name: 'Curries & Gravies', dietary_tags: 'veg', available: 1, is_special: 0 },
      { id: 4, name: 'Butter Naan', name_tamil: 'பட்டர் நான்', price: 45, category_name: 'Tandoor & Breads', dietary_tags: 'veg', available: 1, is_special: 0 },
      { id: 5, name: 'Garlic Naan', name_tamil: 'பூண்டு நான்', price: 55, category_name: 'Tandoor & Breads', dietary_tags: 'veg', available: 1, is_special: 0 },
      { id: 6, name: 'Kothu Parotta', name_tamil: 'கொத்து பரோட்டா', price: 150, category_name: 'South Indian Specials', dietary_tags: 'non-veg', available: 1, is_special: 0 },
      { id: 7, name: 'Chicken 65', name_tamil: 'சிக்கன் 65', price: 160, category_name: 'South Indian Specials', dietary_tags: 'non-veg', available: 1, is_special: 0 },
      { id: 8, name: 'Thums Up', name_tamil: 'தம்ஸ் அப்', price: 40, category_name: 'Beverages & Desserts', dietary_tags: 'veg', available: 1, is_special: 0 },
      { id: 9, name: 'Masala Chai', name_tamil: 'மசாலா டீ', price: 30, category_name: 'Beverages & Desserts', dietary_tags: 'veg', available: 1, is_special: 0 },
    ];
  }
}

export async function pingServerHealth(serverUrl) {
  try {
    const baseUrl = getHttpBaseUrl(serverUrl);
    const start = Date.now();
    const res = await fetch(`${baseUrl}/health/live`, { method: 'GET' });
    const latency = Date.now() - start;
    return { ok: res.ok, latency };
  } catch (err) {
    return { ok: false, latency: 0 };
  }
}
