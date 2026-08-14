import { triggerMissedCallCallback, handleDtmfInput } from '../services/missedCallService.js';
import { getLastOrderForPhone, dbRun } from '../db.js';
import { broadcastToDashboard } from '../websocket/dashboardWsHandler.js';
import { generateExotelVoiceXml } from '../services/exotelService.js';

const PORT = process.env.PORT || 3001;

/**
 * Exotel Voice Inbound Webhook (Primary for India — TRAI Compliant)
 */
export function handleExotelVoice(req, res) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const wsStreamUrl = `${publicUrl.replace(/^http/, 'ws')}/exotel-stream`;
  const xml = generateExotelVoiceXml(wsStreamUrl);
  res.type('text/xml').send(xml);
  console.log('[Exotel] Inbound call received, streaming via AgentStream to /exotel-stream');
}

/**
 * Twilio Voice Inbound Webhook (Global / International Fallback)
 */
export function handleTwilioVoice(req, res) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">Vanakkam! Welcome to VoiceCart AI. What would you like to order today?</Say>
  <Connect>
    <Stream url="${publicUrl.replace(/^http/, 'ws')}/media-stream" />
  </Connect>
</Response>`;
  res.type('text/xml').send(twiml);
  console.log('[Twilio] Voice webhook hit, streaming to /media-stream');
}

/**
 * Missed Call Callback Webhook
 */
export async function handleMissedCall(req, res) {
  const callerPhone = req.body.From || req.body.caller || req.body.phone;
  if (!callerPhone) return res.status(400).json({ error: 'Missing phone number' });

  console.log(`[MissedCall] Webhook received from: ${callerPhone}`);
  const result = await triggerMissedCallCallback(callerPhone);
  broadcastToDashboard({ type: 'missed_call_callback', phone: callerPhone, ...result });
  res.json(result);
}

/**
 * DTMF Quick-Reorder Webhook
 */
export async function handleDtmf(req, res) {
  const digit = req.body.Digits || req.body.digit;
  const callerPhone = req.body.From || req.body.Caller || '';
  console.log(`[DTMF] Digit pressed: ${digit} by ${callerPhone}`);

  const result = handleDtmfInput(digit, callerPhone);

  if (result.action === 'reorder' && callerPhone) {
    const lastOrder = await getLastOrderForPhone(callerPhone);
    if (lastOrder) {
      broadcastToDashboard({
        type: 'dtmf_reorder',
        phone: callerPhone,
        order: typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items || '[]') : (lastOrder.items || []),
        total: lastOrder.total_amount,
      });
    }
  }

  res.type('text/xml').send(result.twiml);
}

/**
 * Fallback Web Pin-Drop Confirmation Page (HTML)
 */
export function renderPinDropPage(req, res) {
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
}

/**
 * Handle Pin-Drop Coordinate Confirmation
 */
export async function handlePinConfirm(req, res) {
  const { orderId, lat, lng } = req.body;
  console.log(`[PinDrop] Confirmed: Order ${orderId} → ${lat}, ${lng}`);
  try {
    await dbRun(
      'UPDATE orders SET delivery_address = delivery_address || ? WHERE ondc_order_id = ? OR id = ?',
      [` [PIN: ${lat},${lng}]`, orderId, parseInt(orderId, 10) || 0]
    );
    broadcastToDashboard({ type: 'pin_confirmed', orderId, lat, lng });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
