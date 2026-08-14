/**
 * Exotel Indian Cloud Telephony Service (TRAI Compliant)
 * 
 * Provides VoiceXML bi-directional stream generation, outbound call triggering,
 * and webhook payload parsing for domestic Indian phone numbers.
 */

const EXOTEL_SID = process.env.EXOTEL_SID || 'mock_exotel_sid';
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY || 'mock_exotel_key';
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN || 'mock_exotel_token';
const EXOTEL_SUB_DOMAIN = process.env.EXOTEL_SUB_DOMAIN || 'api.exotel.com';
const EXOTEL_CALLER_ID = process.env.EXOTEL_CALLER_ID || '04223500000'; // Default Coimbatore DID

/**
 * Generate Exotel VoiceXML for AgentStream bi-directional WebSocket connection
 */
export function generateExotelVoiceXml(streamUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream url="${streamUrl}" bidirectional="true" format="pcm" rate="8000" />
</Response>`;
}

/**
 * Generate Exotel TwiML-compatible fallback XML
 */
export function generateExotelGreetingXml(greetingText, streamUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="woman" language="en-IN">${greetingText}</Say>
    <Stream url="${streamUrl}" bidirectional="true" />
</Response>`;
}

/**
 * Trigger an outbound call to an Indian customer (e.g. for missed-call reorders)
 */
export async function triggerExotelOutboundCall({ toPhone, customUrl, callerId = EXOTEL_CALLER_ID }) {
  if (!process.env.EXOTEL_API_KEY || process.env.EXOTEL_API_KEY === 'mock_exotel_key') {
    console.log(`[Exotel] (Mock Mode) Triggered outbound call to ${toPhone} with caller ID ${callerId}`);
    return {
      success: true,
      callSid: `exotel_mock_${Date.now()}`,
      status: 'queued',
    };
  }

  const endpoint = `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}@${EXOTEL_SUB_DOMAIN}/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`;

  const params = new URLSearchParams({
    From: toPhone,
    CallerId: callerId,
    Url: customUrl,
    CallType: 'trans',
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();
    console.log('[Exotel] Outbound call response:', data);

    if (response.ok && data?.Call?.Sid) {
      return {
        success: true,
        callSid: data.Call.Sid,
        status: data.Call.Status,
      };
    }

    return {
      success: false,
      error: data?.RestException?.Message || 'Failed to initiate Exotel call',
    };
  } catch (err) {
    console.error('[Exotel] Call initiation failed:', err.message);
    return { success: false, error: err.message };
  }
}

export default {
  generateExotelVoiceXml,
  generateExotelGreetingXml,
  triggerExotelOutboundCall,
};
