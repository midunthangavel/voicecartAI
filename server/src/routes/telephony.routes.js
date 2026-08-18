import { Router } from 'express';
import { handleExotelVoice, handleTwilioVoice, handleMissedCall, handleDtmf, renderPinDropPage, handlePinConfirm } from '../controllers/telephony.controller.js';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware.js';
import { exotelAuthMiddleware, twilioAuthMiddleware, telephonyWebhookAuthMiddleware } from '../middleware/telephonyAuth.middleware.js';

export const telephonyRouter = Router();

// Exotel Inbound Voice Webhook (India Primary — TRAI Compliant)
telephonyRouter.post('/telephony/exotel/voice', exotelAuthMiddleware(), handleExotelVoice);
telephonyRouter.post('/exotel/voice', exotelAuthMiddleware(), handleExotelVoice);

// Twilio Inbound Voice Webhook (Global / International Fallback)
telephonyRouter.post('/telephony/twilio/voice', twilioAuthMiddleware(), handleTwilioVoice);
telephonyRouter.post('/voice', twilioAuthMiddleware(), handleTwilioVoice);

// Missed Call & DTMF quick-reorder webhooks (Protected with Telephony Auth + Idempotency)
telephonyRouter.post('/api/missed-call', telephonyWebhookAuthMiddleware(), idempotencyMiddleware(), handleMissedCall);
telephonyRouter.post('/api/telephony/dtmf', telephonyWebhookAuthMiddleware(), idempotencyMiddleware(), handleDtmf);

// Pin-Drop Map & Confirmation (with Idempotency protection)
telephonyRouter.get('/pin/:orderId', renderPinDropPage);
telephonyRouter.post('/api/pin-confirm', idempotencyMiddleware(), handlePinConfirm);
