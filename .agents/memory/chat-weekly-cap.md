---
name: Bolo Parrot chat weekly cap
description: Schema, limits, gate shape, and injectable turn logic for the Parrot conversational chat API
---

## Table
`chat_turns` (lib/db/src/schema/chatTurns.ts) — one row per completed conversational turn. Columns: userId, languageCode, durationSeconds (server-computed from audio, never client-supplied), createdAt. Migration: 0010_green_barracuda.sql (renumbered from 0009 after merge with task #244's has_completed_tour migration).

## Constants & helpers (entitlements.ts)
- `FREE_WEEKLY_CHAT_SECONDS_CAP = 120` (2 minutes/week)
- `weeklyChatSecondsLimit(plan)` — null (unlimited) for one_language and plus; cap for free
- `PlanFeatures.unlimitedChatTime` — true for one_language AND plus (both paid tiers lift the cap)

## Business logic (artifacts/api-server/src/lib/chatLimits.ts)
- Week boundary: UTC Monday 00:00 (`startOfUtcWeek`)
- `sumChatSecondsThisWeek(userId, now)` — sums durationSeconds since Monday
- `recordChatTurn(userId, languageCode, durationSeconds)` — rounds to int, clamps ≥ 0
- `chatTimeCapDenial(resolved, userId, now)` — returns upgradeRequired payload (reason="chat_time_limit", requiredPlan="one_language") or null
- `chatSecondsRemaining(resolved, userId, now)` — null = unlimited, else clamped ≥ 0

## Duration measurement (artifacts/api-server/src/lib/audioDuration.ts)
`wavDurationSeconds(buffer)` walks RIFF chunks to find the "data" subchunk. In the route, ensureCompatibleFormat runs first; if format is "mp3" a second convertToWav call produces a parseable WAV header for duration only.

## Parrot turn (artifacts/api-server/src/lib/parrotChat.ts)
`runParrotTurn(input, deps)` — injectable `ParrotChatDeps` (transcribe, reply, synthesize) mirrors the replenisher's injectable-generate pattern, making unit tests hermetic. Default: gpt-5.4-mini reply (max 200 tokens, native-script-only, handles meta/translation questions in-character), nova voice mp3 TTS.

## Route (POST /openai/chat in artifacts/api-server/src/routes/openai.ts)
Gate order: language check (denyLockedLanguage) → time cap (chatTimeCapDenial) → AI work → recordChatTurn → chatSecondsRemaining → respond.

**Why:** One Language tier also gets unlimited chat time (not just Plus). Language gate reuses existing `denyLockedLanguage` from gating.ts.
