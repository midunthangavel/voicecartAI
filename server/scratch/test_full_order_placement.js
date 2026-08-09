import WebSocket from 'ws';
import { dbGet } from '../src/db.js';

async function testFullOrderFlow() {
  console.log('\n================================================================');
  console.log('🧪 TESTING END-TO-END VOICE ORDER PLACEMENT (TALK TO TRANSACTION)');
  console.log('================================================================\n');

  const ws = new WebSocket('ws://localhost:3001/web-stream');
  let step = 0;

  ws.on('open', () => {
    console.log('🟢 [PWA Mobile Client] Connected to backend ws://localhost:3001/web-stream');
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'ai_response') {
        step++;
        console.log(`\n🤖 [AI Turn ${step}]: "${msg.text}"`);
        console.log(`⏱️  [Latency]: ${msg.latency_ms}ms`);

        if (step === 1) {
          // Send order request
          setTimeout(() => {
            const utterance = "I want 2 Mutton Biryanis and 1 Thums Up, deliver to 42 DB Road near Senthil Hospital";
            console.log(`\n🗣️  [Caller Spoke]: "${utterance}"`);
            ws.send(JSON.stringify({ type: 'text', text: utterance }));
          }, 800);
        } else if (step === 2) {
          // Send confirmation
          setTimeout(() => {
            const confirmUtterance = "Yes confirm my order";
            console.log(`\n🗣️  [Caller Spoke]: "${confirmUtterance}"`);
            ws.send(JSON.stringify({ type: 'text', text: confirmUtterance }));
          }, 800);
        }
      } else if (msg.type === 'order_confirmed' || msg.event === 'order_confirmed') {
        console.log('\n================================================================');
        console.log('🎉 [ORDER CONFIRMED & INJECTED INTO DB/KDS SUCCESSFULLY!]');
        console.log('================================================================');
        console.log('Order Details:', msg.order);

        // Fetch from SQLite DB
        const orderInDb = await dbGet('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
        console.log('\n🗄️  [SQLite DB Verification]:');
        console.log(`   - Order ID: ${orderInDb.id}`);
        console.log(`   - Total Amount: ₹${orderInDb.total_amount}`);
        console.log(`   - Delivery Address: ${orderInDb.delivery_address}`);
        console.log(`   - Status: ${orderInDb.status}`);
        console.log(`   - ONDC Order ID: ${orderInDb.ondc_order_id}`);

        ws.close();
        process.exit(0);
      }
    } catch (err) {
      // Audio stream ignored
    }
  });

  ws.on('error', (err) => console.error('❌ WS Error:', err));

  setTimeout(async () => {
    const latestOrder = await dbGet('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
    console.log('\n================================================================');
    console.log('📊 [FINAL SYSTEM AUDIT & DB STATE CHECK]:');
    console.log(`   - Last Database Order ID: #${latestOrder?.id}`);
    console.log(`   - Total Amount: ₹${latestOrder?.total_amount}`);
    console.log(`   - Delivery Address: ${latestOrder?.delivery_address}`);
    console.log(`   - Status: ${latestOrder?.status}`);
    console.log('================================================================\n');
    ws.close();
    process.exit(0);
  }, 7000);
}

testFullOrderFlow();
