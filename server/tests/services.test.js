import test from 'node:test';
import assert from 'node:assert/strict';
import { sendWhatsAppReceipt, sendWhatsAppPinDrop } from '../src/services/whatsappService.js';
import { triggerMissedCallCallback, handleDtmfInput, generateDtmfGreetingTwiml } from '../src/services/missedCallService.js';

test('WhatsApp Service: Receipt Message Generation', async () => {
  const result = await sendWhatsAppReceipt('+919876543210', {
    order_id: 'ORD-101',
    items: [{ name: 'Chicken Biryani', quantity: 2, price: 220 }],
    total: 440,
    delivery_address: '42 DB Road',
    landmark: 'Senthil Hospital',
  });

  assert.ok(result);
  assert.equal(result.success, true);
  assert.ok(result.sid.startsWith('mock_wa_') || result.sid.startsWith('SM') || result.sid.startsWith('MM'));
});

test('WhatsApp Service: Pin-Drop Request Generation', async () => {
  const result = await sendWhatsAppPinDrop('+919876543210', 'http://localhost:3001/pin/ORD-101');
  assert.ok(result);
  assert.equal(result.success, true);
});

test('Missed-Call Engine: Callback Trigger', async () => {
  const result = await triggerMissedCallCallback('+919876543210');
  assert.ok(result);
  assert.equal(result.success, true);
});

test('DTMF Service: Digit 1 Quick-Reorder Processing', () => {
  const result = handleDtmfInput('1', '+919876543210');
  assert.equal(result.action, 'reorder');
  assert.ok(result.twiml.includes('Repeating your last order'));
});

test('DTMF Service: Invalid / Skip Digit Processing', () => {
  const result = handleDtmfInput('9', '+919876543210');
  assert.equal(result.action, 'continue');
  assert.ok(result.twiml.includes('/media-stream'));
});

test('DTMF Service: TwiML IVR Greeting Generation', () => {
  const twiml = generateDtmfGreetingTwiml('+919876543210');
  assert.ok(twiml.includes('<Gather input="dtmf"'));
  assert.ok(twiml.includes('Press 1 to instantly reorder'));
});

test('STT Service: Universal Audio Buffer Transcription', async () => {
  const { transcribeAudioBuffer } = await import('../src/services/sttService.js');
  
  // Test with a mock binary audio buffer (e.g. simulated M4A audio)
  const dummyBuffer = Buffer.from('RIFF....WAVEfmt ....data....', 'utf-8');
  const result = await transcribeAudioBuffer(dummyBuffer, 'm4a', 'en');

  assert.ok(result);
  assert.ok(typeof result.transcript === 'string');
  assert.ok(result.transcript.length > 0);
  assert.ok(result.confidence > 0);
  assert.ok(result.provider);
});

test('TTS Service: Speech Synthesis and Audio Duration', async () => {
  const { synthesizeSpeech, getAudioDuration } = await import('../src/services/ttsService.js');
  
  const buffer = await synthesizeSpeech('Your order for Chicken Biryani is confirmed', 'en-IN');
  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 0);

  const duration = getAudioDuration(buffer);
  assert.ok(duration > 0);
});
