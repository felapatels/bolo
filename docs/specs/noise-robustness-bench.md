# Noise Robustness Bench — findings

**Task #1028. Measurement only: nothing in this bench touches the live evaluation route, the mobile app, or the web app.**

Bench: `qa/noise-robustness-bench.mjs`
Sample: `qa/pilot-results/noise-bench/sample.json` (committed)
Full results table: `qa/pilot-results/noise-bench/summary.md` (regenerate with `--report`)
Raw per-run records: `qa/pilot-results/noise-bench/results.jsonl` (gitignored — holds learner transcripts)

---

## 1. The one-line answer

**Do not ship audio cleanup.** Across 2,640 scored runs on a stratified 80-clip sample at a
five-rung noise ladder, **no cleanup chain produced a reproducible improvement at any noise
level, in either noise character** — and the trim variant reproducibly *destroys* scores. The
single significant win in the first pass (profile-based cleanup on babble at 20 dB, +15.2 points)
**did not reproduce** on an independent re-run of the same cell (+4.5 ± 4.6, not significant).
With ~20 cell comparisons at a 2-SE bar, roughly one false positive was expected; that was it.

What the bench *did* establish is worth more than the cleanup result:

1. **Speech babble is the entire problem. Steady broadband room noise is nearly free.** Babble
   already costs 16 points at 20 dB SNR — a background level most people would call quiet — and
   63 points at 0 dB. Broadband noise costs nothing measurable until 6 dB and only 16 points at
   0 dB.
2. **Cleanup does not help clean audio, and the generic filter leans negative** (−3.3 ± 2.5).
   The go/no-go below is a no-go.
3. **The scoring pipeline is far jitterier than anyone was accounting for**: the same clip, the
   same condition, transcribed twice, moves the score by 5.5 points on average and changes the
   displayed band 18% of the time. Any future "improvement" smaller than ~4 points on an 80-clip
   sample is unmeasurable at this sample size.
4. **Recording bitrate is the only lever still standing**, and it is weak: 96 kbps beats mobile's
   32 kbps by +6.1 ± 3.7 at 12 dB SNR with no-score rate 15% → 5%, but the replication came back
   +3.1 ± 3.2. Directionally consistent across all three rungs, never clearing 2 SE.

## 2. What was run

- **Sample** — 80 of the 237 frozen round-2 pilot clips, stratified by tester × language × label
  with largest-remainder allocation, seeded at 1028. Marginals land within one point of the
  corpus: testers 23/30/21/26% (corpus 23/29/21/27%), languages gu 49 / hi 46 / mr 5%, labels
  27/26/26/21%. The exact selection is committed so the run reproduces.
- **Noise ladder** — clean plus 20 / 12 / 6 / 0 dB SNR. Noise character is assigned per clip
  (40 broadband, 40 babble, alternating through the stratum-ordered list) rather than crossed
  with the ladder, which keeps the matrix at the budgeted 1,600 runs while covering both.
  Broadband is pink noise; babble is four staggered, rotated layers of *other* pilot clips, so no
  external noise assets were needed. Every mixed clip opens with **0.6 s of noise-only lead-in**
  (digital silence on the clean rung) so the profile-based pipeline has something realistic to
  profile from. Delivered SNR was verified against the requested rung with a rig check.
- **Pipelines** — `passthrough` (today), `generic` (highpass 80 Hz + lowpass 7.5 kHz + fixed-floor
  `afftdn` + `dynaudnorm`), `profiled` (`afftdn` sampling the clip's own opening), and
  `profiled_trim` (profile → clean → silence-trim to the dominant speech segment, gate derived
  from the measured lead level). Ordering is fixed profile → clean → trim; trimming first would
  delete the opening the profile reads.
- **Scoring** — the real dual-pass STT (`gpt-4o-mini-transcribe` + `gpt-4o-transcribe` in
  parallel) into the real `chooseConservativeTranscript` → `compareToTarget` → `applyScoreGuards`
  → honesty cap → `bandFromScore`, imported from the api-server sources rather than copied.
- **Label protocol** — score deltas are computed over `native` / `american_accent` /
  `subtle_error` only. A `wrong_attempt` scoring low is the corpus protocol working; those clips
  are reported in their own column.

### Deliberate deviation: the LLM judge is replaced

The stochastic `gpt-5.4-mini` text judge is substituted with a deterministic monotone proxy
(`round(sim × 100)`) feeding the real guards. Everything else on the path is production code.

**Why:** the bench measures *deltas*. The judge adds variance without adding signal about noise —
and, as section 5 shows, the transcription stage alone already contributes a ±3.8-point floor
that swamped most effects. Adding judge variance on top would have required several times the
sample to see the same effects. **What it costs:** absolute scores here are not the scores a
learner would see (the proxy is harsher on mid-similarity transcripts), and any effect that acts
*only* through judge behaviour is invisible to this bench. Deltas, no-score rates, and dual-pass
disagreement — the three metrics the task asked for — are unaffected.

## 3. Go/no-go: does cleanup hurt clean audio?

**No-go, on two counts: it does not help, and the generic chain leans harmful.**

| Pipeline | n | Δ vs passthrough on clean audio | nocatch | clips harmed | clips helped |
|---|---|---|---|---|---|
| passthrough | 63 | — | 4% | — | — |
| generic | 63 | **−3.3 ± 2.5** | 9% | 10 | 6 |
| profiled | 63 | +0.0 ± 3.2 | 5% | 12 | 7 |
| profiled_trim | 63 | −2.4 ± 3.4 | 8% | 11 | 7 |

Neither negative clears the 2-SE bar on its own, but the direction is consistent and the
per-clip counts show why the means look calm: cleanup does not leave clean audio alone, it
**shuffles it** — 10-12 clips of 63 get worse and 6-7 get better under every chain. The generic
filter also nearly doubles the no-score rate on clean audio (4% → 9%). This is the known failure
mode — denoising already-clean speech eats the consonant detail scoring depends on — showing up
exactly where it was predicted. Per the task's instruction, this shrinks the follow-on work
rather than being worked around.

## 4. Profiling from the clip's own opening vs a generic filter

Head to head, paired against passthrough at the same level (`*` = clears 2 SE):

| Noise | Level | Δ profiled | Δ generic | Δ profiled_trim |
|---|---|---|---|---|
| broadband | clean | +1.9 ± 5.0 | −0.8 ± 2.8 | −1.2 ± 6.0 |
| broadband | 20 dB | −2.8 ± 3.5 | +0.0 ± 2.3 | −17.3 ± 6.1 * |
| broadband | 12 dB | −16.3 ± 5.8 * | −8.9 ± 5.5 | −30.2 ± 6.7 * |
| broadband | 6 dB | −2.3 ± 4.4 | −0.6 ± 3.4 | −21.7 ± 6.0 * |
| broadband | 0 dB | −3.8 ± 4.0 | −0.7 ± 7.8 | −23.2 ± 6.3 * |
| babble | clean | −1.9 ± 4.0 | −5.7 ± 4.1 | −3.7 ± 3.2 |
| babble | 20 dB | **+15.2 ± 6.1 \*** | −3.0 ± 8.3 | −0.8 ± 6.8 |
| babble | 12 dB | −3.2 ± 6.2 | −3.6 ± 6.4 | −1.6 ± 8.3 |
| babble | 6 dB | −1.3 ± 6.7 | −3.9 ± 6.4 | +3.6 ± 7.0 |
| babble | 0 dB | −5.5 ± 4.2 | +3.1 ± 5.1 | +3.4 ± 4.2 |

Two cells were re-run end to end as an independent replication:

| Cell | First run | Replication | Verdict |
|---|---|---|---|
| babble 20 dB, profiled | +15.2 ± 6.1 * | +4.5 ± 4.6 | **did not reproduce** |
| babble 20 dB, profiled_trim | −0.8 ± 6.8 | −16.0 ± 6.8 * | did not reproduce (harm) |
| broadband 12 dB, profiled | −16.3 ± 5.8 * | +1.3 ± 3.8 | did not reproduce |
| broadband 12 dB, profiled_trim | −30.2 ± 6.7 * | −18.7 ± 6.4 * | **HOLDS (harm)** |

**Verdict: profiling from the clip's own opening is not better than a generic filter, because
neither is better than doing nothing.** Profiling is the *cheaper* of the two to be wrong with
(97 ms vs 104 ms, and it does not touch clean audio on average), but that is not a reason to
ship it. The one result that survives replication is the trim's harm.

## 5. The measurement floor (why several results evaporated)

Re-running the identical clean+passthrough condition on all 80 clips, with nothing changed but
the transcription call:

- mean repeat − baseline: **+0.6** (correctly ~0)
- mean absolute per-clip swing: **5.5 points**, sd 15.0
- standard error of a 63-clip cell mean: **±1.9** → read every delta against **±3.8**
- **band changed on repeat: 18%**; no-score flipped: 1%

This is a finding in its own right and belongs in any future scoring discussion: **roughly one
attempt in five would show a different band purely because the transcriber was called twice.**
It also sets the design rule for the successor work — an 80-clip sample cannot detect anything
smaller than ~4 points, so a cleanup that "helps a bit" is indistinguishable from doing nothing
without several hundred clips.

## 6. What noise actually costs today (passthrough, vs each clip's own clean score)

| Level | Broadband | Babble |
|---|---|---|
| 20 dB | +3.4 ± 4.8 (nothing) | **−16.0 ± 7.0** |
| 12 dB | +6.1 ± 5.6 (nothing) | **−22.4 ± 6.7** |
| 6 dB | −7.1 ± 5.4 | **−45.6 ± 7.9** |
| 0 dB | **−16.2 ± 5.0** | **−63.3 ± 5.9** |

No-score rate and dual-pass disagreement track the same split. Broadband: no-score stays 3-10%
and disagreement 33-58% across the whole ladder. Babble: no-score climbs 3% → 18% → 15% → 23% →
**33%**, and disagreement climbs 38% → 63% → 78% → 75% → **90%** (100% under the profiled chain
at 0 dB). Dual-pass disagreement is the cleanest available *proxy signal* for "this recording is
compromised" — it more than doubles under babble while barely moving under broadband.

## 7. Bitrate lever

Re-encoded before the noise mix, so the encoder sees the clean speech, then scored through
passthrough:

| Level | n | 32 kbps (mobile today) | 96 kbps | Δ (paired) | 32k nocatch | 96k nocatch |
|---|---|---|---|---|---|---|
| clean | 63 | 76.1 | 78.4 | +2.4 ± 2.4 | 4% | 4% |
| 12 dB | 63 | 67.9 | 74.0 | +6.1 ± 3.7 | **15% → 5%** | |
| 6 dB | 63 | 50.3 | 55.7 | +5.4 ± 5.0 | 19% | 20% |
| 12 dB (replication) | 63 | — | — | +3.1 ± 3.2 | 15% → 10% | |

All three rungs are positive, the no-score improvement at 12 dB reproduced in direction (15% →
5%, then 15% → 10%), and nothing clears 2 SE. **Recommendation: keep this open, do not act on it
yet.** It is the only treatment that never harmed anything, its cost is a recorder-preset change
rather than a processing stage on the latency path, and its plausible mechanism is exactly the
one the task named — a lossy encoder at 32 kbps spending its budget on whatever is loudest. But
it has not been shown to work. A dedicated bitrate-only run at ~250 clips would settle it, and
that is a much cheaper experiment than the cleanup work it would replace.

## 8. Added processing time

| Pipeline | mean | p90 | max |
|---|---|---|---|
| passthrough (ffmpeg no-op floor) | 91.9 ms | 98.8 ms | 1324.8 ms |
| generic | 103.5 ms | 107.3 ms | 3120.1 ms |
| profiled | 96.9 ms | 107.5 ms | 185.2 ms |
| profiled_trim | 188.2 ms | 203.3 ms | 344.9 ms |

Read these **net of the ~92 ms passthrough floor**, which is ffmpeg process startup on a ~2.5 s
clip, not filtering: generic ≈ +12 ms, profiled ≈ +5 ms, profiled_trim ≈ +96 ms. Filtering itself
is cheap next to the 1.2 s median dual-pass STT. Latency was never the reason to decline cleanup;
efficacy is.

## 9. Measured cost of the bench

- **2,640 scoring runs / 5,280 transcription calls**, 99.4 min of audio across both passes.
- **~$0.54** of transcription (partially inferred: ~10 audio tokens/s at published
  mini/high-quality rates; the transcription API does not return usage here).
- **~22 min of wall time** at concurrency 5, in resumable ≤4-minute foreground chunks.
  **Zero failures and zero rate-limit retries** across all 5,280 calls — the dual-pass STT path
  (direct OpenAI key, not the chat proxy) tolerated concurrency 5 comfortably.
- The 10-clip cost slice measured 1.2 s/run and predicted ~30 min for the 1,600-run matrix; the
  actual matrix ran faster (0.4-0.5 s/run at higher concurrency), so the ladder was never cut and
  the budget instead paid for the variance control, two replications, and a full-sample bitrate
  lever.

## 10. Recommended constants, and what to drop

| Treatment | Recommendation |
|---|---|
| Generic speech cleanup chain | **Drop.** No benefit at any level; leans negative on clean audio and doubles clean-audio no-scores. |
| Profile-from-the-clip cleanup | **Drop.** Its one win did not replicate. Beats the generic filter only in the sense of being harmless more often. |
| Trim to dominant speech | **Drop, hardest of the four.** The only reproducible effect in the bench, and it is harm (−18.7 ± 6.4 on replication). |
| Higher recording bitrate | **Keep open, unproven.** Cheapest remaining lever; needs a ~250-clip bitrate-only run before anyone touches the recorder preset. |
| SNR threshold to switch cleanup on | **None exists.** There is no level at which any chain reproducibly helps, so there is no threshold to encode. |
| Cleanup must stay off | **Everywhere**, and most firmly on clean and near-clean audio. |

Constants worth carrying forward into any successor work:

- **Measurement floor: ±3.8 points** on an 80-clip sample; **band flips 18%** of the time on a
  repeat transcription. Sample sizes and success criteria must be set against these.
- **Babble at 20 dB SNR already costs 16 points**; broadband is free until ~6 dB. If anything is
  detected, detect *babble*, not loudness.
- **Dual-pass disagreement rises 38% → 90% under babble** while broadband holds near 50%. That
  is the strongest in-band signal available for "this recording was compromised" — and it needs
  no extra processing, because both passes already run.

**What this means for the follow-on "adapt to noisy rooms automatically" work: the cleanup half
of it is dead.** What survives is detection — telling the learner (or the scorer) that a
recording was compromised — for which dual-pass disagreement is already measured on every
attempt at zero added cost.

## 11. Reproducing

```bash
node qa/noise-robustness-bench.mjs --select                       # deterministic 80-clip sample
node qa/noise-robustness-bench.mjs --rig-check --limit 2          # verify delivered SNR, no API spend
node qa/noise-robustness-bench.mjs --run --max-minutes 4          # main matrix, resumable; repeat until done
node qa/noise-robustness-bench.mjs --run --control                # variance floor
node qa/noise-robustness-bench.mjs --run --replicate babble:snr20 # re-run a standout cell
node qa/noise-robustness-bench.mjs --run --bitrate-lever          # bitrate experiment + its replication
node qa/noise-robustness-bench.mjs --report                       # regenerate summary.md
```

Requires the R2 credentials (clips are fetched per run and cached in `/tmp`, never committed) and
`qa/pilot-results/manifest.json`, the frozen round-2 corpus record. **Never run
`qa/harvest-pilot-corpus.mjs`** — it overwrites that manifest, which is not in version control.
