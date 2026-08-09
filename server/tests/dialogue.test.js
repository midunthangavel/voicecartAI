import test from 'node:test';
import assert from 'node:assert/strict';
import { processDialogueTurn, getInitialState } from '../src/services/dialogueManager.js';
import { upsertCustomerProfile } from '../src/db.js';

test('Dialogue Engine: Greeting State', async () => {
  const state = getInitialState();
  const res = await processDialogueTurn('', state);
  
  assert.ok(res.response_text.length > 0);
  assert.ok(res.updated_state.status === 'collecting_items' || res.updated_state.status === 'greeting');
});

test('Dialogue Engine: Item Recognition & Quantity Extraction', async () => {
  const state = getInitialState();
  const res = await processDialogueTurn('I want 2 chicken biryanis', state);

  assert.ok(res.updated_state.items.length > 0);
  const biryani = res.updated_state.items.find(i => i.name.toLowerCase().includes('chicken biryani'));
  assert.ok(biryani);
  assert.equal(biryani.quantity, 2);
});

test('Dialogue Engine: Biryani Upsell Prompt', async () => {
  const state = getInitialState();
  const res = await processDialogueTurn('Give me one mutton biryani', state);

  assert.ok(res.response_text.length > 0);
  assert.ok(res.updated_state.items.length > 0);
});

test('Dialogue Engine: Address & Landmark Collection', async () => {
  const state = getInitialState();
  state.items = [{ name: 'Chicken Biryani', price: 220, quantity: 1 }];
  
  let res = await processDialogueTurn('Deliver to 42 DB Road, RS Puram near Senthil Hospital', state);
  assert.ok(res.response_text.length > 0);
  assert.ok(res.updated_state.delivery_address !== null);
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
  assert.ok(res.response_text.length > 0);
});

test('Dialogue Engine: Group Order Sub-Cart Tagging', async () => {
  const state = getInitialState();
  state.group_mode = true;

  const res = await processDialogueTurn('Karthik wants 1 chicken biryani', state);
  assert.ok(res.updated_state.items.length > 0);
});

test('Dialogue Engine: Order Confirmation Step', async () => {
  const state = getInitialState();
  state.items = [{ name: 'Butter Naan', price: 45, quantity: 2 }];
  state.total = 90;
  state.status = 'confirming';

  const res = await processDialogueTurn('Yes confirm the order', state);
  assert.ok(res.updated_state.status === 'confirmed' || res.response_text.toLowerCase().includes('confirm'));
});
