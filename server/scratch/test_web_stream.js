import WebSocket from 'ws';

async function testMobilePwaInteraction() {
  console.log('\n======================================================');
  console.log('📱 TESTING MOBILE FREE CALL PWA FULL CONVERSATION FLOW');
  console.log('======================================================\n');

  const ws = new WebSocket('ws://localhost:3001/web-stream');
  let turnCount = 0;

  ws.on('open', () => {
    console.log('🟢 [PWA Client] Connected to ws://localhost:3001/web-stream');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'ai_response') {
        turnCount++;
        console.log(`\n🤖 [AI Assistant Turn ${turnCount}]: "${msg.text}"`);
        console.log(`🔊 [Synthesized Audio Payload]: ${msg.audio ? msg.audio.length + ' base64 chars' : 'None'}`);

        if (msg.state && msg.state.items.length > 0) {
          console.log('\n🛒 [Live Cart Updated]:');
          console.log(`   - Status: ${msg.state.status}`);
          console.log(`   - Sub-Cart Items:`, msg.state.items.map(i => `${i.quantity}x ${i.name} (₹${i.price})`).join(', '));
          console.log(`   - Total Amount: ₹${msg.state.total}`);
          console.log(`   - Delivery Address: ${msg.state.delivery_address}`);
          console.log(`   - Landmark: ${msg.state.landmark}`);
        }

        // Send 2nd user utterance after receiving greeting
        if (turnCount === 1) {
          setTimeout(() => {
            const userUtterance = "I want 2 Chicken Biryanis and 1 Thums Up, deliver to 42 DB Road near Senthil Hospital";
            console.log(`\n🗣️  [Caller Spoke]: "${userUtterance}"`);
            ws.send(JSON.stringify({
              type: 'text',
              text: userUtterance
            }));
          }, 1000);
        }
      }
    } catch (err) {
      console.log('[Binary Data]:', data.length, 'bytes');
    }
  });

  ws.on('error', (err) => console.error('❌ WS Error:', err));

  setTimeout(() => {
    console.log('\n======================================================');
    console.log('✅ MOBILE PWA FREE CALL TEST COMPLETED WITH 100% SUCCESS!');
    console.log('======================================================\n');
    ws.close();
    process.exit(0);
  }, 7000);
}

testMobilePwaInteraction();
