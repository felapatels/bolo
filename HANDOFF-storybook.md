# Handoff: the storybook, 2026-08-23 (night)

## Name this session BOLO BUILD CHAT 5

The user runs several Claude Code tabs at once and needs to tell them apart at a
glance. Their global `CLAUDE.md` requires an H1 app name as the first line of
**every** response. For Bolo that heading is numbered:

```
# BOLO BUILD CHAT 5
```

Chat 1 was the Android sign-out. Chat 2 built the contribution page. Chat 3
extracted `lib/script-trace`. Chat 4 was Script Trace end to end plus the story
engine. **You are chat 5.** Increment once per session, never mid-session.

---

**Read `CLAUDE.md` first, then this.** Everything below was measured or read out
of source. Where something is unproven it says so.

---

## 1. Orientation

- **Repo:** `/Users/aakeshpatel/bolo`, remote `github.com/felapatels/bolo`, `main`.
- **HEAD and `origin/main` are both `0aeb3670`.** Working tree clean.
- **Sixteen commits landed today**, `267202e6` through `0aeb3670`.
- **The user works on the Mac.** Replit is a deploy target, not a workspace.

**ALWAYS PASTE SHELL COMMANDS AS BLOCKS, AND SAY WHICH TERMINAL.** Asked for
explicitly tonight after I described a deploy instead of pasting it. Section 8
has every block this project needs.

---

## 2. THE JOB: the storybook. Engine done, nothing playable.

The user's design, in their words:

> **The clip game and the storybook are one engine.** A scene is shown. The
> learner picks the line that fits it. The choice decides what happens next.
> Only the scene renderer differs.
>
> Scene, Choice, Consequence, Ledger.

**Three tiers, one engine**, their costing:

| Tier | Scene is | 300-scene library | Status |
|---|---|---|---|
| 1 | a generated illustration | near zero, already paid for | buildable now |
| 2 | a generated clip, Veo 3.1 Lite | ≈ $120 once, all 22 languages | viable |
| 3 | a filmed native speaker | a shoot, per language | premium only, curated |

Their reasoning for the order: Tier 1 proves the mechanic for almost nothing,
and **the common criticism of Memrise's native-speaker clips is inconsistent
authenticity, so a small curated Tier 3 set beats a large scrappy one.**

### Decisions already made, do not relitigate

- **Tier 2 clips are SILENT.** Confirmed by the user. A clip carrying speech is
  no longer language-neutral and the library goes from 300 generations to 6,600.
  It also means asking a video model to pronounce 22 South Asian languages with
  nobody able to check 20 of them, which is how the twelve reading passages
  ended up `verified: false`.
- **Audio is added separately, by ElevenLabs, as ambience.** The user's pipeline:
  generate video with no audio, then layer sound. Ambience must ALSO carry no
  intelligible speech or the language-neutrality is lost. Traffic, a kettle, a
  station chime are fine.
- **Our ElevenLabs integration is text-to-speech only** (`textToSpeechElevenLabs`
  in `lib/integrations-openai-ai-server/src/audio/client.ts`). The sound-effects
  endpoint is new work. **ffmpeg is already in the toolchain**
  (`audioNoise.ts`, `genBandClips.ts`), so muxing needs no new dependency.
- **Branches converge**, and the book is the RECORD of their choices rather than
  generated prose. Zero generation risk, nothing to verify in 22 languages.
- **`generateImageBuffer` exists and has never been called.** That is the Tier 1
  renderer, already wired.

### What is built: `lib/story`, and only that

Pure. No React, no DOM, no database. The corpus lookup is passed IN.

| function | does |
|---|---|
| `mediaFor` | richest tier this language can use, falling back |
| `resolveScene` | null when the language cannot carry it, never a partial board |
| `orderChoices` | deterministic shuffle, seeded on scene + language |
| `chooseScene` | EVERY choice advances, including ones that do not fit |
| `playablePath` | walks the graph, with a cycle guard |
| `availableScenes` | how much of a library a language actually gets |

`STARTER_SCENES` is a five-scene converging graph at a family table.
**17 tests in `artifacts/gujarati-coach/src/test/story-engine.test.ts`.**

### THE MEASUREMENT THAT SHAPED IT, do not re-derive

Against production, 2026-08-23:

```
1,809 distinct English concepts across 10,339 phrases
each language carries 210 to 232 of them
only 38 appear in 20 or more languages
only  3 appear in all 22
```

**The corpus is NOT a uniform translation of one phrasebook.** The plan assumed
a scene could name a concept and every language would resolve it for free. It
cannot. What all 22 share is family words, the numbers one to twenty, and
water, salt, spoon. That is why the starter graph is set at a family table.

Designed for, not worked around: a scene whose concept a language lacks resolves
to **null** and the caller skips it, exactly as `traceStopFor()` does for an
unauthored script.

### What is NOT built

| piece | state |
|---|---|
| corpus wiring | concept to native phrase needs an endpoint. **None exists.** |
| web UI | nothing |
| mobile UI | nothing |
| persistence | the ledger is a return value. Nothing stores it. |
| art | media refs point at files that do not exist |
| journey placement | nothing opens it |

### The order agreed, and where I stopped

1. **Server endpoint.** Given a language and a list of concepts, return each
   phrase (native script, romanized, audio). Everything is blocked on this.
   Suggested shape: one request per session for all concepts the graph uses,
   not one per scene. Missing concepts simply absent from the response, which
   is what feeds the engine's `has`.
2. **Regenerate the API client**: `pnpm --filter @workspace/api-spec run codegen`.
3. **Web UI.** Picture, three lines, tap, next. Reuse the existing game frame.
4. **Ledger.** localStorage first. A table means a migration, and **nothing in
   this repo migrates production.**
5. **Art.** Five Tier 1 stills for the starter graph.
6. **Journey placement.** The row machinery exists: see section 4.
7. **Mobile twin.**

**I stopped at step 1 having written nothing**, on the user's "wait". The tree is
clean. Steps 1 to 4 get it playable on web, which is the first honest checkpoint.

**BUILD IT WEB-FIRST.** Section 6 explains why in the strongest terms available:
it cost two store builds today.

---

## 3. THE IOS GATE

**The user has said no more iOS builds until the story is done.** Android is not
covered by that but there is no reason to build it either until there is
something to see.

| | build | commit | state |
|---|---|---|---|
| iOS | 502 | `b8bc5ac5` | **in TestFlight**, 10 cold launches for 10 |
| Android | 503 | `7fbf92be` | built, **never submitted** |

Both predate the last four commits. `app.json` is at version **1.0.2**, iOS
buildNumber 502, Android versionCode 503. **1.0.0 and 1.0.1 are closed trains:
bump `expo.version`, not just the build number.**

---

## 4. What Script Trace became today, since you will touch it

- **The tracing stop is on the journey map on both platforms.** One per fare
  zone. `pts` DRAWS, `stationPts` COUNTS, and the tracing row advances the
  layout without advancing `k`. On the phone it is `kind: 'trace'` beside
  `kind: 'halt'`, which already worked that way. **That machinery is what step 6
  should reuse.**
- **Zone 1's stop is always stop 2**, so the free taste is reachable.
- **The free taste**: the first 3 characters of journey 1 zone 1, every language,
  any plan. `TRACE_TEASER_LIMIT`. Later zones are All-Access.
- **The demo plays a real hand where one exists**, smoothed through the recorded
  points with a centripetal Catmull-Rom spline. Where none exists it plays the
  skeleton, starting on the side the script is written from.
- **Devanagari is on a real hand**: Bharti traced all 48 letters today, which
  turned the demo on for 8 languages at once. Gujarati and Devanagari are the
  only two scripts on real data. **Perso-Arabic is next and buys 3.**
- **A score card**, sharing the five-band ladder with the voice lessons.

---

## 5. Traps, each learned by falling in today

- **`buildAuthoredGlyphs.ts --write` came within one flag of destroying Bharti's
  45 Gujarati letters.** It replaces `contributed-strokes.ts` wholesale, and
  **production holds no usable Gujarati row**: every one is a probe or a `test_`
  name, all dropped by `isTestContributor`. It now carries forward any script
  the database cannot supply, loudly. **Those 45 letters exist ONLY in the
  generated file.** Never regenerate without reading the dry run first.
- **`npx eas` from the repo root fails.** `eas-cli` is a dependency of the mobile
  workspace only. Use `./node_modules/.bin/eas` from `artifacts/bolo-mobile`.
- **`npx tsc -b` at the root does NOT typecheck the artifacts.** The chat 3
  handoff says it covers the monorepo. It does not. Use `pnpm run typecheck`.
- **Mobile's api-client mocks are full replacements.** Importing a new hook into
  a widely-tested screen kills those suites at render. Two journey suites died
  this way today. Web solved this with `api-client-mock.ts`; **porting that to
  the phone is real work nobody has done.**
- **Adding a workspace dependency moved the lockfile 5 lines**, not the churn
  CLAUDE.md warns about. A workspace link is not a registry package.

---

## 6. THE PROCESS FAILURE, and the tool that fixes it

**Two store builds shipped with the writing demo visibly wrong.** First it played
four to nine disconnected fragments per letter. Then, after I switched it to real
handwriting, it replayed every recorded corner because I had silently dropped the
smoothing the machine path got for free. **Both were obvious in a picture and
invisible in a green test suite**, and both cost a build and a TestFlight round
trip. The user was right to call it a waste of time.

**Two things now exist to stop it happening again.**

```bash
cd /Users/aakeshpatel/bolo
pnpm --filter @workspace/scripts run preview-writing-demo hi 12
```

Renders the real pen path to a sheet. Ten seconds, no build. **It covers
hand-traced scripts only**, because the skeleton extractor lives inside the web
page with a second copy inside the phone's, so the scripts workspace cannot
import it. **Moving that extractor into `lib/script-trace` would let it cover all
twelve and would kill a duplication CLAUDE.md already complains about.**

**And the web is the two-minute loop.** Web and mobile share `lib/script-trace`
and now `lib/story`, so the demo path, the scoring and the copy are the same
code. Every miss today was visible on the web. **Deploy and look before you
build.** A dev build still cannot clear an ANIMATION bug, but content, layout and
geometry it tells the truth about.

---

## 7. A NEGATIVE RESULT worth not repeating

The user reported Script Trace accuracy was too generous: staying on the line
passed even when a chunk of the letter was skipped. It was. Over all 45 Gujarati
letters, tracing only the first 40% passed 41 of them.

**Two fixes were tried and BOTH failed on measurement. Do not retry them
without new information.**

1. **Raising the pass mark cannot work.** An honest trace with a stray tail
   scores 77 and 70% of a letter scores 78. The distributions overlap, so every
   threshold either fails honest work or admits most of the problem.
2. **Gating on the largest untraced run of the guide path cannot work either.**
   It looked perfect on aggregates and died per-letter. I swept the tolerance
   from 13.5 down to 3 and **no value separates complete from partial**;
   tightening made complete traces worse, from a 0.05 gap to 0.42. The reason:
   **the guide path is the font OUTLINE and hand strokes run down the CENTRE.**

Both were reverted. **What DID work** was a different problem: Perfect was being
awarded to 100% of complete traces because the precision tolerance was 13.5
units on a 100-unit glyph. Tightened to 5 for single letters, scaled by glyph
complexity because sentences pack thinner strokes into the same box. Perfect is
now 60% careful, 38% wobbly, 0% sloppy, with the pass rate untouched at 100%.

**The real fix for the skipped-chunk problem is a scoring redesign** — score
against a centreline rather than an outline, or order the interior points along
the stroke so a skipped run is visible. That is not a constant change.

---

## 8. Commands, by terminal

**Deploy web — Replit Shell**, then hit Republish:

```bash
git pull --no-rebase origin main
git merge-base --is-ancestor 0aeb3670 HEAD && echo IN || echo MISSING
```

Expect `IN`. The HEAD hash will NOT match; the pull always makes a merge commit.

**Typecheck and tests — Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

Baselines as of `0aeb3670`: **web 110 suites / 1202 tests**, **mobile 116 / 1180**.

**API suite — Replit Shell only, and alone:**

```bash
pnpm --filter @workspace/api-server run test
```

Baseline **1174 tests, 91 suites, 1172 pass, 2 skipped, ~368s**. **The user
started a run tonight and I never saw the result.** It covers two things changed
today that have never been executed: the Script Trace free-taste gate
(`games.script-trace-teaser.test.ts`, new, never run) and the greeting buffer.

**Read production, read-only — Mac terminal:**

```bash
set -a; . ./.env.production; set +a
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL_PROD"
```

**Mobile builds — Mac terminal**, and only once the story is done:

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile
./node_modules/.bin/eas build --platform ios --profile production
./node_modules/.bin/eas submit --platform ios --latest --profile production
```

`app.json` comes back dirty with the incremented number every time. That is
`autoIncrement`, not a mistake. Commit it after.

**Bundle health before spending an install — Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo
node --experimental-strip-types artifacts/bolo-mobile/scripts/checkBundleHealth.ts <artifact-url>
```

It refuses to grade Android against the iOS numbers, correctly. Compare an
Android build against another Android build: 501 and 503 came out one function
apart, which is the healthy signature.

---

## 9. Outstanding, highest value first

1. **The storybook**, section 2. Steps 1 to 4 for a web-playable checkpoint.
2. **Did iOS 501 animate?** Asked twice, never answered. The user gave 10 clean
   launches, which is crash-freedom, not animation. **CLAUDE.md's rule 3 is that
   clearing a suspect means measuring the symptom you care about, and that
   mistake has already been made twice in this file.** 501 and 502 are both
   HEALTHY by function count, which is the first time since build 160.
3. **The API suite result** from tonight's run.
4. **Move the skeleton extractor into `lib/script-trace`.** Kills a two-copy
   duplication and lets the preflight cover all twelve scripts.
5. **Port `api-client-mock.ts` to mobile**, section 5.
6. **Perso-Arabic contributions** buy the writing demo for Urdu, Kashmiri and
   Sindhi. Check the Nastaliq alphabet is complete first: CLAUDE.md lists it and
   Meetei Mayek as deliberately incomplete.
7. **The skipped-chunk scoring redesign**, section 7.
8. **All twelve reading passages are still UNVERIFIED.** Unchanged today.
9. **Android: a real chai purchase has never been tested.**

---

## 10. Working style

From `~/.claude/CLAUDE.md` and reinforced tonight. Verdict first, short bullets,
**bold the keywords**, no long paragraphs. **No em dashes, ever**, in chat,
commits, comments or app copy. **Always paste shell commands as complete blocks
and say which terminal.** Offer a recommendation with any choice. End with a
numbered "Your plate", 2 to 3 actions, then an explicit stop.

The user has ADHD. One step at a time. A wall of steps does not get actioned.

**Say when they are wrong.** They asked me to check whether the demo was fixed
across all languages and the honest answer was no, 1 of 22, with the measurement
attached. That is the response they want, not reassurance.
