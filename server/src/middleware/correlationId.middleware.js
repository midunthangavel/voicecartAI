import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Correlation ID Middleware
 * 
 * Propagates distributed correlation IDs across HTTP requests, WebSockets, and background workers.
 */
export function correlationIdMiddleware() {
  return (req, res, next) => {
    const correlationId =
      req.headers['x-correlation-id'] ||
      req.headers['x-request-id'] ||
      `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const meta = {
        correlationId,
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
