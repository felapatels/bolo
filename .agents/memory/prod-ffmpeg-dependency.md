---
name: Prod missing dev-only binaries (ffmpeg)
description: Deployments only ship declared Nix deps; dev PATH extras like ffmpeg silently vanish in production.
---

The dev workspace PATH includes extra tools via `replit-runtime-path` (e.g. ffmpeg) that are NOT part of the published deployment image. The pronunciation endpoint (audio→wav conversion before speech-to-text) spawned `ffmpeg` and worked in dev but returned 502 `spawn ffmpeg ENOENT` in production.

**Why:** deployments bundle only declared Nix system dependencies, not the dev runtime path.

**How to apply:** any server code that spawns a binary must have that binary declared via `installSystemDependencies` (it lands in the repl's Nix config). `which <bin>` succeeding in dev proves nothing about prod — check the deployment logs for ENOENT 502s when a prod-only failure looks like a broken feature. ffmpeg is now declared; a republish is required for it to reach production.
