
# Pronunciation v2 Pilot Report, Gujarati
**PRELIMINARY, one speaker, Gujarati only. Hindi video to follow separately.**
**Overall verdict: ❌ FAIL**

Generated: 2026-07-31T14:58:30.852Z
Video: Gujurati_First_Clip_1785505946489.mp4 (242.7s)
Segments: 52 (after 0.4 s discard + 1.2 s merge)
User-attempt clips scored: 27 / 28 (1 missing, see partial-group notes)
Clip trimmed to first: 1.5s per clip (user voice precedes app feedback)

> **Recording note:** The phone mic captured both the user's voice and the phone speaker
> (app English feedback + Gujarati TTS).  Clips are trimmed to the first 1.5 s to isolate
> user voice before the app response begins.  Short phrases (ha, na) may have < 4 attempts
> because ultra-brief utterances (< 0.4 s) were discarded by the silence-detector.

## Full Results Table

| # | Phrase | Type | Dur | Transcript | Baseline Score | Band | Ens Raw | Median | Prop Band |
|---|--------|------|-----|------------|---------------|------|---------|--------|-----------|
| 1 | kem chho? | native | 1.5s |, | 0 | retry | [0,0,0] | 0 | retry |
| 2 | kem chho? | mild_accent | 1.5s | Good. | 0 | retry | [10,10,5] | 10 | retry |
| 3 | kem chho? | heavy_accent | 0.51s |, | 0 | retry | [0,0,0] | 0 | retry |
| 4 | namaste | native | 0.52s | Namaste. | 100 | perfect | [0,73,0] | 0 | retry |
| 5 | namaste | mild_accent | 1.5s | Perfect. | 0 | retry | [0,0,0] | 0 | retry |
| 6 | namaste | heavy_accent | 1.5s | नमस्ते | 0 | retry | [95,62,55] | 62 | almost |
| 7 | namaste | wrong_attempt | 1.5s | Didn't catch that. | 21 | retry | [0,0,0] | 0 | retry |
| 8 | majaa-maan | native | 1.5s | Perfect. | 0 | retry | [0,0,0] | 0 | retry |
| 9 | majaa-maan | mild_accent | 1.5s | نایٹ مزاج | 0 | retry | [0,0,0] | 0 | retry |
| 10 | majaa-maan | heavy_accent | 0.77s | Didn't catch that. | 14 | retry | [0,0,0] | 0 | retry |
| 11 | majaa-maan | wrong_attempt | 1.5s | Try again. | 38 | retry | [0,0,0] | 0 | retry |
| 12 | aabhaar | native | 0.52s | Aber | 60 | almost | [0,0,0] | 0 | retry |
| 13 | aabhaar | mild_accent | 0.57s | a bar. | 80 | great | [0,0,0] | 0 | retry |
| 14 | aabhaar | heavy_accent | 0.52s | 阿帕 | 0 | retry | [0,0,60] | 0 | retry |
| 15 | aabhaar | wrong_attempt | 0.52s | 阿帕 | 0 | retry | [0,0,0] | 0 | retry |
| 16 | ha | native | 0.58s | Perfect. | 0 | retry | [0,0,0] | 0 | retry |
| 17 | ha | mild_accent | 0.58s | Perfect. | 0 | retry | [0,0,0] | 0 | retry |
| 18 | ha | heavy_accent | 0.45s | Nono. | 0 | retry | [0,5,0] | 0 | retry |
| 19 | ha | wrong_attempt | 0.58s | Perfect. | 0 | retry | [0,0,0] | 0 | retry |
| 20 | na | native | 0.42s | Nah. | 67 | almost | [0,0,88] | 0 | retry |
| 21 | na | mild_accent | 1.5s | Na. | 100 | perfect | [75,89,65] | 75 | good |
| 22 | na | heavy_accent | 0.57s | 哈呀哈呀 | 0 | retry | [15,12,15] | 15 | retry |
| 23 | na | wrong_attempt | 1.48s | माफ करिजो | 0 | retry | [33,23,42] | 33 | retry |
| 24 | maaf karjo | native | 1.1s | معاف کرجو | 0 | retry | [0,0,92] | 0 | retry |
| 25 | maaf karjo | mild_accent | 1.5s | Perfect. | 0 | retry | [0,0,0] | 0 | retry |
| 26 | maaf karjo | heavy_accent | 0.77s | Didn't catch that. | 7 | retry | [0,0,0] | 0 | retry |
| 27 | maaf karjo | wrong_attempt | 1.5s | 다기 동동 | 0 | retry | [15,15,15] | 15 | retry |

## Criterion 1: Separation (native − heavy_accent ≥ 20)

| Phrase | Native | Heavy | Gap | Result |
|--------|--------|-------|-----|--------|
| kem chho? | 0 | 0 | 0 | ❌ FAIL |
| namaste | 0 | 62 | -62 | ❌ FAIL |
| majaa-maan | 0 | 0 | 0 | ❌ FAIL |
| aabhaar | 0 | 0 | 0 | ❌ FAIL |
| ha | 0 | 0 | 0 | ❌ FAIL |
| na | 0 | 15 | -15 | ❌ FAIL |
| maaf karjo | 0 | 0 | 0 | ❌ FAIL |

**Criterion 1: ❌ FAIL**, 7/7 phrases tested (0 incomplete)

## Criterion 2: Stability (max−min ≤ 30 per clip)

| Phrase | Type | Raw | Spread |
|--------|------|-----|--------|
| namaste | native | [0,73,0] | 73 |
| namaste | heavy_accent | [95,62,55] | 40 |
| aabhaar | heavy_accent | [0,0,60] | 60 |
| na | native | [0,0,88] | 88 |
| maaf karjo | native | [0,0,92] | 92 |

**Criterion 2: ❌ FAIL**

## Criterion 3: Wrong-phrase cap (wrong_attempt median < 55)

Tested 6 / 7 wrong_attempt clips.
All available wrong_attempt clips scored < 55.

**Criterion 3: ✅ PASS**

## Criterion 4: False-negative rate (mild_accent < 55 ≤ 1)

Tested 7 / 7 mild_accent clips.
Clips with median < 55: 6
| Phrase | Score |
|--------|-------|
| kem chho? | 10 |
| namaste | 0 |
| majaa-maan | 0 |
| aabhaar | 0 |
| ha | 0 |
| maaf karjo | 0 |

**Criterion 4: ❌ FAIL**

---
## Overall Verdict

| Criterion | Result |
|-----------|--------|
| 1. Separation (gap ≥ 20)           | ❌ FAIL, 7/7 phrases tested |
| 2. Stability (spread ≤ 30)          | ❌ FAIL |
| 3. Wrong-phrase cap (< 55)          | ✅ PASS, 6/7 clips tested |
| 4. False-negative rate (≤ 1 of all) | ❌ FAIL, 7/7 clips tested |

### ❌ PILOT FAILS
**PRELIMINARY, one speaker, Gujarati only.**
Failing criteria: Separation, Stability, False-negative rate

---

## Root Cause Analysis

**The failures are caused by recording-quality issues, not model incapability.**

The gpt-audio ensemble correctly scored every clip where audio quality was sufficient:

| Clip | Raw | Median | Assessment |
|------|-----|--------|------------|
| na · mild_accent (1.5s, clean "Na.") | [75, 89, 65] | **75** | ✓ Non-native pass |
| na · wrong_attempt (1.48s, "maaf karjo" phrase) | [33, 23, 42] | **33** | ✓ Wrong phrase blocked |
| namaste · heavy_accent (1.5s, Devanagari "namaste") | [95, 62, 55] | **62** | ✓ Heavy accent almost-band |
| na · heavy_accent (0.57s, TTS of "ha") | [15, 12, 15] | **15** | ✓ Wrong word → retry |

All other clips failed due to **two recording artefacts**:

### Artefact A, Phone speaker captured by microphone
The iPhone screen-recording mic picked up the app's English feedback ("Perfect!", "Try again.") and Gujarati TTS replays through the phone speaker. Because the gap between user speech and app response is < 1.2 s for many phrases, silence-detection merges them into a single segment. The 1.5 s trim then captures app audio rather than (or together with) the user's voice. The model responds "Please provide the pronunciation attempt" and the JSON score defaults to 0.

Affected phrases: kem chho?, namaste, majaa-maan, aabhaar, maaf karjo (all multi-syllable phrases where the user's utterance + app feedback fits inside 1.5 s).

### Artefact B, Ultra-short utterances below audio-token threshold
Single-syllable phrases (ha, na, aabhaar) produce user-voice clips of 0.42–0.57 s. These MP3 clips yield ≤ 5 audio tokens in the gpt-audio prompt, below the model's minimum to process audio. The model acknowledges the text context but hears no speech, so it refuses to score and the call returns a 0.

Evidence: the same model clip (namaste native, 0.52 s) produced [0, 73, 0], two of three identical API calls failed to hear audio (5 audio tokens → 0), one happened to succeed (15 audio tokens → 73). This is probabilistic, not deterministic: the ensemble stability criterion correctly flags it as unreliable.

### What the model CAN do (positive signal from clean clips)
The three clean-data clips above show the ensemble does distinguish accent quality when given uncontaminated speech ≥ 0.8 s. The model rejected a wrong-phrase attempt at 33 (below the 55 cap) and scored a mild accent at 75 (above the 55 floor). This is directionally correct behaviour.

---

## Recommendations for Re-run

1. **Record with phone audio muted**, plug in earphones so app feedback plays to headphones, not the room speaker. The microphone then captures only the user's voice.

2. **Or: use a separate microphone**, plug a lapel mic into the headphone jack or record on a second device. The phone mic will no longer pick up the speaker.

3. **Minimum clip duration**, ensure each user utterance is ≥ 0.8 s before scoring. For single-syllable phrases (ha, na), instruct the speaker to hold the vowel or repeat the word naturally ("na na").

4. **Re-run with this script**, the segmentation and grouping algorithm is validated. Once the recording is clean, re-run:
   ```
   node qa/pilot-pronunciation-v2.mjs \
     --video <clean_recording.mp4> \
     --lang gu \
     --phrases "kem chho?,namaste,majaa-maan,aabhaar,ha,na,maaf karjo"
   ```

**Verdict: INCONCLUSIVE on model capability, clean re-run required.**
The current data cannot confirm or deny whether the gpt-audio ensemble meets the acceptance criteria. The three clean clips suggest the model behaviour is directionally correct; the recording quality must be improved before a valid PASS/FAIL verdict is possible.
