---
kind: logging_system
name: VoiceCart AI Structured Logger with Correlation IDs and PII Masking
category: logging_system
scope:
    - '**'
source_files:
    - server/src/utils/logger.js
    - server/src/middleware/correlationId.middleware.js
    - server/src/middleware/errorHandler.middleware.js
    - server/src/infra/redisClient.js
    - server/src/infra/idempotencyStore.js
    - server/src/infra/lockService.js
    - server/src/infra/storageService.js
    - server/src/db.js
    - server/server.js
    - server/src/config/env.js
---

## What system/approach is used

VoiceCart AI implements a **custom lightweight structured logger** in `server/src/utils/logger.js`. It is not built on a third-party logging library (no winston, pino, bunyan, morgan, log4js, or debug are imported). The logger writes to `console.log` / `console.warn` / `console.error`, but formats output differently based on environment:

- **Production (`NODE_ENV=production`)**: emits single-line JSON objects suitable for ingestion by Datadog, Loki, or CloudWatch. Each entry contains `timestamp`, `level`, `message`, `correlationId`, plus any user-supplied metadata fields.
- **Development**: emits colorized human-readable lines with ANSI tags like `[INFO]`, `[WARN]`, `[ERROR]`, `[DEBUG]`, `[TRACE]`, including correlation ID tags and optional error stack traces.

Log levels are defined as numeric constants (`TRACE: 10`, `DEBUG: 20`, `INFO: 30`, `WARN: 40`, `ERROR: 50`) and filtered at call time by the global `LOG_LEVEL` environment variable (defaults to `INFO`).

## Key files and packages

| File | Role |
|---|---|
| `server/src/utils/logger.js` | Core logger module — level filtering, JSON vs colorized formatting, PII phone masking, `voiceTurn()` helper for voice pipeline latency tracking |
| `server/src/middleware/correlationId.middleware.js` | Enriches every request with `requestId`, `correlationId`, `callId`, `sessionId`, `orderId`, `tenantId`, `restaurantId`, `userId` and logs HTTP method/url/status/duration |
| `server/src/middleware/errorHandler.middleware.js` | Centralized error middleware that logs via `logger.error` with structured `code`, `statusCode`, `path`, `method`, `correlationId` |
| `server/src/db.js` | Logs slow SQL queries via `logger.warn('[SlowQuery] ...')` |
| `server/src/infra/redisClient.js` | Logs Redis connect/disconnect/fatal errors via `logger.info/warn/error` |
| `server/src/infra/idempotencyStore.js` | Logs idempotency deduplication events |
| `server/src/infra/lockService.js` | Logs Redis lock acquisition/release failures |
| `server/src/infra/storageService.js` | Logs S3 upload success/failure and disk persistence events |
| `server/server.js` | Boot/shutdown messages use raw `console.log` (pre-logger startup) |
| `server/src/config/env.js` | Startup env validation uses `console.error` (before logger is available) |

## Architecture and conventions

### Single shared logger instance
All modules import `{ logger }` from `../utils/logger.js` (or relative path). There is no per-module logger factory; the same singleton provides `info`, `warn`, `error`, `debug`, and a domain-specific `voiceTurn(turnData)` helper.

### Correlation-ID propagation
The `correlationIdMiddleware` extracts `x-request-id` and `x-correlation-id` headers (falling back to generated UUIDs), attaches them to `req.requestId`, `req.correlationId`, and `req.traceContext`, and echoes them back in response headers `X-Request-ID` and `X-Correlation-ID`. The logger's `formatLog` pulls `correlationId` from either `meta.correlationId` or `meta.sessionId`, so downstream services can propagate trace context through the `meta` object.

### PII protection
Phone numbers in log metadata are automatically masked before emission via `maskPhone()`: Indian numbers starting with `+91` become `+91******3210`; other numbers keep only the country code and last four digits. Fields `phone`, `callerPhone`, and `caller_phone` are all sanitized through `sanitizeMeta()`.

### Error handling convention
Errors passed to `logger.error(message, err, meta)` are serialized into an `error` sub-object containing `message`, `stack`, and `code`. The centralized `errorHandler` middleware always logs with a structured `code` field (e.g. `INTERNAL_SERVER_ERROR`, `BAD_REQUEST`, `NOT_FOUND`) rather than raw exception strings.

### Domain-specific helpers
`logger.voiceTurn({ sessionId, turnNumber, vadMs, sttMs, llmMs, ttsMs, totalMs, provider })` emits either an `info` or `warn` depending on whether `totalMs` exceeds the 800ms budget (warning threshold is 1200ms), embedding nested `latency.vad/stt/llm/tts/total` timing data.

### Environment-driven behavior
- `NODE_ENV === 'production'` → JSON lines (structured, machine-parseable).
- Any other value → colorized ANSI text (developer-friendly).
- `LOG_LEVEL` controls minimum severity (case-insensitive; defaults to `INFO`).

## Conventions and constraints

1. **Do not use `console.log` directly in application code.** All business logic should go through `logger.info/warn/error/debug`. Only boot/shutdown and fatal startup validation in `server.js` and `env.js` bypass the logger because it is not yet initialized.
2. **Always attach a `meta` object** when calling the logger. At minimum include `correlationId` (injected by middleware); richer calls add `tenantId`, `restaurantId`, `userId`, `method`, `url`, `statusCode`, etc.
3. **Never log raw phone numbers.** Use the provided `maskPhone` helper indirectly by passing phones inside `meta`; the logger sanitizes them automatically.
4. **Use the `code` field on errors.** The `AppError` class and `errorHandler` enforce a stable error-code string alongside `statusCode` so consumers can distinguish `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`, etc.
5. **HTTP access logs are emitted by middleware, not controllers.** Controllers should not log request lifecycle events; `correlationIdMiddleware` handles method/url/status/duration logging and skips `/health` and `/metrics` endpoints.
6. **Structured logs are the contract for production observability.** In production, every line must be valid JSON with `timestamp`, `level`, `message`, and `correlationId` — downstream sinks (Datadog/Loki/CloudWatch) parse these fields.