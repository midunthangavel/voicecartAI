import crypto from 'crypto';

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

/**
 * SECURITY: Development bypass uses explicit allowlisting (=== 'development'),
 * NOT exclusion (!== 'production'). This prevents misconfigured environments
 * from accidentally entering the unauthenticated path.
 */
const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Timing-safe string comparison that handles mismatched buffer lengths
 * without throwing. Returns false for any length mismatch.
 */
function safeTimingCompare(a, b) {
  const left = Buffer.from(a || '', 'utf8');
  const right = Buffer.from(b || '', 'utf8');

  if (left.length !== right.length) {
    // Prevent timing oracle: still perform a comparison against itself
    crypto.timingSafeEqual(left, left);
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

/**
 * Validates Twilio's HMAC-SHA1 signature over URL and POST parameters
 */
export function verifyTwilioSignature(req, authToken = TWILIO_AUTH_TOKEN) {
  if (IS_DEV && !req.headers['x-twilio-signature']) {
    return true; // Local developer bypass — only in NODE_ENV=development
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature || !authToken) return false;

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${protocol}://${host}${req.originalUrl || req.url}`;

  // Sort POST parameters alphabetically
  const params = req.body || {};
  const sortedKeys = Object.keys(params).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + params[key];
  }

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(dataString, 'utf-8'))
    .digest('base64');

  return safeTimingCompare(twilioSignature, expectedSignature);
}

/**
 * Validates Exotel's webhook signature / token
 */
export function verifyExotelSignature(req, apiToken = EXOTEL_API_TOKEN) {
  if (IS_DEV && !req.headers['x-exotel-signature'] && !req.query.auth_token) {
    return true; // Local developer bypass — only in NODE_ENV=development
  }

  const exotelSignature = req.headers['x-exotel-signature'] || req.query.auth_token;
  if (!exotelSignature || !apiToken) return false;

  return safeTimingCompare(exotelSignature, apiToken);
}

/**
 * Express middleware to verify Twilio inbound webhook authenticity
 */
export function twilioAuthMiddleware() {
  return (req, res, next) => {
    if (verifyTwilioSignature(req)) {
      return next();
    }
    console.warn(`[Security] Rejected unauthenticated Twilio webhook from ${req.ip}`);
    return res.status(403).type('text/plain').send('Forbidden: Invalid Twilio Signature');
  };
}

/**
 * Express middleware to verify Exotel inbound webhook authenticity
 */
export function exotelAuthMiddleware() {
  return (req, res, next) => {
    if (verifyExotelSignature(req)) {
      return next();
    }
    console.warn(`[Security] Rejected unauthenticated Exotel webhook from ${req.ip}`);
    return res.status(403).type('text/plain').send('Forbidden: Invalid Exotel Signature');
  };
}

/**
 * Express middleware to verify any supported telephony provider (Exotel or Twilio)
 */
export function telephonyWebhookAuthMiddleware() {
  return (req, res, next) => {
    if (verifyExotelSignature(req) || verifyTwilioSignature(req)) {
      return next();
    }
    console.warn(`[Security] Rejected unauthenticated telephony webhook from ${req.ip} on ${req.originalUrl}`);
    return res.status(403).json({ error: 'Forbidden: Invalid Telephony Provider Signature' });
  };
}

export default {
  verifyTwilioSignature,
  verifyExotelSignature,
  twilioAuthMiddleware,
  exotelAuthMiddleware,
  telephonyWebhookAuthMiddleware,
};
