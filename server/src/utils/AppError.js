/**
 * Standardized Application Error
 * 
 * Provides consistent HTTP status codes, machine-readable error codes,
 * and controlled exposure of error messages to API clients.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = options.expose ?? statusCode < 500;
    this.details = options.details || null;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
