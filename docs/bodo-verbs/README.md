# Bodo action verbs, with native audio

**29 verbs, verified 2026-08-28.** English gloss, Bodo in Devanagari, romanization,
and one native audio clip each. `action-verbs.tsv` is the data; the columns map
straight onto the `phrases` table's `english`, `native_script` and `romanized`.

## Why this exists

**Bodo (`brx`) is `speechCapability: "unsupported"`.** Speech recognition
verifiably cannot hear it, so pronunciation is never scored and learners get the
listen-record-compare flow instead. **Bodo also has no real synthesis**: it falls
through to a default multilingual voice that does not know the language, so what
a Bodo learner hears in the app today is an approximation at best.

**These 29 clips are the first correct Bodo the app could speak.**

## Provenance

Recorded by **a native Bodo speaker known personally to the owner**, and used
**with their permission**. The written columns are theirs too: they listened back
to the recording across four passes and supplied the Devanagari and romanization
for every row.

**THE CONTRIBUTOR IS DELIBERATELY NOT NAMED HERE, AND MUST NOT BE NAMED IN CODE,
COMMENTS, COMMIT MESSAGES OR ANY SHIPPED SURFACE.** They asked for that
explicitly, to keep their own position clear. Keep the attribution outside the
repo.

**They also answer a problem recorded in CLAUDE.md**: all twelve reading passages
ship `verified: false` because they were written with no speaker to check them.
A willing native speaker is worth considerably more than this word list is.

## How the clips were made, and how to make more

The recording ran `English word / "means" / Bodo word`, one item at a time, with
**four seconds or more of silence between items**. That pause is the whole trick:
`silencedetect=noise=-38dB:d=0.30` returned exactly 87 segments, 29 x 3, and gaps
within an item never exceeded 3.59s while gaps between them never fell below
3.76s. **Ask for that format again and segmentation stays free.** A recording of
alternating full sentences cannot be segmented at all, mechanically or by ASR.

Clips are 16kHz mono WAV, 80ms of padding each side, about 1MB for the set. They
are NOT in this repo: where phrase audio should live is a separate decision,
since everything else in the app is TTS synthesised into the R2 cache.

## Two rows where the clip and the text differ

Both were ruled on by the owner: **the text is authoritative and the audio is
still fine to use.**

- **listen** — the clip carries an extra syllable, `khonaa-song-nai`, against the
  written `khonnai`.
- **read** — the clip reads as `khraainai` against the written `pharaainai`.
  Most likely `pha` misheard as `kha` by a recogniser that does not know Bodo.

Every other row agrees. Where the Bodo is two words the note column says what it
literally means: `knock` is knock-the-door, `clap` is hand-clap.

## What is NOT done

- **The clips have no home.** Nothing is wired up, and no lesson group exists.
- **The English glosses are bare verbs** where some Bodo entries are phrases. If
  the Bodo means "knock the door", the English column should probably say so.
