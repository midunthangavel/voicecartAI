import { AppError } from '../utils/AppError.js';

/**
 * Zod Schema Validation Middleware
 */

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formatted = result.error.flatten();
      return next(new AppError(400, 'VALIDATION_ERROR', 'Request body validation failed', {
        details: formatted.fieldErrors || formatted.formErrors,
      }));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const formatted = result.error.flatten();
      return next(new AppError(400, 'VALIDATION_ERROR', 'Query parameters validation failed', {
        details: formatted.fieldErrors || formatted.formErrors,
      }));
    }
    req.query = result.data;
    next();
  };
}

export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const formatted = result.error.flatten();
      return next(new AppError(400, 'VALIDATION_ERROR', 'URL parameters validation failed', {
        details: formatted.fieldErrors || formatted.formErrors,
      }));
    }
    req.params = result.data;
    next();
  };
}
