import redisClient from '../infra/redisClient.js';
import crypto from 'crypto';

const IDEMPOTENCY_PREFIX = 'voicecart:idempotency:';
const IDEMPOTENCY_WINDOW_SECONDS = 600; // 10 minutes cache window

/**
 * Idempotency Middleware
 * 
 * Prevents duplicate state mutations and duplicate charges caused by
 * retried webhooks from Twilio, Razorpay, or client network retries.
 */
export function idempotencyMiddleware(options = {}) {
  const getKey = options.keyExtractor || ((req) => {
    return req.headers['x-idempotency-key'] ||
      req.body?.CallSid ||
      req.body?.razorpay_payment_id ||
      req.body?.orderId ||
      null;
  });

  return async (req, res, next) => {
    // Only apply to state-modifying requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const keyVal = getKey(req);
    if (!keyVal) {
      return next();
    }

    const redisKey = `${IDEMPOTENCY_PREFIX}${keyVal}`;

    try {
      const cached = await redisClient.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log(`[Idempotency] Duplicate request intercepted for key '${keyVal}'. Returning cached response.`);
        res.setHeader('X-Idempotency-Cache', 'HIT');
        return res.status(parsed.status || 200).json(parsed.body);
      }
    } catch (err) {
      console.warn('[Idempotency] Cache check error:', err.message);
    }

    // Intercept response and cache result
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        redisClient.set(
          redisKey,
          JSON.stringify({ status: res.statusCode, body }),
          'EX',
          options.windowSeconds || IDEMPOTENCY_WINDOW_SECONDS
        ).catch(() => {});
      } catch {}
      return originalJson(body);
    };

    next();
  };
}
