---
name: Production content seeding
description: How language/phrase content reaches the production DB (startup seeding), and the esbuild bundling pitfall with runtime file reads.
---
Rule: Publish syncs *schema* only — content tables (languages/categories/lessons/phrases) stay empty in a fresh prod DB unless the app seeds them. The api-server now runs the idempotent seeder at startup, before listen, behind a blocking `pg_advisory_lock` taken on ONE dedicated pool client (session-scoped; pooled db.execute may lock/unlock on different connections).
**Why:** Prod launched with 0 languages → empty language dropdown for a paying user; seeder had only ever run in dev.
**How to apply:** Content data lives in committed JSON, statically imported (NOT fs.readFile relative to import.meta.url — the server ships as an esbuild bundle where such reads silently miss and the seeder degraded to Gujarati-only). Losers of the lock wait then re-run the cheap idempotent seed, so no instance serves before content exists.
