---
name: Pronunciation v2 pilot findings
description: gpt-audio ensemble pilot results, recording protocol issues, and what works for audio grading.
---

# Pronunciation v2 Pilot Findings

## Result
Pilot report: `qa/pilot-results/summary_gu.md`. Verdict: **INCONCLUSIVE** (not model failure — recording contamination).

## What Works
gpt-audio (`model: "gpt-audio"`, `modalities: ["text"]`, `format: "mp3"`) correctly scores clean clips:
- Non-native pass: `na` mild_accent [75, 89, 65] median=75
- Wrong phrase rejection: `na` wrong_attempt [33, 23, 42] median=33
- Heavy accent penalty: `namaste` heavy_accent [95, 62, 55] median=62

## Critical API Detail
**WAV format yields ≤5 audio tokens → model refuses to score.** Always send MP3 (128kbps, 24kHz mono) to gpt-audio. Include `modalities: ["text"]` and `max_tokens: 200`. URL is `${AI_BASE_URL}/chat/completions` (no `/v1/` prefix needed here but works either way).

**Why:** The proxy's gpt-audio model (maps to `gpt-audio-2025-08-28`) does not reliably decode PCM WAV inputs; MP3 encoding gives it enough signal.

## Recording Protocol Issue
Screen-recording + phone mic captures BOTH user voice AND phone speaker (app feedback + TTS). Because user voice and app response are < 1.2 s apart, silence-detect merges them into one segment. The 1.5 s trim then captures app audio, not user voice.

**Fix:** Record with earphones plugged in (app audio → headphones, not room speaker) OR use a second-device mic.

## Short-Clip Floor
Clips < 0.8 s produce ≤ 5 gpt-audio audio tokens probabilistically. Single-syllable phrases (ha, na, aabhaar) need the speaker to hold vowels or use natural repetition to reach > 0.8 s.

## Pilot Script
`qa/pilot-pronunciation-v2.mjs` — fully operational, handles 7-phrase Gujarati session. Algorithm: STT-based phrase advance (threshold 0.40, any forward jump) + time-based fallback when past expected phrase end + accumulation guard (max 12 segs/group). Re-run after clean recording.
