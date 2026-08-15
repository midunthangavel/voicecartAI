import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

/**
 * Standard Rate Limiting Middleware Suite
 */

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 login attempts per min per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many authentication attempts. Please try again in a minute.'));
  },
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per min per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Rate limit exceeded for public requests. Please slow down.'));
  },
});

export const dashboardApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180, // 180 requests per min
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  keyGenerator: (req) => req.auth?.userId || ipKeyGenerator(req),
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Dashboard API rate limit exceeded.'));
  },
});

export const telephonyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per min for webhooks
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Telephony webhook rate limit exceeded.'));
  },
});
