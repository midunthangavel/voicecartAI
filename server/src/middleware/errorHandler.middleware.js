import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

/**
 * Centralized Application Error Handling Middleware
 * 
 * Prevents raw SQL, internal paths, and stack traces from leaking to clients.
 */
export function errorHandler(err, req, res, next) {
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || 'unknown';
  const statusCode = err.statusCode || (err.status ? parseInt(err.status, 10) : 500);
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const isExpose = err.expose ?? (statusCode < 500);

  // Structured Logging
  logger.error(
    `[HTTP Error] ${req.method} ${req.originalUrl || req.url} -> ${statusCode} (${code})`,
    err,
    {
      correlationId,
      statusCode,
      code,
      path: req.originalUrl || req.url,
      method: req.method,
    }
  );

  res.status(statusCode).json({
    error: {
      code,
      message: isExpose ? err.message : 'An unexpected internal error occurred. Please try again later.',
      details: isExpose && err.details ? err.details : undefined,
      correlationId,
    },
  });
}

export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Cannot ${req.method} ${req.originalUrl || req.url}`));
}

export default errorHandler;
