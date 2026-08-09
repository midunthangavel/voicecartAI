/**
 * WhatsApp Receipt & Messaging Service
 * 
 * Sends rich visual order receipts via Twilio WhatsApp API.
 * Includes itemized list, total, delivery address, tracking link,
 * and a 1-tap reorder shortcut.
 * 
 * Falls back to mock console logging for development.
 */

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER,
} = process.env;

/**
 * Send a WhatsApp order receipt to the customer
 * @param {string} phone - Customer phone (E.164 format, e.g., +919876543210)
 * @param {object} orderDetails - { order_id, items, total, delivery_address, landmark }
 * @param {string} [trackingUrl] - Optional live tracking URL
 * @returns {Promise<{success, sid}>}
 */
export async function sendWhatsAppReceipt(phone, orderDetails, trackingUrl) {
  const { order_id, items, total, delivery_address, landmark } = orderDetails;

  const itemLines = (items || [])
    .map(i => `  • ${i.quantity}× ${i.name} — ₹${(i.price || 0) * (i.quantity || 1)}`)
    .join('\n');

  const addressLine = delivery_address
    ? `📍 *Delivery:* ${delivery_address}${landmark ? ` (near ${landmark})` : ''}`
    : '';

  const trackingLine = trackingUrl
    ? `🚚 *Track:* ${trackingUrl}`
    : '';

  const body = [
    `🛒 *VoiceCart — Order Confirmed!*`,
    ``,
    `*Order:* ${order_id}`,
    ``,
    `*Items:*`,
    itemLines,
    ``,
    `💰 *Total: ₹${total}*`,
    addressLine,
    trackingLine,
    ``,
    `🔁 Reply *"reorder"* to instantly repeat this order next time!`,
    ``,
    `Thank you for ordering with VoiceCart! 🙏`,
  ].filter(Boolean).join('\n');

  return sendWhatsApp(phone, body);
}

/**
 * Send a WhatsApp pin-drop confirmation request
 * @param {string} phone - Customer phone
 * @param {string} pinDropUrl - URL to the map pin-drop page
 */
export async function sendWhatsAppPinDrop(phone, pinDropUrl) {
  const body = [
    `📍 *VoiceCart — Confirm Your Location*`,
    ``,
    `We want to make sure the rider finds you fast!`,
    `Tap the link below to confirm your exact delivery pin:`,
    ``,
    `👉 ${pinDropUrl}`,
    ``,
    `Your order will be dispatched right after you confirm. 🚀`,
  ].join('\n');

  return sendWhatsApp(phone, body);
}

/**
 * Core WhatsApp sender (Twilio WhatsApp API or mock)
 */
async function sendWhatsApp(to, body) {
  // Normalise phone to WhatsApp format
  const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  if (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid') {
    try {
      const { default: twilio } = await import('twilio');
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const fromNumber = TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Twilio sandbox default

      const message = await client.messages.create({
        body,
        from: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
        to: whatsappTo,
      });

      console.log(`[WhatsApp] Sent to ${to}: ${message.sid}`);
      return { success: true, sid: message.sid };
    } catch (err) {
      console.error('[WhatsApp] Twilio error:', err.message);
    }
  }

  // Mock WhatsApp message
  console.log(`[WhatsApp] Mock message to ${to}:`);
  console.log(body);
  return { success: true, sid: `mock_wa_${Date.now()}` };
}
