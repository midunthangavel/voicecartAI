/**
 * Missed-Call Callback & DTMF Quick-Reorder Engine
 * 
 * - Triggers instant outbound Twilio call when a customer gives a missed call.
 * - Handles DTMF "Press 1" fast-path for instant repeat orders.
 * 
 * Falls back to mock console logging for development.
 */

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;

/**
 * Trigger an outbound call back to the customer after they give a missed call
 * @param {string} callerPhone - Customer phone (E.164 format)
 * @returns {Promise<{success, callSid}>}
 */
export async function triggerMissedCallCallback(callerPhone) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

  if (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid') {
    try {
      const { default: twilio } = await import('twilio');
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

      const call = await client.calls.create({
        to: callerPhone,
        from: TWILIO_PHONE_NUMBER,
        url: `${publicUrl}/voice`,   // Twilio fetches TwiML from our /voice endpoint
        statusCallback: `${publicUrl}/api/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      console.log(`[MissedCall] Callback initiated to ${callerPhone}: ${call.sid}`);
      return { success: true, callSid: call.sid };
    } catch (err) {
      console.error('[MissedCall] Twilio error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Mock callback for local development
  console.log(`[MissedCall] Mock callback triggered for: ${callerPhone}`);
  return { success: true, callSid: `mock_callback_${Date.now()}` };
}

/**
 * Generate TwiML for the DTMF quick-reorder IVR greeting
 * Plays a spoken greeting and listens for DTMF digit "1" to trigger instant reorder.
 * @param {string} callerPhone - For personalized greeting lookup
 * @returns {string} TwiML XML string
 */
export function generateDtmfGreetingTwiml(callerPhone) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${publicUrl}/api/telephony/dtmf" method="POST" timeout="4">
    <Say voice="Polly.Aditi" language="en-IN">
      Welcome to VoiceCart! Press 1 to instantly reorder your last meal, or stay on the line to place a new order.
    </Say>
  </Gather>
  <Connect>
    <Stream url="${publicUrl.replace('http', 'ws')}/media-stream" />
  </Connect>
</Response>`;
}

/**
 * Handle a DTMF digit press from the IVR
 * @param {string} digit - The DTMF digit pressed (e.g., "1")
 * @param {string} callerPhone - Customer phone (from Twilio request)
 * @returns {{ action: 'reorder' | 'continue', twiml?: string }}
 */
export function handleDtmfInput(digit, callerPhone) {
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

  if (digit === '1') {
    console.log(`[DTMF] Quick-reorder triggered by ${callerPhone}`);
    return {
      action: 'reorder',
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Great! Repeating your last order now. You will receive a confirmation SMS shortly.
  </Say>
  <Hangup />
</Response>`,
    };
  }

  // Any other digit or no digit → continue to voice AI
  return {
    action: 'continue',
    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${publicUrl.replace('http', 'ws')}/media-stream" />
  </Connect>
</Response>`,
  };
}
