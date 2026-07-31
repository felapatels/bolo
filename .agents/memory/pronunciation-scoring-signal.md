---
name: Pronunciation scoring signal audit
description: Why the five-band ladder cannot hear accent quality today, and which acoustic-signal options are viable (July 2026 investigation, report-only).
---

## The blind spot
The eval pipeline is transcript-only: STT text goes to char-Levenshtein similarity + a text-LLM judge; no acoustic feature (confidence, logprob, timing) is requested or read anywhere. Phoneme SUBSTITUTIONS still get caught (they change the transcript), but accent/delivery quality is invisible: gpt-4o-mini-transcribe transcribes a deliberately American-syllable rendition of a Hindi phrase to the EXACT target text.

## Signals probed (sandbox, /tmp, synthetic TTS clips of one Hindi phrase)
- `gpt-4o-transcribe` with `include[]=logprobs` (works on our own OPENAI_API_KEY, NOT requested in prod): mean token logprob does NOT discriminate (-0.098 native-like vs -0.114 heavy accent). Dead end.
- `whisper-1 verbose_json`: `avg_logprob` useless; `no_speech_prob` and duration weakly discriminate (0.615 + 4.95s on the worst accent clip vs 0.03 + 1.95s good) but noisy (a good clip hit 0.166). Only usable as a small delivery modifier.
- `gpt-audio` via the AI-integrations proxy DOES hear accent: phoneme-mangled clips score 30-45 consistently, native-like 70-90, but single-run variance on accent-quality clips is up to 30 points; needs a 3-run median ensemble. `response_format: json_object` is rejected for gpt-audio (prompt-enforced JSON instead). Audio input ≈ 10 tokens/second.
- `gpt-audio-mini` is unusable: ignores the attached audio in ~1/3 of calls ("please provide the recording") and shows no accent separation.

## Vendor/self-hosted coverage (verified July 2026)
- Azure Pronunciation Assessment: of our 22 languages only hi-IN and ta-IN. Billed as standard STT ($1/audio hour). Real per-phoneme scores; useful only as a hi/ta precision anchor or calibration reference.
- SpeechAce (en/fr/es) and Language Confidence (en): zero of our 22.
- Official MFA pretrained models: zero Indic. AI4Bharat IndicMFA (GitHub releases): MFA models for the 22 scheduled languages (20 verified on the tags pages, Hindi + Kannada inferred from the 22-tag count). Only path to true phoneme-level scoring across all 22, but Kaldi-stack self-hosting + GOP recipes = big lift, research-grade risk.

**How to apply:** any accent-quality upgrade should keep the transcript gate + guards + nocatch machinery and swap only the band signal (client contract: five bands + transcript + romanized). Validate any audio-LLM grader on REAL learner recordings first: TTS-synthesized "bad accent" clips are a weak proxy (one such clip was arguably fine and graded 80). Expect audio-LLM grading to be unreliable for low-resource languages (same failure mode as C1 content validation); keep the transcript band there.
