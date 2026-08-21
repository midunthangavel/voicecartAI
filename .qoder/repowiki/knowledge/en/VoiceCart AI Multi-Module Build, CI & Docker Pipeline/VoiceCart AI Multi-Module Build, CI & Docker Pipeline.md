---
kind: build_system
name: VoiceCart AI Multi-Module Build, CI & Docker Pipeline
category: build_system
scope:
    - '**'
source_files:
    - Dockerfile
    - docker-compose.yml
    - .github/workflows/ci.yml
    - package.json
    - server/package.json
    - client/package.json
    - mobile/package.json
    - security-suite/package.json
---

## What system/approach is used

VoiceCart AI is a multi-module Node.js/React/Expo monorepo built with **npm workspaces-style scripts** (no `npm workspace` config — each subproject has its own `package.json`) and shipped via a **multi-stage Dockerfile**. The build pipeline is:

1. **Local development**: root `package.json` exposes `dev`, `dev:server`, `dev:client`, `mobile`, `test`, `build`, and security-suite commands that delegate to each module via `npm --prefix <module>`.
2. **CI**: GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main|master|develop` and PRs to `main|master`; it installs Node 20, caches npm per module (`server/package-lock.json`, `client/package-lock.json`), runs the server test suite (`npm test` in `./server`), then builds the client assets (`npm run build` in `./client`).
3. **Production packaging**: A single multi-stage Dockerfile builds the React dashboard first, then produces a minimal `node:20-alpine` runtime image that serves both the Express backend and the static client assets from `/app/client/dist`.
4. **Local orchestration**: `docker-compose.yml` defines two services — `voicecart-server` (built from the Dockerfile) and `redis:7-alpine` — with named volumes for DB, recordings, and Redis data.
5. **Security testing**: A separate `security-suite/` module provides `sec:*` npm scripts that invoke an autonomous pentest runner against the running server, client, and mobile codebases.

## Key files and packages

- `Dockerfile` — multi-stage build: Stage 1 (`client-builder`) builds the Vite frontend; Stage 2 (`production`) installs server deps with `--omit=dev`, copies prebuilt client dist, sets `NODE_ENV=production`, `PORT=3001`, `HOST=0.0.0.0`, exposes port 3001, and healthchecks `/api/engine-status` via curl.
- `docker-compose.yml` — defines `voicecart-server` and `redis` services, maps ports 3001 and 6379, mounts persistent volumes (`voicecart-data`, `voicecart-recordings`, `redis-data`), injects env vars (`DB_PATH`, `REDIS_URL`, `AI_LLM_PRIMARY_PROVIDER`, `AI_TTS_PROVIDER`, `AI_STT_PROVIDER`, `AI_PROMPT_VERSION`, `DISPATCH_MODE`), and includes compose-level healthchecks.
- `.github/workflows/ci.yml` — GitHub Actions job `test-and-build` on `ubuntu-latest` using `actions/checkout@v4` and `actions/setup-node@v4` with npm cache keyed by both lockfiles; runs `npm ci` + `npm test` in `./server`, then `npm ci` + `npm run build` in `./client`.
- Root `package.json` — top-level scripts orchestrating all modules: `dev` spawns both server and client dev servers concurrently, `start` runs the server, `mobile` starts Expo, `test` delegates to server tests, `build` builds the client, and `sec:*` commands invoke the security suite.
- `server/package.json` — declares `type: "module"`, entry `server.js`, scripts `start` (`node server.js`), `dev` (`node --watch server.js`), `test` (`node --test --test-concurrency=1 tests/*.test.js`); dependencies include Express, SQLite, ioredis, Twilio, Zod, Helms, rate-limiting, and LLM providers.
- `client/package.json` — Vite-based React app with `dev` (`vite`), `build` (`vite build`), `preview` scripts; depends on React 18 and Lucide icons.
- `mobile/package.json` — Expo ~54 / React Native 0.81 app with `start`, `android`, `ios`, `web` scripts; uses Babel preset `expo` for compilation.
- `security-suite/package.json` — standalone audit/pentest module with `audit`, `loop`, `strix` scripts; Python Strix orchestrator invoked via `python analyzers/strix_orchestrator.py`.

## Architecture and conventions

- **Per-module npm manifests**: Each subdirectory (`server`, `client`, `mobile`, `security-suite`) owns its own `package.json`, `package-lock.json`, and dependency tree. There is no shared `node_modules` at the repo root.
- **Root-level orchestration only**: The root `package.json` contains thin delegation scripts (`npm --prefix <module> ...`) — no cross-module imports or shared build logic.
- **Node version pinning**: CI and Docker both use Node 20 (`node:20-alpine`, `setup-node@v4` with `node-version: 20`).
- **Frontend baked into server image**: The production Docker image does not serve the React app from a separate CDN or container; the Vite build output is copied into `/app/client/dist` and served alongside the Express API on port 3001.
- **SQLite-first persistence**: The server defaults to a file-backed SQLite database (`DB_PATH=/app/data/voicecart.db` in compose), persisted via a named volume.
- **Redis as sidecar**: All non-deterministic state (queues, sessions, locks) goes through ioredis, started as a sibling container in compose.
- **Healthchecks everywhere**: Both the Docker image (`HEALTHCHECK CMD curl -f http://localhost:3001/api/engine-status`) and compose service define matching healthcheck endpoints.
- **Test runner**: Server tests use Node's built-in `node --test` runner with concurrency disabled (`--test-concurrency=1`) to avoid SQLite contention.
- **Environment-driven configuration**: Runtime behavior is controlled entirely via environment variables (LLM provider, TTS/STT provider, prompt version, dispatch mode) rather than config files.

## Conventions and constraints

- **Build reproducibility**: CI uses `npm ci` (not `npm install`) in every step, ensuring deterministic installs from lockfiles.
- **Dev vs prod separation**: Dev uses `node --watch server.js` and Vite's dev server; production omits dev dependencies (`npm ci --omit=dev`) and sets `NODE_ENV=production`.
- **Port contract**: The server always listens on port 3001 (hardcoded in Dockerfile `ENV PORT=3001` and exposed in compose).
- **Health endpoint contract**: The server must expose `/api/engine-status` so Docker and compose healthchecks can verify readiness.
- **Volume contract**: Compose expects writable paths `/app/data` (DB), `/app/server/recordings` (call audio), and `/data` (Redis) to be mounted as named volumes.
- **Branch gating**: CI runs on pushes to `main`, `master`, `develop` and pull requests targeting `main` or `master`.
- **Mobile builds are local-only**: No CI step builds the Expo mobile app; `npm run mobile` and `npm run mobile:tunnel` are developer-only commands.
- **Security suite is decoupled**: Security auditing is a separate npm package with its own scripts; it can target `all`, `server`, `client`, or `mobile`, and supports a loop mode and optional Strix integration.