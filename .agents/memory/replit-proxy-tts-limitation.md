---
name: Replit AI integrations proxy — TTS endpoint limitation
description: The proxy only routes /v1/chat/completions; /v1/audio/speech is blocked.
---

## Rule
`openai.audio.speech.create` (tts-1, tts-1-hd, etc.) returns 400 INVALID_ENDPOINT via the Replit AI integrations proxy. Only `/v1/chat/completions` is proxied.

**Why:** The Replit-managed OpenAI proxy routes a limited set of endpoints. The dedicated `/v1/audio/speech` path is not in that set.

**How to apply:** For TTS in api-server, always use the `gpt-audio` model via `openai.chat.completions.create` (modalities: ["text","audio"]) — never `openai.audio.speech.create`. The `textToSpeech` helper in `lib/integrations-openai-ai-server` also uses `gpt-audio` for the same reason.
