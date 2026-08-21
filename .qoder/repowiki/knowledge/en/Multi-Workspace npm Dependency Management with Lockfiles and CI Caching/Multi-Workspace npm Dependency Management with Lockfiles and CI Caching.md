---
kind: dependency_management
name: Multi-Workspace npm Dependency Management with Lockfiles and CI Caching
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - server/package.json
    - server/package-lock.json
    - client/package.json
    - client/package-lock.json
    - mobile/package.json
    - mobile/package-lock.json
    - security-suite/package.json
    - .github/workflows/ci.yml
---

## System / Approach

VoiceCart AI uses **npm** as the sole package manager across a multi-workspace monorepo. Each subproject (server, client, mobile, security-suite) maintains its own `package.json` plus a committed `package-lock.json` lockfile. There is no top-level `package-lock.json`; instead, each workspace pins its dependency tree independently. The root `package.json` is marked `private: true` and only defines convenience scripts that delegate to child workspaces via `npm --prefix <dir> run ...`, so it does not declare any dependencies of its own.

Dependencies are resolved from the public **npm registry** (`https://registry.npmjs.org/`) — no private registries, `.npmrc` files, or scoped private packages were found in the repository. No vendoring strategy (e.g., `vendor/` directories) is used; all third-party code is installed into per-workspace `node_modules/` directories at install time.

## Key Files

- `server/package.json` + `server/package-lock.json` — backend runtime deps (Express, Twilio, ioredis, sqlite3, jose, ws, zod, @google/generative-ai, @xenova/transformers).
- `client/package.json` + `client/package-lock.json` — frontend runtime deps (React 18, lucide-react) and dev deps (Vite 8, @vitejs/plugin-react, TypeScript types).
- `mobile/package.json` + `mobile/package-lock.json` — Expo/React Native stack (expo ~54, react-native 0.81.5, expo-* SDK modules).
- `security-suite/package.json` — lightweight Node runner plus a Python-based Strix orchestrator invoked via `npm run strix`.
- `.github/workflows/ci.yml` — CI installs dependencies with `npm ci` using cached lockfiles under `server/` and `client/`.
- Root `package.json` — workspace orchestration scripts (`dev`, `build`, `test`, `sec:*`).

## Architecture & Conventions

### Per-workspace manifests
Each project owns its own dependency surface:
- **Server**: production-only dependencies declared under `dependencies`; no `devDependencies`. Tests run via `node --test` against the installed runtime deps.
- **Client**: runtime deps under `dependencies`, build tooling under `devDependencies` (Vite, React type definitions). Built to static assets for deployment.
- **Mobile**: Expo-managed dependency set pinned with tilde ranges (`~54.0.0`, `~16.0.8`, etc.) to stay within major Expo SDK releases.
- **Security suite**: minimal runtime; heavy lifting delegated to Python (`python analyzers/strix_orchestrator.py`).

### Versioning strategy
- Most versions use caret (`^`) ranges, allowing minor/patch updates automatically (e.g., `express ^4.19.2`, `react ^18.3.1`).
- Mobile Expo ecosystem uses tilde (`~`) ranges to lock within a single Expo SDK major release line.
- Lockfiles (`lockfileVersion: 3`) commit exact transitive resolution, ensuring reproducible installs.

### Native addon handling
The server declares an explicit `allowScripts` entry for `sqlite3@5.1.7`, permitting its native build script to run during install. The client similarly allows `esbuild@0.21.5`'s postinstall script. This is the only place in the repo where native/script execution is explicitly whitelisted.

### CI integration
The GitHub Actions workflow (`ci.yml`) runs on push/PR to `main`, `master`, `develop`:
- Sets up Node.js 20.
- Caches `npm` installs keyed off `server/package-lock.json` and `client/package-lock.json`.
- Uses `npm ci` (not `npm install`) in both `./server` and `./client` for deterministic installs.
- Runs `npm test` (server) and `npm run build` (client) as part of the pipeline.

### Workspace orchestration
The root `package.json` exposes unified commands:
- `npm run dev` spawns both server and client dev servers concurrently.
- `npm run mobile` delegates to `mobile start`.
- `npm run sec:*` delegates to `security-suite/runner.js` targeting server/client/mobile/all.
- `npm run test` runs the server test suite.

## Conventions & Constraints

- **Lockfiles are committed**: every workspace ships a `package-lock.json`, and CI caches by lockfile hash — this is the enforcement mechanism for reproducible builds.
- **No shared top-level dependencies**: there is no `workspaces:` field in the root manifest; each subdirectory is an independent npm project.
- **No private registry configured**: no `.npmrc`, no `NPM_CONFIG_REGISTRY`, no `@org/*` scopes — all packages resolve from the public npm registry.
- **Native addons must be whitelisted**: adding a package with a postinstall/native build requires an explicit `allowScripts` entry in the owning `package.json` (observed for `sqlite3` and `esbuild`).
- **CI enforces `npm ci`**: the workflow never runs `npm install`, which prevents lockfile drift between CI and local development.
- **Mobile Expo SDK version coupling**: the mobile app pins `expo ~54.0.0` alongside matching `expo-*` packages, following Expo's convention of keeping the SDK family aligned.