---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### VoiceCart AI
- Definition：The project name for the bilingual voice telephony and ONDC food ordering system composed of a Node.js/Express backend (SQLite + Redis + WebSocket), a React/Vite dashboard, and an Expo/React Native mobile app.
- Aliases：voicecart、voicecart-ai-server

### ONDC
- Definition：Open Network for Digital Commerce — an Indian protocol for interoperable e-commerce. VoiceCart supports dispatching orders either directly to a POS (`DISPATCH_MODE=direct`) or through the ONDC network (`DISPATCH_MODE=ondc`) to search across restaurants, place orders, and track fulfillment.
- Aliases：ondc protocol、ondc bap

### tenantId / restaurantId
- Definition：Multi-tenancy identifiers attached to every authenticated request via JWT. `tenantId` scopes data to a business tenant; `restaurantId` scopes to a specific outlet within that tenant. Controllers extract these from `req.auth` to enforce row-level isolation.
- Aliases：tenant context、restaurant context、multi-tenant scope

### transactional outbox
- Definition：A durability pattern used to guarantee that side effects (webhooks, queue jobs, external API calls) are emitted only after the database transaction commits. Events are first persisted in an outbox table and then polled by background workers.
- Aliases：outbox pattern、outbox events

### Merkle audit chain
- Definition：An append-only tamper-evident log where each entry hashes the previous entry's digest, used to record immutable audit trails for critical operations in the system.
- Aliases：audit chain、merkle log

### RBAC
- Definition：Role-Based Access Control middleware layer that gates API routes based on the authenticated user's role, applied after authentication and tenant resolution.
- Aliases：role-based access control、rbac middleware

### idempotency middleware
- Definition：Middleware that deduplicates repeated requests (typically POST/PUT) using a client-supplied idempotency key, preventing double-processing of orders or payments during retries.
- Aliases：idempotency store、idempotent requests

### pin-drop page
- Definition：A standalone HTML page served by the telephony controller that renders a map (powered by Google Maps) allowing callers to drop a delivery pin during a voice order. Currently embedded inline in `telephony.controller.js`.
- Aliases：pin drop、delivery pin page

### dashboard-ws
- Definition：The real-time WebSocket channel used by the web dashboard to receive live updates (call status, order events, metrics) instead of polling HTTP endpoints.
- Aliases：dashboard websocket、ws dashboard

### DEV_AUTH_BYPASS
- Definition：A development-only flag that disables telephony webhook signature verification. Must never be enabled in production; if set in production env, it allows unauthenticated webhook spoofing.
- Aliases：dev auth bypass、telephony dev bypass
