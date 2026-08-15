import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Enriched Request Correlation & Trace Lifecycle Middleware
 * 
 * Propagates trace context (requestId, tenantId, restaurantId, userId, callId, orderId)
 * across HTTP requests, WebSockets, database transactions, and background workers.
 */
export function correlationIdMiddleware() {
  return (req, res, next) => {
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const correlationId = req.headers['x-correlation-id'] || requestId;

    req.requestId = requestId;
    req.correlationId = correlationId;

    req.traceContext = {
      requestId,
      correlationId,
      callId: req.headers['x-call-id'] || null,
      sessionId: req.headers['x-session-id'] || null,
      orderId: req.headers['x-order-id'] || null,
      tenantId: null,
      restaurantId: null,
      userId: null,
    };

    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const meta = {
        requestId,
        correlationId,
        tenantId: req.auth?.tenantId || req.traceContext.tenantId,
        restaurantId: req.auth?.restaurantId || req.traceContext.restaurantId,
        userId: req.auth?.userId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: duration,
      };

      if (res.statusCode >= 500) {
        logger.error(`HTTP ${req.method} ${req.originalUrl} failed with status ${res.statusCode}`, null, meta);
      } else if (res.statusCode >= 400) {
        logger.warn(`HTTP ${req.method} ${req.originalUrl} responded with ${res.statusCode}`, meta);
      } else if (!req.originalUrl.includes('/health') && !req.originalUrl.includes('/metrics')) {
        logger.info(`HTTP ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`, meta);
      }
    });

    next();
  };
}

export default correlationIdMiddleware;
