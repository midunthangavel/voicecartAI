/**
 * Payment & Notification Service
 * 
 * - Generates Razorpay Payment Links
 * - Sends SMS notifications via Twilio
 * - Falls back to mock implementations for development
 */

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;

/**
 * Generate a Razorpay payment link for the given order
 * @param {string} orderId 
 * @param {number} amount - Amount in INR
 * @param {string} customerPhone - E.164 format
 * @param {string} description 
 * @returns {Promise<{link_url, link_id}>}
 */
export async function createPaymentLink(orderId, amount, customerPhone, description = 'VoiceCart Food Order') {
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_ID !== 'your_razorpay_key_id') {
    try {
      const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Razorpay expects paise
          currency: 'INR',
          description,
          reference_id: orderId,
          customer: {
            contact: customerPhone,
          },
          notify: { sms: true },
          reminder_enable: true,
          callback_url: `${process.env.PUBLIC_URL || 'https://voicecart.in'}/payment/callback`,
          callback_method: 'get',
        }),
      });
      const data = await response.json();
      console.log('[Payment] Razorpay link created:', data.short_url);
      return { link_url: data.short_url, link_id: data.id };
    } catch (err) {
      console.error('[Payment] Razorpay error:', err.message);
    }
  }

  // Mock payment link
  const mockLink = `https://rzp.io/mock/${orderId}`;
  console.log('[Payment] Mock payment link:', mockLink);
  return { link_url: mockLink, link_id: `mock_${orderId}` };
}

/**
 * Send an SMS to the customer
 * @param {string} to - Customer phone (E.164)
 * @param {string} body - SMS message body
 * @returns {Promise<{success, sid}>}
 */
export async function sendSms(to, body) {
  if (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'your_twilio_account_sid') {
    try {
      const { default: twilio } = await import('twilio');
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const message = await client.messages.create({
        body,
        from: TWILIO_PHONE_NUMBER,
        to,
      });
      console.log('[SMS] Sent:', message.sid);
      return { success: true, sid: message.sid };
    } catch (err) {
      console.error('[SMS] Twilio error:', err.message);
    }
  }

  // Mock SMS
  console.log(`[SMS] Mock SMS to ${to}: ${body}`);
  return { success: true, sid: `mock_${Date.now()}` };
}

/**
 * Send order confirmation SMS with payment link
 * @param {string} phone - Customer phone
 * @param {string} orderId - Order ID
 * @param {number} total - Total amount
 * @param {Array} items - Order items
 * @param {string} paymentLink - Razorpay payment URL
 */
export async function sendOrderConfirmationSms(phone, orderId, total, items, paymentLink) {
  const itemList = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
  const body = [
    `🛒 VoiceCart Order Confirmed!`,
    `Order: ${orderId}`,
    `Items: ${itemList}`,
    `Total: ₹${total}`,
    ``,
    `Pay here: ${paymentLink}`,
    ``,
    `Thank you for ordering with VoiceCart!`,
  ].join('\n');

  return sendSms(phone, body);
}
