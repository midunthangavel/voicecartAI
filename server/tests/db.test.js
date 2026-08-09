import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  initDatabase, dbRun, dbGet, dbAll, 
  upsertCustomerProfile, getCustomerProfile, incrementCustomerOrders,
  saveCustomerAddress, getSavedAddresses, getLastOrderForPhone, saveCallRecording
} from '../src/db.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEST_DB = resolve('./test_voicecart.db');

test.before(async () => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  process.env.DB_PATH = TEST_DB;
  await initDatabase();
});

test.after(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

test('DB Layer: Table Initialization & Seeding', async () => {
  const merchant = await dbGet('SELECT * FROM merchants LIMIT 1');
  assert.ok(merchant, 'Merchant should be seeded');
  assert.equal(merchant.name, 'Anbu Biryani House');

  const catalog = await dbAll('SELECT * FROM catalog');
  assert.ok(catalog.length >= 4, 'Catalog should contain seeded items');
});

test('DB Layer: Customer Profiles & Order Counters', async () => {
  const phone = '+919000000001';
  
  await upsertCustomerProfile({
    phone,
    name: 'Karthik Raja',
    dietary_preference: 'non-veg',
    preferred_language: 'ta-IN',
  });

  let profile = await getCustomerProfile(phone);
  assert.ok(profile);
  assert.equal(profile.name, 'Karthik Raja');

  const initialOrders = profile.total_orders || 0;
  await incrementCustomerOrders(phone);
  profile = await getCustomerProfile(phone);
  assert.equal(profile.total_orders, initialOrders + 1);
});

test('DB Layer: Address Saving & Landmark Retrieval', async () => {
  const phone = '+919000000002';
  
  await saveCustomerAddress({
    phone,
    label: 'Home',
    spoken_address: '42 DB Road, RS Puram',
    landmark: 'Senthil Hospital',
    formatted_address: '42 DB Road, RS Puram, Coimbatore',
    latitude: 11.0060,
    longitude: 76.9543,
    is_default: 1,
  });

  const addresses = await getSavedAddresses(phone);
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0].landmark, 'Senthil Hospital');
  assert.equal(addresses[0].latitude, 11.0060);
});

test('DB Layer: Last Order Lookup', async () => {
  const phone = '+919000000003';
  
  await dbRun(
    `INSERT INTO orders (call_id, caller_phone, items, total_amount, delivery_address, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [1, phone, JSON.stringify([{ name: 'Mutton Biryani', quantity: 1, price: 280 }]), 280, 'Peelamedu', 'confirmed']
  );

  const lastOrder = await getLastOrderForPhone(phone);
  assert.ok(lastOrder);
  assert.equal(lastOrder.total_amount, 280);
});

test('DB Layer: Call Recordings Persistence', async () => {
  const callSid = `CA_${Date.now()}_${Math.random()}`;
  const callRes = await dbRun('INSERT INTO calls (call_sid, caller_phone, source, status) VALUES (?, ?, ?, ?)',
    [callSid, '+919000000004', 'twilio', 'completed']);

  const recId = await saveCallRecording({
    call_id: callRes.lastID,
    call_sid: callSid,
    audio_path: './recordings/test.raw',
    duration_seconds: 45,
    transcript_summary: 'Ordered Biryani',
  });

  const rec = await dbGet('SELECT * FROM call_recordings WHERE call_id = ?', [callRes.lastID]);
  assert.ok(rec);
  assert.equal(rec.duration_seconds, 45);
});
