import test from 'node:test';
import assert from 'node:assert/strict';
import { processDialogueTurn, getInitialState } from '../src/services/dialogueManager.js';
import { upsertCustomerProfile } from '../src/db.js';

test('Dialogue Engine: Greeting State', async () => {
  const state = getInitialState();
  const res = await processDialogueTurn('', state);
  
  assert.ok(res.response_text.includes('Vanakkam') || res.response_text.includes('Welcome'));
  assert.equal(res.updated_state.status, 'collecting_items');
});

test('Dialogue Engine: Item Recognition & Quantity Extraction', async () => {
  const state = getInitialState();
  const res = await processDialogueTurn('I want 2 chicken biryanis', state);

  const biryani = res.updated_state.items.find(i => i.name === 'Chicken Biryani');
  assert.ok(biryani);
  assert.equal(biryani.quantity, 2);
  assert.equal(res.updated_state.total, 440); // 2 * 220
});

test('Dialogue Engine: Biryani Upsell Prompt', async () => {
  const state = getInitialState();
  const res = await processDialogueTurn('Give me one mutton biryani', state);

  assert.ok(res.response_text.toLowerCase().includes('thums up') || res.response_text.toLowerCase().includes('masala chai'));
});

test('Dialogue Engine: Address & Landmark Collection', async () => {
  const state = getInitialState();
  state.items = [{ name: 'Chicken Biryani', price: 220, quantity: 1 }];
  
  // No landmark -> prompts for landmark
  let res = await processDialogueTurn('Deliver to 42 DB Road, RS Puram', state);
  assert.ok(res.response_text.includes('landmark'));
  assert.equal(res.updated_state.delivery_address, 'Deliver to 42 DB Road, RS Puram');

  // Provides landmark
  res = await processDialogueTurn('Near Senthil Hospital', res.updated_state);
  assert.equal(res.updated_state.landmark, 'Near Senthil Hospital');
});

test('Dialogue Engine: Dietary Preference Safeguard Warning', async () => {
  const phone = '+919999888777';
  await upsertCustomerProfile({
    phone,
    name: 'Priya',
    dietary_preference: 'veg',
  });

  const state = getInitialState();
  const res = await processDialogueTurn('Add one chicken biryani', state, [], phone);
  assert.ok(res.response_text.toLowerCase().includes('non-veg') || res.response_text.toLowerCase().includes('veg'));
});

test('Dialogue Engine: Group Order Sub-Cart Tagging', async () => {
  const state = getInitialState();
  state.group_mode = true;

  const res = await processDialogueTurn('Karthik wants 1 chicken biryani', state);
  const item = res.updated_state.items[0];

  assert.ok(item);
  assert.equal(item.person.toLowerCase(), 'karthik');
});

test('Dialogue Engine: Order Confirmation Step', async () => {
  const state = getInitialState();
  state.items = [{ name: 'Butter Naan', price: 45, quantity: 2 }];
  state.total = 90;
  state.status = 'confirming';

  const res = await processDialogueTurn('Yes confirm the order', state);
  assert.equal(res.updated_state.status, 'confirmed');
  assert.ok(res.response_text.includes('confirmed') || res.response_text.includes('payment link'));
});
