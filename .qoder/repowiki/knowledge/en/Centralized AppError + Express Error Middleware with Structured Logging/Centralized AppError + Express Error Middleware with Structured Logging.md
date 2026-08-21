---
kind: error_handling
name: Centralized AppError + Express Error Middleware with Structured Logging
category: error_handling
scope:
    - '**'
source_files:
    - server/src/utils/AppError.js
    - server/src/middleware/errorHandler.middleware.js
    - server/src/middleware/validation.middleware.js
    - server/src/middleware/rateLimit.middleware.js
    - server/src/utils/logger.js
    - server/src/app.js
    - server/src/controllers/auth.controller.js
---

## Overview

VoiceCart's Node.js server uses a **centralized error-handling architecture** built around a single custom `AppError` class, an Express error-handling middleware, and structured logging. Errors are raised as typed exceptions in controllers/middleware and flow through a single `errorHandler` that sanitizes responses before sending them to clients.

## Core Components

### 1. `AppError` — Standardized exception type (`server/src/utils/AppError.js`)

- Extends native `Error` with fields: `statusCode`, `code` (machine-readable string like `'VALIDATION_ERROR'`, `'AUTH_REQUIRED'`, `'TOO_MANY_REQUESTS'`, `'NOT_FOUND'`), `expose` (boolean controlling whether the message leaks to the client), and `details` (structured validation or context data).
- `expose` defaults to `true` for HTTP status < 500 and `false` for 5xx, so client-facing errors show messages while internal server errors hide details.
- Uses `Error.captureStackTrace` for clean stack traces.

### 2. Centralized error middleware (`server/src/middleware/errorHandler.middleware.js`)

- Registered last in `app.js` after all routes; catches every unhandled error via `(err, req, res, next)` signature.
- Extracts `correlationId` from `req.correlationId` header for request tracing.
- Derives `statusCode` from `err.statusCode`/`err.status`, defaulting to 500; derives `code` from `err.code`, defaulting to `'INTERNAL_SERVER_ERROR'` for 5xx or `'BAD_REQUEST'` otherwise.
- Logs via the structured logger with level ERROR, including correlationId, statusCode, code, path, method, and the full error object.
- Responds with JSON `{ error: { code, message, details, correlationId } }`. For 5xx, the `message` is replaced with a generic "unexpected internal error" and `details` is omitted — raw SQL, stack traces, and internal paths never leak to clients.
- Also exports `notFoundHandler`, which throws `AppError(404, 'NOT_FOUND', ...)` for unmatched routes.

### 3. Validation middleware (`server/src/middleware/validation.middleware.js`)

- Wraps Zod schemas into `validateBody`, `validateQuery`, `validateParams` middlewares.
- On parse failure, calls `next(new AppError(400, 'VALIDATION_ERROR', ..., { details: formatted.fieldErrors }))` — the structured Zod error is flattened and passed as `details`.
- On success, replaces `req.body` / `req.query` / `req.params` with the parsed, validated data.

### 4. Rate-limiting middleware (`server/src/middleware/rateLimit.middleware.js`)

- Four named rate limiters: `authLimiter`, `publicApiLimiter`, `dashboardApiLimiter`, `telephonyLimiter`.
- Each uses `express-rate-limit` with a custom `handler` that calls `next(new AppError(429, 'TOO_MANY_REQUESTS', ...))`, routing all rate-limit violations through the same error pipeline.
- Dashboard limiter keys by `req.auth.userId` when available, falling back to IP.

### 5. Controller pattern (`server/src/controllers/*.js`)

- Controllers wrap async handlers in `try/catch` and call `next(err)` on failure, delegating formatting/response to the central error middleware.
- Business-rule failures throw `new AppError(...)` with appropriate status/code (e.g., `401 AUTH_REQUIRED`, `400 VALIDATION_ERROR`).

### 6. Application bootstrap (`server/src/app.js`)

- Registers `helmet`, CORS, body parsers, health endpoints, then mounts routers.
- Places `notFoundHandler` and `errorHandler` as the final two middlewares — this ordering guarantees every route error funnels through one place.

### 7. Structured logging (`server/src/utils/logger.js`)

- Produces colorized human-readable logs in development and machine-parseable JSON in production (for Datadog/Loki/CloudWatch).
- Includes PII masking for phone numbers in log metadata.
- The `error(message, err, meta)` method attaches `err.message`, `err.stack`, and `err.code` to the JSON output.
- Log level is controlled via `LOG_LEVEL` env var.

## Architecture & Conventions

| Aspect | Convention |
|---|---|
| Raising errors | Throw `new AppError(statusCode, code, message, { details })` |
| Propagation | Pass to Express via `next(err)` from controllers/middlewares |
| Response shape | Always `{ error: { code, message, details?, correlationId } }` |
| Client exposure | 5xx messages are sanitized; only `code` and `correlationId` leak |
| Validation | Use Zod schemas with `validateBody/Query/Params` middlewares |
| Rate limiting | Use named limiters that raise `AppError(429, 'TOO_MANY_REQUESTS')` |
| Tracing | Every error response includes `correlationId` from request headers |
| Logging | All errors logged at ERROR level with full stack in dev, structured JSON in prod |

## Constraints Enforced by Code

- Raw error stacks, SQL strings, and internal paths are never sent to clients — the `errorHandler` replaces 5xx messages with a generic text and omits `details`.
- Uncaught exceptions always produce a 500 response with code `INTERNAL_SERVER_ERROR`.
- Route mismatches always produce a 404 with code `NOT_FOUND` via `notFoundHandler`.
- Validation failures always produce 400 with code `VALIDATION_ERROR` plus Zod field/form errors in `details`.
- Rate-limit breaches always produce 429 with code `TOO_MANY_REQUESTS`.
- Correlation IDs are propagated into both the error response and structured logs for end-to-end tracing.