/**
 * Multi-Tenant Seed Script
 * 
 * Seeds default tenant, Coimbatore restaurant, categories, and bilingual menu items with STT phrase hints.
 */

export async function seedDatabase(db) {
  // Check if tenant already seeded
  const existingTenant = await new Promise((resolve) => {
    db.get("SELECT id FROM tenants WHERE id = 't_annapoorna'", (err, row) => resolve(row));
  });

  if (existingTenant) {
    console.log('[Seed] Database already seeded. Skipping.');
    return;
  }

  console.log('[Seed] Seeding initial multi-tenant data for Coimbatore launch...');

  // 1. Seed Tenant
  await new Promise((resolve, reject) => {
    db.run(
      "INSERT OR IGNORE INTO tenants (id, name, slug) VALUES ('t_annapoorna', 'Annapoorna Group', 'annapoorna')",
      err => err ? reject(err) : resolve()
    );
  });

  // 2. Seed Restaurant
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO restaurants (id, tenant_id, name, phone, address) 
       VALUES ('r_coimbatore_01', 't_annapoorna', 'Sree Annapoorna - RS Puram', '+914222450000', 'DB Road, RS Puram, Coimbatore, Tamil Nadu 641002')`,
      err => err ? reject(err) : resolve()
    );
  });

  // 3. Seed Categories
  const categories = [
    { id: 1, name: 'Biryanis & Rice', name_tamil: 'பிரியாணி வகைகள்', sort_order: 1 },
    { id: 2, name: 'Tandoor & Breads', name_tamil: 'ரொட்டி மற்றும் நான்', sort_order: 2 },
    { id: 3, name: 'Curries & Gravies', name_tamil: 'மசாலா மற்றும் கிரேவி', sort_order: 3 },
    { id: 4, name: 'South Indian Specials', name_tamil: 'தென்னிந்திய ஸ்பெஷல்', sort_order: 4 },
    { id: 5, name: 'Beverages & Desserts', name_tamil: 'குளிர்பானங்கள்', sort_order: 5 },
  ];

  for (const cat of categories) {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO catalog_categories (id, restaurant_id, name, name_tamil, sort_order) 
         VALUES (?, 'r_coimbatore_01', ?, ?, ?)`,
        [cat.id, cat.name, cat.name_tamil, cat.sort_order],
        err => err ? reject(err) : resolve()
      );
    });
  }

  // 4. Seed Bilingual Menu Items
  const items = [
    {
      name: 'Chicken Biryani',
      name_tamil: 'சிக்கன் பிரியாணி',
      category_id: 1,
      price: 220,
      is_special: 1,
      dietary_tags: 'non-veg',
      stt_hints: ['chicken biryani', 'chicken biriyani', 'kozhi biryani', 'koli biryani', 'cb', 'dum biryani'],
    },
    {
      name: 'Mutton Biryani',
      name_tamil: 'ஆட்டு பிரியாணி',
      category_id: 1,
      price: 280,
      is_special: 1,
      dietary_tags: 'non-veg',
      stt_hints: ['mutton biryani', 'mutton biriyani', 'aatu biryani', 'goat biryani', 'mb'],
    },
    {
      name: 'Paneer Butter Masala',
      name_tamil: 'பன்னீர் பட்டர் மசாலா',
      category_id: 3,
      price: 180,
      is_special: 0,
      dietary_tags: 'veg',
      stt_hints: ['paneer butter masala', 'paneer butter', 'paneer masala', 'pbm', 'paneer gravy'],
    },
    {
      name: 'Butter Naan',
      name_tamil: 'பட்டர் நான்',
      category_id: 2,
      price: 45,
      is_special: 0,
      dietary_tags: 'veg',
      stt_hints: ['butter naan', 'naan', 'nan', 'roti'],
    },
    {
      name: 'Garlic Naan',
      name_tamil: 'பூண்டு நான்',
      category_id: 2,
      price: 55,
      is_special: 0,
      dietary_tags: 'veg',
      stt_hints: ['garlic naan', 'poondu naan', 'garlic nan'],
    },
    {
      name: 'Kothu Parotta',
      name_tamil: 'கொத்து பரோட்டா',
      category_id: 4,
      price: 150,
      is_special: 0,
      dietary_tags: 'non-veg',
      stt_hints: ['kothu parotta', 'kothu porotta', 'kothu', 'muttai kothu'],
    },
    {
      name: 'Chicken 65',
      name_tamil: 'சிக்கன் 65',
      category_id: 4,
      price: 160,
      is_special: 0,
      dietary_tags: 'non-veg',
      stt_hints: ['chicken 65', 'six five', 'kozhi 65'],
    },
    {
      name: 'Thums Up',
      name_tamil: 'தம்ஸ் அப்',
      category_id: 5,
      price: 40,
      is_special: 0,
      dietary_tags: 'veg',
      stt_hints: ['thums up', 'thumbs up', 'coke', 'pepsi', 'cool drink'],
    },
    {
      name: 'Masala Chai',
      name_tamil: 'மசாலா டீ',
      category_id: 5,
      price: 30,
      is_special: 0,
      dietary_tags: 'veg',
      stt_hints: ['masala chai', 'chai', 'tea', 'tea venum'],
    },
  ];

  for (const item of items) {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO catalog_items (restaurant_id, category_id, name, name_tamil, price, is_special, dietary_tags, stt_hints) 
         VALUES ('r_coimbatore_01', ?, ?, ?, ?, ?, ?, ?)`,
        [item.category_id, item.name, item.name_tamil, item.price, item.is_special, item.dietary_tags, JSON.stringify(item.stt_hints)],
        err => err ? reject(err) : resolve()
      );
    });
  }

  console.log('[Seed] Multi-tenant demo restaurant and menu seeded successfully!');
}
