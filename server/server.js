/**
 * VoiceCart AI — Main Server Entry Point
 * 
 * Express HTTP server + WebSocket server handling:
 * 1. Twilio voice webhook (/voice) — returns TwiML for PSTN calls
 * 2. Twilio media stream (/media-stream) — WebSocket for Twilio audio
 * 3. Web audio stream (/web-stream) — WebSocket for browser simulator
 * 4. REST API — calls, orders, catalog, dashboard data
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

import { initDatabase, dbRun, dbGet, dbAll, saveCustomerAddress, upsertCustomerProfile, incrementCustomerOrders, getSavedAddresses, saveCallRecording } from './src/db.js';
import { mulawToPcm16, pcm16ToMulaw } from './src/utils/audioUtils.js';
import { createSttStream } from './src/services/sttService.js';
import { synthesizeSpeech, getAudioDuration } from './src/services/ttsService.js';
import { processDialogueTurn, getInitialState } from './src/services/dialogueManager.js';
import { placeOrder } from './src/services/ondcService.js';
import { createPaymentLink, sendOrderConfirmationSms } from './src/services/paymentService.js';
import { geocodeSpokenAddress, needsPinDrop, generatePinDropUrl } from './src/services/geocodingService.js';
import { sendWhatsAppReceipt, sendWhatsAppPinDrop } from './src/services/whatsappService.js';
import { triggerMissedCallCallback, handleDtmfInput, generateDtmfGreetingTwiml } from './src/services/missedCallService.js';
import { mkdirSync, writeFileSync, existsSync, createReadStream } from 'fs';
import { resolve as pathResolve } from 'path';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── In-memory session store (replace with Redis for production) ──
const sessions = new Map();
// ── Track connected dashboard clients for real-time updates ──
const dashboardClients = new Set();

// ── Ensure recordings directory exists ──
const RECORDINGS_DIR = pathResolve('.', 'recordings');
if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true });

// ══════════════════════════════════════════════
// ── Twilio Voice Webhook ──
// ══════════════════════════════════════════════
app.post('/voice', (req, res) => {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">Vanakkam! Welcome to VoiceCart AI. What would you like to order today?</Say>
  <Connect>
    <Stream url="${publicUrl.replace('http', 'ws')}/media-stream" />
  </Connect>
</Response>`;
  res.type('text/xml').send(twiml);
  console.log('[Twilio] Voice webhook hit, streaming to /media-stream');
});

// ══════════════════════════════════════════════
// ── REST API ──
// ══════════════════════════════════════════════

// Dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalCalls = await dbGet('SELECT COUNT(*) as count FROM calls');
    const activeCalls = await dbGet("SELECT COUNT(*) as count FROM calls WHERE status = 'active'");
    const totalOrders = await dbGet('SELECT COUNT(*) as count FROM orders');
    const confirmedOrders = await dbGet("SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'");
    const revenue = await dbGet("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'confirmed'");
    const avgLatency = await dbGet('SELECT COALESCE(AVG(latency_avg_ms), 0) as avg FROM calls WHERE latency_avg_ms > 0');
    res.json({
      total_calls: totalCalls?.count || 0,
      active_calls: activeCalls?.count || 0,
      total_orders: totalOrders?.count || 0,
      confirmed_orders: confirmedOrders?.count || 0,
      revenue: revenue?.total || 0,
      avg_latency_ms: Math.round(avgLatency?.avg || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent calls
app.get('/api/calls', async (req, res) => {
  try {
    const calls = await dbAll('SELECT * FROM calls ORDER BY started_at DESC LIMIT 50');
    res.json(calls.map(c => ({
      ...c,
      session_state: JSON.parse(c.session_state || '{}'),
      transcript: JSON.parse(c.transcript || '[]'),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Call detail + logs
app.get('/api/calls/:id', async (req, res) => {
  try {
    const call = await dbGet('SELECT * FROM calls WHERE id = ?', [req.params.id]);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    const logs = await dbAll('SELECT * FROM call_logs WHERE call_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({
      ...call,
      session_state: JSON.parse(call.session_state || '{}'),
      transcript: JSON.parse(call.transcript || '[]'),
      logs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await dbAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT 50');
    res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items || '[]') })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catalog
app.get('/api/catalog', async (req, res) => {
  try {
    const items = await dbAll('SELECT * FROM catalog ORDER BY category, name');
    res.json(items.map(i => ({
      ...i,
      variants: JSON.parse(i.variants || '{}'),
      stt_hints: JSON.parse(i.stt_hints || '[]'),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add catalog item
app.post('/api/catalog', async (req, res) => {
  try {
    const { merchant_id = 1, name, name_tamil, category, price, variants, stt_hints } = req.body;
    const result = await dbRun(
      'INSERT INTO catalog (merchant_id, name, name_tamil, category, price, variants, stt_hints) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [merchant_id, name, name_tamil || '', category || 'food', price, JSON.stringify(variants || {}), JSON.stringify(stt_hints || [])]
    );
    res.json({ id: result.lastID, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Merchants
app.get('/api/merchants', async (req, res) => {
  try {
    const merchants = await dbAll('SELECT * FROM merchants ORDER BY name');
    res.json(merchants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Active sessions (live)
app.get('/api/sessions', (req, res) => {
  const active = [];
  for (const [id, session] of sessions) {
    active.push({
      id,
      caller_phone: session.callerPhone || 'Browser',
      source: session.source,
      state: session.state,
      transcript: session.conversationHistory,
      startedAt: session.startedAt,
      latencies: session.latencies,
    });
  }
  res.json(active);
});

// ══════════════════════════════════════════════
// ── Missed-Call Callback Webhook ──
// ══════════════════════════════════════════════
app.post('/api/missed-call', async (req, res) => {
  const callerPhone = req.body.From || req.body.caller || req.body.phone;
  if (!callerPhone) return res.status(400).json({ error: 'Missing phone number' });

  console.log(`[MissedCall] Webhook received from: ${callerPhone}`);
  const result = await triggerMissedCallCallback(callerPhone);
  broadcastToDashboard({ type: 'missed_call_callback', phone: callerPhone, ...result });
  res.json(result);
});

// ══════════════════════════════════════════════
// ── DTMF Quick-Reorder Webhook ──
// ══════════════════════════════════════════════
app.post('/api/telephony/dtmf', async (req, res) => {
  const digit = req.body.Digits || req.body.digit;
  const callerPhone = req.body.From || req.body.Caller || '';
  console.log(`[DTMF] Digit pressed: ${digit} by ${callerPhone}`);

  const result = handleDtmfInput(digit, callerPhone);

  if (result.action === 'reorder' && callerPhone) {
    // Trigger instant reorder in background
    const { getLastOrderForPhone } = await import('./src/db.js');
    const lastOrder = await getLastOrderForPhone(callerPhone);
    if (lastOrder) {
      broadcastToDashboard({
        type: 'dtmf_reorder',
        phone: callerPhone,
        order: JSON.parse(lastOrder.items || '[]'),
        total: lastOrder.total_amount,
      });
    }
  }

  res.type('text/xml').send(result.twiml);
});

// ══════════════════════════════════════════════
// ── Call Recording Audio Stream ──
// ══════════════════════════════════════════════
app.get('/api/calls/:id/audio', async (req, res) => {
  try {
    const recording = await dbGet('SELECT * FROM call_recordings WHERE call_id = ?', [req.params.id]);
    if (!recording || !recording.audio_path) {
      return res.status(404).json({ error: 'No recording found for this call' });
    }
    const filePath = pathResolve(recording.audio_path);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Recording file not found' });
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="call_${req.params.id}.wav"`);
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// ── Pin-Drop Location Confirmation Page ──
// ══════════════════════════════════════════════
app.get('/pin/:orderId', (req, res) => {
  const { lat, lng } = req.query;
  const orderId = req.params.orderId;
  res.type('text/html').send(`<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirm Delivery Location — VoiceCart</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; background: #0f1117; color: #e0e0e0; }
    .container { max-width: 420px; margin: 0 auto; padding: 20px; text-align: center; }
    h2 { color: #34d399; margin-bottom: 8px; }
    p { color: #9ca3af; font-size: 14px; }
    #map { width: 100%; height: 350px; border-radius: 12px; margin: 16px 0; border: 2px solid #1f2937; }
    .btn { background: #34d399; color: #0f1117; border: none; padding: 14px 32px; border-radius: 8px;
           font-size: 16px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 12px; }
    .btn:active { background: #059669; }
    .status { margin-top: 16px; font-size: 13px; color: #6b7280; }
  </style>
</head><body>
  <div class="container">
    <h2>📍 Confirm Your Location</h2>
    <p>Drag the pin to your exact delivery spot, then tap Confirm.</p>
    <div id="map"></div>
    <button class="btn" onclick="confirmPin()">✅ Confirm This Location</button>
    <div class="status" id="status"></div>
  </div>
  <script>
    let marker, map;
    function initMap() {
      const center = { lat: ${lat || 11.0168}, lng: ${lng || 76.9558} };
      map = new google.maps.Map(document.getElementById('map'), { zoom: 16, center, mapId: 'voicecart' });
      marker = new google.maps.Marker({ position: center, map, draggable: true, title: 'Delivery Location' });
    }
    async function confirmPin() {
      const pos = marker.getPosition();
      document.getElementById('status').textContent = 'Confirming...';
      try {
        await fetch('/api/pin-confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: '${orderId}', lat: pos.lat(), lng: pos.lng() })
        });
        document.getElementById('status').textContent = '✅ Location confirmed! Your order is being dispatched.';
        document.querySelector('.btn').disabled = true;
        document.querySelector('.btn').textContent = 'Confirmed!';
      } catch (e) { document.getElementById('status').textContent = '❌ Error. Try again.'; }
    }
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY || ''}&callback=initMap" async defer></script>
</body></html>`);
});

app.post('/api/pin-confirm', async (req, res) => {
  const { orderId, lat, lng } = req.body;
  console.log(`[PinDrop] Confirmed: Order ${orderId} → ${lat}, ${lng}`);
  // Update the order's delivery coordinates
  try {
    await dbRun('UPDATE orders SET delivery_address = delivery_address || ? WHERE ondc_order_id = ? OR id = ?',
      [` [PIN: ${lat},${lng}]`, orderId, parseInt(orderId) || 0]);
    broadcastToDashboard({ type: 'pin_confirmed', orderId, lat, lng });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// ── HTTP + WebSocket Server ──
// ══════════════════════════════════════════════

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/media-stream' || pathname === '/web-stream' || pathname === '/dashboard-ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws, request) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/dashboard-ws') {
    handleDashboardConnection(ws);
  } else if (pathname === '/media-stream') {
    handleTwilioStream(ws);
  } else if (pathname === '/web-stream') {
    handleWebStream(ws);
  }
});

// ══════════════════════════════════════════════
// ── Dashboard WebSocket (Real-time Updates) ──
// ══════════════════════════════════════════════

function handleDashboardConnection(ws) {
  dashboardClients.add(ws);
  console.log('[Dashboard] Client connected');
  ws.on('close', () => dashboardClients.delete(ws));
}

function broadcastToDashboard(event) {
  const msg = JSON.stringify(event);
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ══════════════════════════════════════════════
// ── Twilio Media Stream Handler ──
// ══════════════════════════════════════════════

async function handleTwilioStream(ws) {
  let streamSid = null;
  let callSid = null;
  let sessionId = null;

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);

      switch (msg.event) {
        case 'connected':
          console.log('[Twilio] Stream connected');
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          sessionId = `twilio_${callSid}`;
          console.log(`[Twilio] Stream started: ${streamSid}, Call: ${callSid}`);

          await initSession(sessionId, {
            source: 'twilio',
            callerPhone: msg.start.customParameters?.callerPhone || 'unknown',
            ws,
            streamSid,
            callSid,
          });

          // Send greeting
          await sendGreeting(sessionId);
          break;

        case 'media':
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            const audioPayload = Buffer.from(msg.media.payload, 'base64');
            const pcmAudio = mulawToPcm16(audioPayload);
            session.sttStream?.write(pcmAudio);
          }
          break;

        case 'stop':
          console.log(`[Twilio] Stream stopped: ${streamSid}`);
          await endSession(sessionId);
          break;
      }
    } catch (err) {
      console.error('[Twilio] Message error:', err);
    }
  });

  ws.on('close', async () => {
    console.log('[Twilio] WebSocket closed');
    if (sessionId) await endSession(sessionId);
  });
}

// ══════════════════════════════════════════════
// ── Web Browser Audio Stream Handler ──
// ══════════════════════════════════════════════

async function handleWebStream(ws) {
  const sessionId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[Web] New browser session: ${sessionId}`);

  await initSession(sessionId, { source: 'web', ws });

  // Send greeting
  await sendGreeting(sessionId);

  ws.on('message', async (message) => {
    try {
      // Check if it's a control message (JSON) or audio data (binary)
      if (typeof message === 'string' || (message instanceof Buffer && message[0] === 0x7B)) {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'audio') {
          // Base64-encoded PCM audio from browser
          const session = sessions.get(sessionId);
          if (session?.sttStream) {
            const pcmAudio = Buffer.from(msg.data, 'base64');
            session.sttStream.write(pcmAudio);
          }
        } else if (msg.type === 'text') {
          // Direct text input (for testing without mic)
          await processUserInput(sessionId, msg.text);
        } else if (msg.type === 'end') {
          await endSession(sessionId);
        }
      } else {
        // Raw binary audio data (PCM16, 16kHz or 8kHz)
        const session = sessions.get(sessionId);
        if (session?.sttStream) {
          session.sttStream.write(message);
        }
      }
    } catch (err) {
      console.error('[Web] Message error:', err);
    }
  });

  ws.on('close', async () => {
    console.log(`[Web] Session ended: ${sessionId}`);
    await endSession(sessionId);
  });
}

// ══════════════════════════════════════════════
// ── Session Management ──
// ══════════════════════════════════════════════

async function initSession(sessionId, opts) {
  const state = getInitialState();

  // Create STT stream
  const sttStream = await createSttStream('en-IN');

  const session = {
    id: sessionId,
    source: opts.source,
    callerPhone: opts.callerPhone || 'Browser',
    ws: opts.ws,
    streamSid: opts.streamSid,
    callSid: opts.callSid,
    state,
    conversationHistory: [],
    sttStream,
    isProcessing: false,
    startedAt: new Date().toISOString(),
    latencies: [],
    audioChunks: [],  // Accumulate audio for dispute resolution recording
  };

  // Handle STT transcripts
  sttStream.onTranscript(async (result) => {
    // Send transcript to dashboard
    broadcastToDashboard({
      type: 'stt_transcript',
      sessionId,
      ...result,
    });

    // Send interim transcripts to browser client
    if (opts.source === 'web' && opts.ws.readyState === WebSocket.OPEN) {
      opts.ws.send(JSON.stringify({
        type: 'stt_transcript',
        ...result,
      }));
    }

    // Process final transcripts through dialogue manager
    if (result.isFinal && result.transcript.trim().length > 0) {
      await processUserInput(sessionId, result.transcript);
    }
  });

  sessions.set(sessionId, session);

  // Save to database
  try {
    const dbResult = await dbRun(
      'INSERT INTO calls (call_sid, caller_phone, source, status, session_state) VALUES (?, ?, ?, ?, ?)',
      [sessionId, session.callerPhone, opts.source, 'active', JSON.stringify(state)]
    );
    session.dbId = dbResult.lastID;
  } catch (err) {
    console.error('[Session] DB save error:', err.message);
  }

  // Ensure customer profile exists for returning caller features
  if (session.callerPhone && session.callerPhone !== 'Browser') {
    try {
      await upsertCustomerProfile({ phone: session.callerPhone });
    } catch {}
  }

  broadcastToDashboard({ type: 'call_started', sessionId, source: opts.source });
  return session;
}

async function sendGreeting(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Process an empty greeting turn
  const result = await processDialogueTurn('', session.state, session.conversationHistory);

  session.state = result.updated_state;
  session.conversationHistory.push({ role: 'assistant', text: result.response_text });

  // Send response
  await sendAudioResponse(sessionId, result.response_text, result.detected_language || 'en-IN');
}

async function processUserInput(sessionId, transcript) {
  const session = sessions.get(sessionId);
  if (!session || session.isProcessing) return;

  session.isProcessing = true;
  const turnStart = Date.now();

  try {
    // Log user input
    session.conversationHistory.push({ role: 'user', text: transcript });

    // Log to database
    if (session.dbId) {
      await dbRun(
        'INSERT INTO call_logs (call_id, event_type, direction, content) VALUES (?, ?, ?, ?)',
        [session.dbId, 'user_speech', 'inbound', transcript]
      );
    }

    broadcastToDashboard({
      type: 'user_speech',
      sessionId,
      transcript,
    });

    // Process through dialogue manager (pass callerPhone for returning-user context)
    const result = await processDialogueTurn(transcript, session.state, session.conversationHistory, session.callerPhone);

    session.state = result.updated_state;
    session.conversationHistory.push({ role: 'assistant', text: result.response_text });

    const dialogueLatency = result.latency_ms || (Date.now() - turnStart);
    session.latencies.push(dialogueLatency);

    // Log AI response
    if (session.dbId) {
      await dbRun(
        'INSERT INTO call_logs (call_id, event_type, direction, content, latency_ms) VALUES (?, ?, ?, ?, ?)',
        [session.dbId, 'ai_response', 'outbound', result.response_text, dialogueLatency]
      );
    }

    broadcastToDashboard({
      type: 'ai_response',
      sessionId,
      response_text: result.response_text,
      state: result.updated_state,
      latency_ms: dialogueLatency,
    });

    // Send audio response
    await sendAudioResponse(sessionId, result.response_text, result.detected_language || 'en-IN');

    // Update database
    if (session.dbId) {
      await dbRun(
        'UPDATE calls SET session_state = ?, transcript = ?, latency_avg_ms = ? WHERE id = ?',
        [
          JSON.stringify(session.state),
          JSON.stringify(session.conversationHistory),
          Math.round(session.latencies.reduce((a, b) => a + b, 0) / session.latencies.length),
          session.dbId,
        ]
      );
    }

    // ── Check if order is confirmed ──
    if (session.state.status === 'confirmed') {
      await handleOrderConfirmation(sessionId);
    }
  } catch (err) {
    console.error(`[Session ${sessionId}] Process error:`, err);
  } finally {
    session.isProcessing = false;
  }
}

async function sendAudioResponse(sessionId, text, language) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const ttsStart = Date.now();

  try {
    const audioBuffer = await synthesizeSpeech(text, language);
    const ttsLatency = Date.now() - ttsStart;

    broadcastToDashboard({
      type: 'tts_complete',
      sessionId,
      text,
      audio_duration: getAudioDuration(audioBuffer),
      latency_ms: ttsLatency,
    });

    if (session.source === 'twilio' && session.streamSid) {
      // Send as Twilio media message
      const payload = audioBuffer.toString('base64');
      const CHUNK_SIZE = 640; // 80ms at 8kHz
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        const chunk = audioBuffer.slice(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({
            event: 'media',
            streamSid: session.streamSid,
            media: { payload: chunk.toString('base64') },
          }));
        }
      }
    } else if (session.source === 'web') {
      // Send audio + text to browser
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'ai_response',
          text,
          audio: audioBuffer.toString('base64'),
          language,
          state: session.state,
          latency_ms: ttsLatency,
        }));
      }
    }
  } catch (err) {
    console.error(`[TTS] Error for session ${sessionId}:`, err.message);
    // Still send text response even if TTS fails
    if (session.ws.readyState === WebSocket.OPEN && session.source === 'web') {
      session.ws.send(JSON.stringify({
        type: 'ai_response',
        text,
        audio: null,
        language,
        state: session.state,
      }));
    }
  }
}

async function handleOrderConfirmation(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    // Geocode delivery address if landmark is present
    if (session.state.delivery_address && session.callerPhone !== 'Browser') {
      try {
        const geoResult = await geocodeSpokenAddress(
          session.state.delivery_address,
          session.state.landmark || null
        );
        if (geoResult) {
          await saveCustomerAddress({
            phone: session.callerPhone,
            label: 'Home',
            spoken_address: session.state.delivery_address,
            landmark: session.state.landmark || null,
            formatted_address: geoResult.formatted_address,
            latitude: geoResult.latitude,
            longitude: geoResult.longitude,
            is_default: 1,
          });

          // If low confidence, send pin-drop SMS/WhatsApp
          if (needsPinDrop(geoResult.confidence)) {
            const pinUrl = generatePinDropUrl(session.id, geoResult.latitude, geoResult.longitude);
            await sendWhatsAppPinDrop(session.callerPhone, pinUrl);
            console.log(`[PinDrop] Sent to ${session.callerPhone}: ${pinUrl}`);
          }
        }
      } catch (geoErr) {
        console.log('[Geocode] Address geocoding skipped:', geoErr.message);
      }
    }

    // Place order via ONDC/direct dispatch
    const orderResult = await placeOrder(session.state, session.callerPhone);

    if (orderResult.success) {
      // Generate payment link
      const paymentResult = await createPaymentLink(
        orderResult.order_id,
        orderResult.total,
        session.callerPhone
      );

      // Save order to database
      const dbResult = await dbRun(
        `INSERT INTO orders (call_id, caller_phone, items, total_amount, delivery_address, status, dispatch_mode, ondc_order_id, payment_link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.dbId,
          session.callerPhone,
          JSON.stringify(orderResult.items),
          orderResult.total,
          session.state.delivery_address || '',
          'confirmed',
          orderResult.dispatch_mode,
          orderResult.order_id,
          paymentResult.link_url,
        ]
      );

      // Send confirmation SMS
      await sendOrderConfirmationSms(
        session.callerPhone,
        orderResult.order_id,
        orderResult.total,
        orderResult.items,
        paymentResult.link_url
      );

      // Send WhatsApp visual receipt
      await sendWhatsAppReceipt(session.callerPhone, {
        order_id: orderResult.order_id,
        items: orderResult.items,
        total: orderResult.total,
        delivery_address: session.state.delivery_address,
        landmark: session.state.landmark,
      });

      // Update SMS sent status
      await dbRun('UPDATE orders SET sms_sent = 1 WHERE id = ?', [dbResult.lastID]);

      // Update customer profile order count
      if (session.callerPhone && session.callerPhone !== 'Browser') {
        await incrementCustomerOrders(session.callerPhone);
      }

      broadcastToDashboard({
        type: 'order_confirmed',
        sessionId,
        order: {
          id: dbResult.lastID,
          order_id: orderResult.order_id,
          items: orderResult.items,
          total: orderResult.total,
          dispatch_mode: orderResult.dispatch_mode,
          payment_link: paymentResult.link_url,
        },
      });

      console.log(`[Order] ✅ Confirmed: ${orderResult.order_id}, Total: ₹${orderResult.total}`);
    }
  } catch (err) {
    console.error('[Order] Confirmation error:', err.message);
  }
}

async function endSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // End STT stream
  session.sttStream?.end();

  // Save audio recording for dispute resolution
  if (session.dbId && session.audioChunks.length > 0) {
    try {
      const audioBuffer = Buffer.concat(session.audioChunks);
      const audioPath = pathResolve(RECORDINGS_DIR, `call_${session.dbId}.raw`);
      writeFileSync(audioPath, audioBuffer);

      const durationSeconds = Math.round(audioBuffer.length / (16000 * 2)); // 16kHz, 16-bit PCM
      const transcriptSummary = session.conversationHistory
        .map(t => `${t.role === 'user' ? '🎤' : '🤖'} ${t.text}`)
        .join(' | ');

      await saveCallRecording({
        call_id: session.dbId,
        call_sid: session.callSid || sessionId,
        audio_path: audioPath,
        duration_seconds: durationSeconds,
        transcript_summary: transcriptSummary.slice(0, 1000),
      });
      console.log(`[Recording] Saved: ${audioPath} (${durationSeconds}s)`);
    } catch (recErr) {
      console.error('[Recording] Save error:', recErr.message);
    }
  }

  // Update database
  if (session.dbId) {
    await dbRun(
      "UPDATE calls SET status = 'completed', ended_at = CURRENT_TIMESTAMP, duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER) WHERE id = ?",
      [session.dbId]
    );
  }

  sessions.delete(sessionId);
  broadcastToDashboard({ type: 'call_ended', sessionId });
  console.log(`[Session] Ended: ${sessionId}`);
}

// ══════════════════════════════════════════════
// ── Start Server ──
// ══════════════════════════════════════════════

async function start() {
  await initDatabase();
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║         🎙️  VoiceCart AI Server Running             ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  HTTP:        http://localhost:${PORT}                  ║`);
    console.log(`║  Twilio WS:   ws://localhost:${PORT}/media-stream       ║`);
    console.log(`║  Web Audio:   ws://localhost:${PORT}/web-stream         ║`);
    console.log(`║  Dashboard:   ws://localhost:${PORT}/dashboard-ws       ║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  API Endpoints:                                     ║');
    console.log('║    GET  /api/stats       Dashboard statistics       ║');
    console.log('║    GET  /api/calls       Recent calls               ║');
    console.log('║    GET  /api/orders      Recent orders              ║');
    console.log('║    GET  /api/catalog     Menu catalog               ║');
    console.log('║    GET  /api/sessions    Active voice sessions      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch(console.error);
