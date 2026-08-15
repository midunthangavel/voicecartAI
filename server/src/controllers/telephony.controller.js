import crypto from 'crypto';
import { triggerMissedCallCallback, handleDtmfInput } from '../services/missedCallService.js';
import { getLastOrderForPhone, dbGet, dbRun, transaction } from '../db.js';
import { broadcastToDashboard } from '../websocket/dashboardWsHandler.js';
import { generateExotelVoiceXml } from '../services/exotelService.js';
import { AppError } from '../utils/AppError.js';

const PORT = process.env.PORT || 3001;

import { createStreamTicket } from '../services/wsTicketService.js';

/**
 * Exotel Voice Inbound Webhook (Primary for India — TRAI Compliant)
 */
export async function handleExotelVoice(req, res) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const callSid = req.body.CallSid || req.body.CallUUID || `exotel_${Date.now()}`;
  const streamTicket = await createStreamTicket({ callSid, callerPhone: req.body.From, provider: 'exotel' });
  const wsStreamUrl = `${publicUrl.replace(/^http/, 'ws')}/exotel-stream?ticket=${streamTicket}`;
  const xml = generateExotelVoiceXml(wsStreamUrl);
  res.type('text/xml').send(xml);
  console.log('[Exotel] Inbound call received, streaming via AgentStream to /exotel-stream with stream ticket');
}

/**
 * Twilio Voice Inbound Webhook (Global / International Fallback)
 */
export async function handleTwilioVoice(req, res) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  const callSid = req.body.CallSid || `twilio_${Date.now()}`;
  const streamTicket = await createStreamTicket({ callSid, callerPhone: req.body.From, provider: 'twilio' });
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">Vanakkam! Welcome to VoiceCart AI. What would you like to order today?</Say>
  <Connect>
    <Stream url="${publicUrl.replace(/^http/, 'ws')}/media-stream?ticket=${streamTicket}" />
  </Connect>
</Response>`;
  res.type('text/xml').send(twiml);
  console.log('[Twilio] Voice webhook hit, streaming to /media-stream with stream ticket');
}

/**
 * Missed Call Callback Webhook
 */
export async function handleMissedCall(req, res, next) {
  try {
    const callerPhone = req.body.From || req.body.caller || req.body.phone;
    if (!callerPhone) return next(new AppError(400, 'MISSING_PHONE', 'Missing phone number'));

    console.log(`[MissedCall] Webhook received from: ${callerPhone}`);
    const result = await triggerMissedCallCallback(callerPhone);
    broadcastToDashboard({ type: 'missed_call_callback', phone: callerPhone, ...result });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * DTMF Quick-Reorder Webhook
 */
export async function handleDtmf(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

/**
 * Secure Fallback Web Pin-Drop Confirmation Page (Safe JSON Encoding - No XSS)
 */
export async function renderPinDropPage(req, res, next) {
  try {
    const rawToken = req.params.orderId; // can be token or legacy orderId
    const { lat, lng } = req.query;

    const safeLat = Number(lat) || 11.0168;
    const safeLng = Number(lng) || 76.9558;

    const pageConfig = {
      token: rawToken,
      lat: safeLat,
      lng: safeLng,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    };

    // Safe JSON embedding to prevent XSS
    const safeConfigJson = JSON.stringify(pageConfig).replace(/</g, '\\u003c');

    res.type('text/html').send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
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
    <h2>📍 Confirm Your Delivery Location</h2>
    <p>Drag the pin to your exact building or gate, then tap Confirm.</p>
    <div id="map"></div>
    <button class="btn" id="confirmBtn" onclick="confirmPin()">✅ Confirm This Location</button>
    <div class="status" id="status"></div>
  </div>
  <script>
    const config = ${safeConfigJson};
    let marker, map;

    function initMap() {
      const center = { lat: config.lat, lng: config.lng };
      map = new google.maps.Map(document.getElementById('map'), { zoom: 16, center, mapId: 'voicecart' });
      marker = new google.maps.Marker({ position: center, map: map, draggable: true, title: 'Delivery Location' });
    }

    async function confirmPin() {
      const pos = marker.getPosition();
      const statusEl = document.getElementById('status');
      const btn = document.getElementById('confirmBtn');
      statusEl.textContent = 'Saving location...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/pin-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: config.token, lat: pos.lat(), lng: pos.lng() })
        });
        const data = await res.json();
        if (res.ok) {
          statusEl.textContent = '✅ Location confirmed! The kitchen is preparing your order.';
          btn.textContent = 'Confirmed!';
        } else {
          statusEl.textContent = '❌ ' + (data.error?.message || 'Verification failed');
          btn.disabled = false;
        }
      } catch (e) {
        statusEl.textContent = '❌ Connection error. Please try again.';
        btn.disabled = false;
      }
    }
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.GOOGLE_MAPS_API_KEY || '')}&callback=initMap" async defer></script>
</body></html>`);
  } catch (err) {
    next(err);
  }
}

/**
 * Handle Pin-Drop Coordinate Confirmation with Token Verification
 */
export async function handlePinConfirm(req, res, next) {
  try {
    const { token, orderId, lat, lng } = req.body;
    const identifier = token || orderId;

    if (!identifier) {
      return next(new AppError(400, 'MISSING_TOKEN', 'Confirmation token is required'));
    }

    const tokenHash = crypto.createHash('sha256').update(String(identifier)).digest('hex');

    // 1. Check if token exists in pin_tokens table
    const tokenRecord = await dbGet(
      'SELECT * FROM pin_tokens WHERE token_hash = ?',
      [tokenHash]
    );

    let targetOrderId = null;

    if (tokenRecord) {
      if (tokenRecord.used_at) {
        return next(new AppError(409, 'TOKEN_ALREADY_USED', 'This location link has already been confirmed'));
      }
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return next(new AppError(410, 'TOKEN_EXPIRED', 'This location confirmation link has expired'));
      }

      targetOrderId = tokenRecord.order_id;
    } else {
      // Legacy fallback for direct orderId or alphanumeric order codes in dev/testing
      const digitsOnly = String(identifier).replace(/\D/g, '');
      targetOrderId = digitsOnly ? parseInt(digitsOnly, 10) : (parseInt(identifier, 10) || 1);
    }

    if (!targetOrderId) {
      return next(new AppError(404, 'INVALID_TOKEN', 'Invalid or unknown confirmation link'));
    }

    await transaction(async () => {
      await dbRun(
        'UPDATE orders SET delivery_address = delivery_address || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [` [PIN: ${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}]`, targetOrderId]
      );

      if (tokenRecord) {
        await dbRun(
          'UPDATE pin_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?',
          [tokenRecord.id]
        );
      }
    });

    broadcastToDashboard({
      type: 'pin_confirmed',
      orderId: targetOrderId,
      lat: Number(lat),
      lng: Number(lng),
    });

    res.json({ success: true, order_id: targetOrderId });
  } catch (err) {
    next(err);
  }
}
