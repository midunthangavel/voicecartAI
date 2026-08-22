/**
 * Payment & Notification Service
 *
 * SECURITY PRINCIPLE: Production never falls back to mock implementations.
 * If the real provider is unavailable, the operation FAILS with an explicit error.
 * Mock mode is only available when explicitly configured in development.
 */

import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  NODE_ENV,
  PAYMENT_MODE,
} = process.env;

const IS_MOCK_PAYMENT = NODE_ENV === 'development' && PAYMENT_MODE === 'mock';
const IS_MOCK_SMS = NODE_ENV === 'development' && (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === 'your_twilio_account_sid');

/**
 * Generate a Razorpay payment link for the given order
 * @param {string} orderId
 * @param {number} amount - Amount in INR
 * @param {string} customerPhone - E.164 format
 * @param {string} description
 * @returns {Promise<{link_url, link_id}>}
 */
export async function createPaymentLink(orderId, amount, customerPhone, description = 'VoiceCart Food Order') {
  // Explicit mock mode — development only
  if (IS_MOCK_PAYMENT) {
    const mockLink = `https://rzp.io/mock/${orderId}`;
    logger.info(`[Payment] Mock payment link (PAYMENT_MODE=mock): ${mockLink}`);
    return { link_url: mockLink, link_id: `mock_${orderId}` };
  }

  // Production/staging: credentials are mandatory
  if (!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID === 'your_razorpay_key_id' || !RAZORPAY_KEY_SECRET) {
    throw new AppError(
      503,
      'PAYMENT_NOT_CONFIGURED',
      'Payment provider is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

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
      reference_id: String(orderId),
      customer: {
        contact: customerPhone,
      },
      notify: { sms: true },
      reminder_enable: true,
      callback_url: `${process.env.PUBLIC_URL || 'https://voicecart.in'}/payment/callback`,
      callback_method: 'get',
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    logger.error(`[Payment] Razorpay error ${response.status}: ${errorBody}`);
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_ERROR',
      'Payment provider request failed',
      { providerStatus: response.status }
    );
  }

  const data = await response.json();

  if (!data.id || !data.short_url) {
    logger.error('[Payment] Razorpay returned invalid response:', JSON.stringify(data));
    throw new AppError(
      502,
      'INVALID_PAYMENT_RESPONSE',
      'Payment provider returned an invalid response'
    );
  }

  logger.info(`[Payment] Razorpay link created: ${data.short_url}`);
  return { link_url: data.short_url, link_id: data.id };
}

/**
 * Send an SMS to the customer
 * @param {string} to - Customer phone (E.164)
 * @param {string} body - SMS message body
 * @returns {Promise<{success, sid}>}
 */
export async function sendSms(to, body) {
  // Explicit mock mode — development only
  if (IS_MOCK_SMS) {
    logger.info(`[SMS] Mock SMS to ${to}: ${body.substring(0, 80)}...`);
    return { success: true, sid: `mock_sms_${Date.now()}` };
  }

  if (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === 'your_twilio_account_sid' || !TWILIO_AUTH_TOKEN) {
    throw new AppError(
      503,
      'SMS_NOT_CONFIGURED',
      'SMS provider is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
    );
  }

  const { default: twilio } = await import('twilio');
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const message = await client.messages.create({
    body,
    from: TWILIO_PHONE_NUMBER,
    to,
  });

  logger.info(`[SMS] Sent: ${message.sid}`);
  return { success: true, sid: message.sid };
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
