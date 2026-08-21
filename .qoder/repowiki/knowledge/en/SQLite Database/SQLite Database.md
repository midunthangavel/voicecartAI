---
kind: external_dependency
name: SQLite Database
slug: sqlite
category: external_dependency
scope:
    - '**'
---

SQLite (via `sqlite3` native bindings) is the primary data store, persisted as `voicecart.db` (configurable via `DB_PATH`). Uses WAL mode for concurrent readers. Backups are written to `server/backups/` with timestamped filenames. Not horizontally scalable beyond a single writer; migration to PostgreSQL with `pg-pool` is recommended for multi-instance deployments.