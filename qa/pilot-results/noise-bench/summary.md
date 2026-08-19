# Noise robustness bench — results

Runs recorded: 2640 (main 1600, bitrate lever 480).
Sample: 80 clips, seed 1028, ladder clean / snr20 / snr12 / snr6 / snr0.
Score deltas are vs each clip's own clean+passthrough score and are computed over native/american_accent/subtle_error clips only — a wrong_attempt scoring low is the protocol working, not a regression (reported separately).

## Steady broadband room noise

| Level | Pipeline | n | Δscore vs clean (±SE) | mean score | nocatch | STT passes disagree | wrong_attempt mean | +proc ms |
|---|---|---|---|---|---|---|---|---|
| clean | passthrough | 40 | +0.0 ± 0.0 | 75.3 | 5% | 50% | 0.0 | 90.7 |
| clean | generic | 40 | -0.8 ± 2.8 | 74.4 | 8% | 48% | 0.0 | 94.5 |
| clean | profiled | 40 | +1.9 ± 5.0 | 77.2 | 5% | 50% | 0.0 | 98.7 |
| clean | profiled_trim | 40 | -1.2 ± 6.0 | 74.0 | 5% | 43% | 0.0 | 187.2 |
| snr20 | passthrough | 40 | +3.4 ± 4.8 | 78.6 | 8% | 38% | 2.5 | 119.8 |
| snr20 | generic | 40 | +3.4 ± 5.1 | 78.7 | 3% | 43% | 0.0 | 175.0 |
| snr20 | profiled | 40 | +0.5 ± 4.3 | 75.8 | 8% | 43% | 0.0 | 97.1 |
| snr20 | profiled_trim | 40 | -13.9 ± 6.5 | 61.4 | 10% | 58% | 0.0 | 185.3 |
| snr12 | passthrough | 40 | +6.1 ± 5.6 | 81.3 | 3% | 33% | 3.4 | 86.5 |
| snr12 | generic | 40 | -2.8 ± 5.3 | 72.4 | 10% | 40% | 4.3 | 94.6 |
| snr12 | profiled | 40 | -10.2 ± 7.2 | 65.0 | 13% | 50% | 2.5 | 97.7 |
| snr12 | profiled_trim | 40 | -24.1 ± 6.0 | 51.2 | 13% | 60% | 1.1 | 191.4 |
| snr6 | passthrough | 40 | -7.1 ± 5.4 | 68.2 | 10% | 50% | 3.4 | 88.6 |
| snr6 | generic | 40 | -7.7 ± 5.0 | 67.6 | 5% | 48% | 0.0 | 95.3 |
| snr6 | profiled | 40 | -9.4 ± 6.3 | 65.9 | 18% | 50% | 2.1 | 96.6 |
| snr6 | profiled_trim | 40 | -28.8 ± 5.7 | 46.4 | 8% | 68% | 4.0 | 188.5 |
| snr0 | passthrough | 40 | -16.2 ± 5.0 | 59.1 | 5% | 58% | 0.0 | 88.5 |
| snr0 | generic | 40 | -16.9 ± 7.5 | 58.3 | 8% | 60% | 0.0 | 94.1 |
| snr0 | profiled | 40 | -19.9 ± 5.4 | 55.3 | 5% | 60% | 0.9 | 94.2 |
| snr0 | profiled_trim | 40 | -39.4 ± 6.5 | 35.8 | 15% | 85% | 0.0 | 188.0 |

## Speech babble

| Level | Pipeline | n | Δscore vs clean (±SE) | mean score | nocatch | STT passes disagree | wrong_attempt mean | +proc ms |
|---|---|---|---|---|---|---|---|---|
| clean | passthrough | 40 | +0.0 ± 0.0 | 82.5 | 3% | 38% | 20.2 | 89.2 |
| clean | generic | 40 | -5.7 ± 4.1 | 76.8 | 10% | 35% | 17.6 | 96.9 |
| clean | profiled | 40 | -1.9 ± 4.0 | 80.6 | 5% | 43% | 14.9 | 96.8 |
| clean | profiled_trim | 40 | -3.7 ± 3.2 | 78.8 | 10% | 38% | 13.9 | 188.9 |
| snr20 | passthrough | 40 | -16.0 ± 7.0 | 66.5 | 18% | 63% | 8.3 | 89.3 |
| snr20 | generic | 40 | -19.1 ± 6.9 | 63.5 | 20% | 50% | 14.1 | 96.9 |
| snr20 | profiled | 40 | -0.8 ± 4.0 | 81.7 | 8% | 48% | 9.9 | 97.6 |
| snr20 | profiled_trim | 40 | -16.9 ± 4.9 | 65.6 | 8% | 65% | 14.8 | 187.1 |
| snr12 | passthrough | 40 | -22.4 ± 6.7 | 60.2 | 15% | 78% | 5.6 | 88.0 |
| snr12 | generic | 40 | -26.0 ± 7.2 | 56.5 | 13% | 70% | 10.8 | 95.3 |
| snr12 | profiled | 40 | -25.5 ± 6.7 | 57.0 | 13% | 73% | 10.8 | 96.5 |
| snr12 | profiled_trim | 40 | -24.0 ± 6.7 | 58.5 | 8% | 65% | 13.9 | 187.0 |
| snr6 | passthrough | 40 | -45.6 ± 7.9 | 36.9 | 23% | 75% | 5.0 | 91.2 |
| snr6 | generic | 40 | -49.5 ± 6.9 | 33.0 | 13% | 88% | 12.6 | 99.2 |
| snr6 | profiled | 40 | -46.9 ± 7.8 | 35.6 | 30% | 83% | 11.2 | 97.7 |
| snr6 | profiled_trim | 40 | -42.0 ± 7.0 | 40.5 | 10% | 80% | 8.3 | 187.1 |
| snr0 | passthrough | 40 | -63.3 ± 5.9 | 19.2 | 33% | 90% | 4.6 | 87.1 |
| snr0 | generic | 40 | -60.2 ± 6.5 | 22.3 | 18% | 95% | 7.8 | 93.6 |
| snr0 | profiled | 40 | -68.9 ± 5.5 | 13.6 | 33% | 100% | 9.8 | 95.8 |
| snr0 | profiled_trim | 40 | -59.9 ± 6.8 | 22.6 | 23% | 90% | 10.0 | 191.1 |

## Measurement noise floor (same clip, same condition, transcribed twice)

Transcription is stochastic, so identical inputs do not score identically. Re-running clean+passthrough on all 80 clips gives the floor every delta below must clear:

- Mean repeat−baseline delta: +0.6 (should be ~0; n=63 quality clips)
- Mean ABSOLUTE per-clip swing: 5.5 points, sd 15.0
- Standard error of a 63-clip cell mean: ±1.9 points
- Band changed on repeat: 18%; nocatch flipped: 1%

**Read every cell delta against ±3.8 (2 SE). Smaller movements are transcription jitter, not an effect.**

## Go/no-go: does cleanup hurt CLEAN audio?

| Pipeline | n | Δscore vs passthrough (clean, ±SE) | nocatch | disagree | clips harmed | clips helped |
|---|---|---|---|---|---|---|
| passthrough | 63 | +0.0 ± 0.0 | 4% | 44% | 0 | 0 |
| generic | 63 | -3.3 ± 2.5 | 9% | 41% | 10 | 6 |
| profiled | 63 | +0.0 ± 3.2 | 5% | 46% | 12 | 7 |
| profiled_trim | 63 | -2.4 ± 3.4 | 8% | 40% | 11 | 7 |

## Profiled (clip's own opening) vs generic filter, per noise character

Each cell is paired against passthrough AT THE SAME LEVEL. "significant" = |Δ| > 2 SE.

| Noise | Level | Δ profiled | Δ generic | Δ profiled_trim | best (significant only) |
|---|---|---|---|---|---|
| broadband | clean | +1.9 ± 5.0 | -0.8 ± 2.8 | -1.2 ± 6.0 | none (keep passthrough) |
| broadband | snr20 | -2.8 ± 3.5 | +0.0 ± 2.3 | -17.3 ± 6.1 | none (keep passthrough) |
| broadband | snr12 | -16.3 ± 5.8 | -8.9 ± 5.5 | -30.2 ± 6.7 | none (keep passthrough) |
| broadband | snr6 | -2.3 ± 4.4 | -0.6 ± 3.4 | -21.7 ± 6.0 | none (keep passthrough) |
| broadband | snr0 | -3.8 ± 4.0 | -0.7 ± 7.8 | -23.2 ± 6.3 | none (keep passthrough) |
| babble | clean | -1.9 ± 4.0 | -5.7 ± 4.1 | -3.7 ± 3.2 | none (keep passthrough) |
| babble | snr20 | +15.2 ± 6.1 * | -3.0 ± 8.3 | -0.8 ± 6.8 | profiled |
| babble | snr12 | -3.2 ± 6.2 | -3.6 ± 6.4 | -1.6 ± 8.3 | none (keep passthrough) |
| babble | snr6 | -1.3 ± 6.7 | -3.9 ± 6.4 | +3.6 ± 7.0 | none (keep passthrough) |
| babble | snr0 | -5.5 ± 4.2 | +3.1 ± 5.1 | +3.4 ± 4.2 | none (keep passthrough) |

## Replication of standout cells (independent re-run)

With ~20 cell comparisons at a 2-SE bar, about one false positive is expected. A cell only counts if it survives a repeat.

| Noise | Level | Pipeline | Δ vs passthrough — first run | Δ vs passthrough — replication | holds? |
|---|---|---|---|---|---|
| babble | snr20 | generic | -3.0 ± 8.3 | +1.9 ± 5.6 | n/a (neither significant) |
| babble | snr20 | profiled | +15.2 ± 6.1 * | +4.5 ± 4.6 | no — did not reproduce |
| babble | snr20 | profiled_trim | -0.8 ± 6.8 | -16.0 ± 6.8 * | no — did not reproduce |
| broadband | snr12 | generic | -8.9 ± 5.5 | -9.0 ± 6.1 | n/a (neither significant) |
| broadband | snr12 | profiled | -16.3 ± 5.8 * | +1.3 ± 3.8 | no — did not reproduce |
| broadband | snr12 | profiled_trim | -30.2 ± 6.7 * | -18.7 ± 6.4 * | yes |

## Bitrate lever (re-encode before the noise mix, passthrough scoring)

| Level | n | 32 kbps (mobile) | 96 kbps | Δ (96 − 32, paired ±SE) | 32k nocatch | 96k nocatch |
|---|---|---|---|---|---|---|
| clean | 63 | 76.1 | 78.4 | +2.4 ± 2.4 | 4% | 4% |
| snr12 | 63 | 67.9 | 74.0 | +6.1 ± 3.7 | 15% | 5% |
| snr6 | 63 | 50.3 | 55.7 | +5.4 ± 5.0 | 19% | 20% |
| snr12 (replication) | 63 | — | — | +3.1 ± 3.2 | 15% | 10% |

## Added processing time per clip (this sits on a latency-sensitive path)

| Pipeline | mean ms | p90 ms | max ms |
|---|---|---|---|
| passthrough | 91.9 | 98.8 | 1324.8 |
| generic | 103.5 | 107.3 | 3120.1 |
| profiled | 96.9 | 107.5 | 185.2 |
| profiled_trim | 188.2 | 203.3 | 344.9 |

## Measured cost of the bench itself

- Scoring runs: 2640 (2 transcription calls each = 5280 calls).
- Audio transcribed: 99.4 min across both passes.
- Estimated transcription spend: $0.54 (partially inferred: ~10 audio tokens/s at published mini/hq rates).
- Dual-pass STT latency: median 1.2s, p90 2.6s.

## Derived thresholds

Significant HELP (Δ > 2 SE over passthrough at the same level):
- babble snr20 profiled: +15.2 ± 6.1 — replication +4.5 ± 4.6: did NOT reproduce

Significant HARM (Δ < −2 SE):
- broadband snr20 profiled_trim: -17.3 ± 6.1
- broadband snr12 profiled: -16.3 ± 5.8 — replication +1.3 ± 3.8: did NOT reproduce
- broadband snr12 profiled_trim: -30.2 ± 6.7 — replication -18.7 ± 6.4: HOLDS
- broadband snr6 profiled_trim: -21.7 ± 6.0
- broadband snr0 profiled_trim: -23.2 ± 6.3

Measurement floor for reference: ±3.8 points on an 80-clip cell.

Noise cost with today's behaviour (passthrough vs its own clean score):
- broadband: snr20 +3.4 ± 4.8, snr12 +6.1 ± 5.6, snr6 -7.1 ± 5.4, snr0 -16.2 ± 5.0
- babble: snr20 -16.0 ± 7.0, snr12 -22.4 ± 6.7, snr6 -45.6 ± 7.9, snr0 -63.3 ± 5.9
