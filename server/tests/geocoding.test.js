import test from 'node:test';
import assert from 'node:assert/strict';
import { geocodeSpokenAddress, needsPinDrop, generatePinDropUrl } from '../src/services/geocodingService.js';

test('Geocoding Service: Landmark Matching (Coimbatore Fallback)', async () => {
  const result = await geocodeSpokenAddress('42 DB Road', 'Senthil Hospital', 'Coimbatore');
  
  assert.ok(result);
  assert.ok(result.latitude > 10.9 && result.latitude < 11.1);
  assert.ok(result.longitude > 76.8 && result.longitude < 77.1);
  assert.equal(result.confidence, 'MEDIUM');
  assert.ok(result.formatted_address.includes('Senthil Hospital'));
});

test('Geocoding Service: Unknown Address Fallback to City Center', async () => {
  const result = await geocodeSpokenAddress('Random Street 99', null, 'Coimbatore');
  
  assert.ok(result);
  assert.equal(result.confidence, 'LOW');
  assert.equal(needsPinDrop(result.confidence), true);
});

test('Geocoding Service: Pin Drop URL Generation', () => {
  const url = generatePinDropUrl('ORD-999', 11.0060, 76.9543);
  assert.ok(url.includes('/pin/ORD-999'));
  assert.ok(url.includes('lat=11.006'));
  assert.ok(url.includes('lng=76.9543'));
});
