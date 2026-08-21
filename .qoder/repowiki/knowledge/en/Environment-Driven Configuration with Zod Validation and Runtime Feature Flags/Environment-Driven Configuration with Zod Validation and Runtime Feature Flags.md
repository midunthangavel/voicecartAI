---
kind: configuration_system
name: Environment-Driven Configuration with Zod Validation and Runtime Feature Flags
category: configuration_system
scope:
    - '**'
source_files:
    - server/src/config/env.js
    - server/.env.example
    - server/.env
    - server/src/app.js
    - server/src/services/featureFlag.service.js
    - security-suite/config.js
    - security-suite/.env.example
    - docker-compose.yml
    - Dockerfile
    - mobile/app.json
---

## Overview

VoiceCart AI uses a **12-factor-style environment variable configuration system** centered on the Node.js server, supplemented by per-module config files and runtime feature flags. There is no centralized config file format (no YAML/TOML/JSON config); instead, configuration is loaded from `process.env`, validated at startup, and consumed directly by services.

## Core Server Configuration (`server/src/config/env.js`)

The single source of truth for server configuration lives in `server/src/config/env.js`. It defines a **Zod schema** (`envSchema`) that declares every required/optional environment variable with types, constraints, and defaults:

- `PORT` (int, 1000–65535, default 3001)
- `NODE_ENV` (enum: development/test/production)
- `JWT_SECRET` (min 32 chars; dev fallback provided)
- `DB_PATH` (SQLite path, default `./voicecart.db`)
- `REDIS_URL` (optional)
- `PUBLIC_URL` (URL, default `http://localhost:3001`)
- `CORS_ORIGINS` (comma-separated list)
- `ENCRYPTION_KEY` (min 32 chars; dev fallback provided)
- Provider keys: `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `SARVAM_API_KEY`

Validation runs via `validateEnv()` which calls `safeParse(process.env)` and throws a fatal error with formatted validation output if any variable is missing or invalid. The module is imported as a side-effect in `server/src/app.js` (`import './config/env.js'`) so validation executes before the app boots.

## Environment Files

- `server/.env.example` — canonical reference listing all variables including provider switches (`AI_LLM_PROVIDER`, `AI_STT_PROVIDER`, `AI_TTS_PROVIDER`), Twilio credentials, Razorpay keys, `DISPATCH_MODE` (direct|ondc), and `AI_PROMPT_VERSION` (v1|v2).
- `server/.env` — local development overrides (uses Ollama locally, includes live API keys).
- `security-suite/.env.example` — security suite sandbox settings (`SECURITY_SANDBOX_PORT`, `SECURITY_SANDBOX_HOST`, `STRIX_LLM`, `LLM_API_KEY`).
- `docker-compose.yml` — injects production env vars (`NODE_ENV=production`, `PORT=3001`, `DB_PATH=/app/data/voicecart.db`, `REDIS_URL=redis://redis:6379`, `AI_*_PROVIDER`, `AI_PROMPT_VERSION`, `DISPATCH_MODE`) into the container.
- `Dockerfile` — sets base `ENV NODE_ENV=production`, `PORT=3001`, `HOST=0.0.0.0`.

## Per-Module Config

- **Security Suite**: `security-suite/config.js` exports a plain JS object (`config`) with resolved paths to target modules (`../server`, `../client`, `../mobile`), sandbox DB path, health endpoint, and Strix LLM settings read from `process.env`.
- **Mobile App**: `mobile/app.json` is Expo's declarative app manifest (name, slug, scheme, SDK version, platform-specific icons). No runtime env loading is used here.
- **Client (Dashboard)**: Uses Vite; no dedicated config file found beyond `package.json` scripts. Build-time config would be via Vite's `import.meta.env` pattern (not present in scanned files).

## Runtime Feature Flags (`server/src/services/featureFlag.service.js`)

Feature toggles are **runtime-configurable**, stored in SQLite under a `feature_flags` table, and checked per tenant:

1. Tenant-specific override takes precedence (`tenant_id = ? AND flag_key = ?`).
2. Falls back to global setting (`tenant_id = 'global'`).
3. Default is `true` (enabled) for unconfigured keys.

APIs exposed: `isFeatureEnabled(flagKey, tenantId)`, `setFeatureFlag(flagKey, enabled, tenantId, description)`, `getAllFeatureFlags(tenantId)`.

## Conventions Observed

- **All secrets and runtime knobs come from `process.env`**; no `.json`/`.yaml` config files are parsed at runtime.
- **Every env var has a Zod type + default** — there are no bare `process.env.X` reads without schema coverage in the central validator.
- **Provider selection is via string enums** in env (`AI_LLM_PROVIDER=ollama|groq|gemini|openrouter`, `AI_STT_PROVIDER=whisper|groq|google|mock`, `AI_TTS_PROVIDER=sarvam|google|mock`, `DISPATCH_MODE=direct|ondc`).
- **Dev vs prod differentiation** is handled through `NODE_ENV` plus conditional defaults in the Zod schema (e.g., JWT secret and encryption key get safe dev-only defaults but empty strings in production).
- **Containerized deployments** pass configuration exclusively via Docker Compose `environment:` blocks and Dockerfile `ENV` directives.
- **Feature flags are database-backed and tenant-scoped**, not environment-based, enabling runtime rollouts without redeploy.
- **CORS origins** are configured via comma-separated `CORS_ORIGINS` env var, split and trimmed at runtime in `app.js`.

## Constraints Enforced by Code

- Startup fails fast if any required env var is missing or invalid (Zod `safeParse` throws `Environment configuration validation failed`).
- `JWT_SECRET` must be ≥ 32 characters; `ENCRYPTION_KEY` must be ≥ 32 characters.
- `PORT` must be an integer between 1000 and 65535.
- `NODE_ENV` must be one of `development`, `test`, `production`.
- `PUBLIC_URL` must be a valid URL.
- Feature flag lookups default to enabled when no entry exists, preventing accidental lockout.