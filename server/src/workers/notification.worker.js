import { notificationQueue } from '../queue/queueManager.js';
import { createPaymentLink, sendOrderConfirmationSms } from '../services/paymentService.js';
import { sendWhatsAppReceipt, sendWhatsAppPinDrop } from '../services/whatsappService.js';

/**
 * Notification Background Worker
 * Handles WhatsApp receipts, SMS order confirmations, and Pin-Drop messaging asynchronously.
 */

async function processOrderNotification(data) {
  const { orderId, total, phone, items, deliveryAddress } = data;
  if (!phone || phone === 'Browser') {
    return { skipped: true, reason: 'Non-PSTN browser test session' };
  }

  console.log(`[Worker:Notification] Processing order alerts for Order #${orderId} (${phone})...`);

  // 1. Create Razorpay Payment Link
  let paymentUrl = null;
  try {
    const paymentResult = await createPaymentLink(orderId, total, phone, `Food Order #${orderId}`);
    if (paymentResult?.link_url) {
      paymentUrl = paymentResult.link_url;
    }
  } catch (err) {
    console.warn(`[Worker:Notification] Payment link generation failed for Order #${orderId}:`, err.message);
  }

  // 2. Send SMS Confirmation
  try {
    await sendOrderConfirmationSms(phone, orderId, total, items || [], paymentUrl);
    console.log(`[Worker:Notification] SMS dispatched for Order #${orderId}`);
  } catch (err) {
    console.warn(`[Worker:Notification] SMS failed for Order #${orderId}:`, err.message);
  }

  // 3. Send WhatsApp Rich Receipt
  try {
    await sendWhatsAppReceipt(
      phone,
      {
        order_id: orderId,
        items: items || [],
        total,
        delivery_address: deliveryAddress || 'Address on record',
      },
      paymentUrl
    );
    console.log(`[Worker:Notification] WhatsApp receipt dispatched for Order #${orderId}`);
  } catch (err) {
    console.warn(`[Worker:Notification] WhatsApp receipt failed for Order #${orderId}:`, err.message);
  }

  return { success: true, orderId, paymentUrl };
}

// Register explicit processors for both job names
notificationQueue.process('SEND_ORDER_NOTIFICATION', processOrderNotification);
notificationQueue.process('SEND_ORDER_RECEIPT_WHATSAPP', processOrderNotification);

// Processor: Pin-Drop Location Request
notificationQueue.process('SEND_PINDROP_WHATSAPP', async (data) => {
  const { phone, pinUrl } = data;
  if (!phone || phone === 'Browser') return { skipped: true };

  console.log(`[Worker:Notification] Sending pin-drop request to ${phone}: ${pinUrl}`);
  await sendWhatsAppPinDrop(phone, pinUrl);
  return { success: true, phone };
});

console.log('[Workers] Notification Worker initialized and listening for jobs.');
