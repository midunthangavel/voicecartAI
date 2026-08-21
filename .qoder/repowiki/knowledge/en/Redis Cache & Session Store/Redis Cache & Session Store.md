---
kind: external_dependency
name: Redis Cache & Session Store
slug: redis
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
---

Redis (image `redis:7-alpine`) runs as a sidecar container providing caching, session storage, and inter-process coordination for the VoiceCart server. Connected via `REDIS_URL` using the `ioredis` client. Docker Compose mounts `redis-data` volume for persistence. Used for distributed lock management and cross-instance session awareness.