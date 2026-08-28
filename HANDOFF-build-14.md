# Handoff: 2026-08-27, evening

## Name this session BOLO BUILD CHAT 14

**13 is skipped, deliberately, for bad luck.** Chat 12 was the last one. Do not
"correct" this to 13.

**Read `CLAUDE.md` first, then this.**

---

## 1. THE ONE THING TO DO FIRST

**The owner is mid-way through a Repl pull and api test run.** They will paste
the output into your first message. It is the last step before publishing, and
publishing is what makes today's SERVER work reach anybody.

```bash
cd ~/workspace && git pull --no-rebase origin main && git merge-base --is-ancestor acf0fc53 HEAD && echo "PULL OK" && pnpm --filter @workspace/api-server run test 2>&1 | tail -12
```

**Expect roughly 1251 tests, pass 1249, fail 0.** The total should NOT move: I
added no api tests today, only prompt text. **The pass count is the signal, not
the total.**

**If the pass count dropped, do not publish.** I changed `parrotChat.ts`'s
persona prompt and **the api suite cannot run on a Mac**, so that run is the
first real check of it. A prompt is a string a test can assert on.

**If it is clean, the owner publishes the Repl.** Two things reach learners on
web, iOS AND Android the moment they do, with no app release:

- **Fun facts are about the world, not about words.** "Tell me a fun fact"
  returned a fact about Hindi. Now it says giraffes, octopuses and honey by
  name, and says plainly that a fact about the language does not count.
- **Bolo's personality**, see section 4.

---

## 2. Build state

| | version | build | preflight | where |
|---|---|---|---|---|
| **iOS 519** | **1.0.4** | 519 | **HEALTHY 45,270** | TestFlight |
| **Android 520** | **1.0.4** | 520 | 45,251, uncalibrated | Play internal |
| iOS 518 | 1.0.3 | 518 | HEALTHY 45,270 | TestFlight only |
| Android 519 | 1.0.3 | 519 | not run | superseded |

**1.0.3 IS RELEASED ON THE APP STORE, so that train is CLOSED.** Same rule that
cost build 210: an approved version refuses new builds with 90062 and 90186, and
90186 shuts TestFlight for that train too. **1.0.4 is the open train.** Bump
`expo.version` again the moment 1.0.4 is released.

**iOS buildNumber and Android versionCode are SEPARATE counters** that happen to
sit one apart. The owner asked "don't I need 519 for 1.0.4?" and was right to:
Android's 519 is a 1.0.3 build, iOS's 519 is the 1.0.4 one. Different numbers.

**The Android preflight is UNCALIBRATED and says so.** The healthy and poisoned
shapes were only ever measured on iOS. 45,251 against iOS's 45,270 from the same
commit is 0.04% apart, and the script says a forked runtime shows as roughly a
fifth more, so it reads healthy. That is not the same as a calibrated pass.

---

## 3. UNBUILT, AND ALL OF IT UNVERIFIED

**Everything after `cf27045d` is in neither build.** Five commits, and the ones
that matter are Android fixes made from a photograph:

1. **The PRESS & HOLD ring label.** Was a quarter turn out on Android. The
   offset was split per platform on the belief that react-native-svg honours
   `textAnchor="middle"` there; a device photo of 520 shows it does not. It is
   derived now, 8.02%, and **the 0.6em advance in that formula is calibrated
   against the photo** (predicts 33.96% arc, photo showed ~33%). Not seen.
2. **The chip clearance**, 44 to 62. This is the FOURTH value (8, 26, 44, 62)
   and the first derived one: the ring reaches 108pt above the tab slot bottom
   and the bar is 74 tall, so 34 pokes above it. Not seen.
3. **The Android glow on the home hero.** `elevation` added BLIND. Android draws
   no shadow for a view whose shadow is its only visible part, so without it the
   hero does not glow there at all. From API 28 it should read in the accent.
   **There is no Android on this Mac. This can only be answered on a device.**
4. **Silent holds are discarded**, see section 5.
5. **Five "can't hear you" lines**, see section 4.

---

## 4. What changed today, and what is worth not undoing

### The personality, and one deliberate departure from the ask

The owner: "I want my bird to literally have Ted Lasso's personality."

**His name is NOT in the prompt, on purpose.** Naming a copyrighted character
makes a model do an IMPRESSION: catchphrases, signs, actual lines. That is
weaker writing and somebody else's IP in a shipped product. The TRAITS are named
instead: warmth first as a discipline rather than a mood, curious not
judgmental, deflect praise and hand it back, homespun oddly specific analogies,
and the joke is always on the bird.

**The self-deprecation is load-bearing, not manners.** Bolo having a beak and
seed-sized ears is what earns him the right to tease at all. Volume, weather,
pigeons and his own hearing are fair game; accent, pronunciation, mistakes and
how long somebody has been learning are never, because these learners are often
children and often shy.

"Playful and a little cheeky" was the old instruction, and it is exactly the
vague adjective that produces cheese. **Both prompt variants were edited**, the
static cached one and the interpolated one; a rule in one applies half the time.

### The home hero

It is a **carved station board** now, matching the journey's zone cards, with a
**miniature boarding pass lying on it that tears in two**. Full bleed. Every
piece of motion kept: breathe, glow, warmed shimmer, arrow pump, driving train.
`CarvedBoard` is ONE component drawn by both home and the journey; do not fork
it.

### Fixed, with the reason worth keeping

- **The zone board never covered anything.** It was the next zone's opaque
  BACKDROP BAND, reaching 62pt above its own board to sit behind the floating
  header. Layout was never wrong; a paint layer was.
- **Home and the map disagreed about which stop you were on**, both platforms.
  `planZoneRows` decides it once now. Web had it too and nobody had reported it.
- **A username could never be taken back**, while the screen said "leave it
  empty to stay off both entirely". Blocked twice: the client returned early on
  empty, and the server 400'd because an empty name fails the length screen.
  Both fixed, copy corrected, and note that **share_stats alone is the board's
  gate** so clearing a name never took anyone off those surfaces.
- **The count-up was happening behind the splash.** `splashReady` now carries
  the handover both ways. It is a KEY, not a gate: the splash's exit fade runs
  on `useNativeDriver: true` and CLAUDE.md says that driver does not tick in
  release builds, so the signal can fail to arrive and the fallback is exactly
  the old behaviour.

---

## 5. THE HALLUCINATION, and why it was more than a bad turn

Holding the mic and saying nothing produced **a fully formed Hindi sentence**:
"I have an apple. I am happy today. I want roti and vegetables." Bolo answered
it warmly, as though it had been said.

**Every existing guard looks for the wrong shape.** `validateTranscript` catches
empty, punctuation-only, the `###` delimiter and hint echoes;
`discardAnchorEcho` catches the anchor coming back. This was invented prose and
is indistinguishable from speech once it is a string.

**The server cannot see it.** `no_speech_prob` is a whisper-1 field; this app
calls `gpt-4o-transcribe` and its mini, which do not return it.

**Fixed on the device**, where the mic level already is. The screen was already
sampling metering for the silence auto-stop, and already stopping on silence,
and then **uploading the clip anyway**. Two refs, not one: "never heard speech"
and "never heard anything" are the same value if metering is unavailable, and a
single flag would discard every recording a learner ever made. Absence of the
signal fails open.

**It matters because chat memory distils facts from turns.** A silent hold could
have written "likes apples" into what Bolo remembers about a child, and **there
is still no screen to view or clear that.**

**WEB IS NOT FIXED.** Its recorder is separate and I never read it. The same
fault almost certainly applies.

---

## 6. Open

1. **The memory UI.** `GET` and `DELETE /account/memories` exist and the chat
   screen carries a disclosure, but there is **no screen to view or clear**.
   This shipped in a build, for an app children use. It is the biggest open item
   and it is a privacy one, not a feature one.
2. **Web parity of the whole journey**, still the largest engineering item.
   Web's journey already HAS the carved board art; it lacks chat 11's header
   rework. Not blocked on that.
3. **Web does not have**: the carved hero, the mini ticket, the station-name
   fit, the username lightbox, the silent-hold guard.
4. Games page reorganisation, Share on Progress, the rail following the painted
   road, ZoneVista unrendered, `zone-sign.png` unused at 444KB, the whole-line
   station total, `syncSchema` at boot.
5. The parked queue in memory `bolo-parked-work-queue`.
6. **A web test flaked once today**: 1398 pass instead of 1399, did not
   reproduce across two immediate re-runs. Recorded in CLAUDE.md.

---

## 7. Traps this session paid for

1. **MAESTRO'S TOUCH INJECTION IS STILL DEAD.** Taps and swipes report COMPLETED
   and never arrive. Deep links, screenshots, Metro, `adb` and hot reload all
   work. **What DOES work and is not obvious: editing the simulator's
   AsyncStorage directly.** `RCTAsyncLocalStorage_V1/manifest.json` in the app's
   data container. Terminate the app, edit the JSON, relaunch. That is how the
   username prompt and the splash's once-a-day latch were forced.
2. **EASE-OUT CUBIC IS 99% DONE AT 80% OF ITS DURATION.** A count-up sampled
   late looks identical whether it is fixed or broken. Two of my three
   measurements lied for exactly this reason before I slowed the animation
   enough to be unmissable.
3. **`SPLASH_FULL_PLAY_MS` ONLY GOVERNS THE ONCE-A-DAY FULL PLAY.** Every other
   launch takes the short ready-signal path, so raising it does nothing. Clear
   `bolo-splash-day` from AsyncStorage to force the real branch.
4. **TWO SESSIONS SHARE `~/bolo`.** The Nest agent edits this same working tree
   and pushes. Stage file by file, never `git add -A`, and expect its
   in-progress edits to sit in your `git status`. Its push can carry your
   commits to origin with it.
5. **`react-native-svg` DOES NOT HONOUR `textAnchor` ON ANDROID** in TextPath,
   contradicting a confident comment in this repo that cited the Java source.
   A photo settled it. Both platforms treat `startOffset` as where the text
   STARTS.
6. **PHONE SCREENSHOTS CARRY ALPHA, AND THE TRANSPARENT PIXELS ARE BLACK
   UNDERNEATH.** Apple rejects alpha. Dropping the channel gives black corners;
   composite onto white. Their filenames also contain a **narrow no-break
   space** before "PM", which breaks a normally-quoted shell path.
7. **`eas-cli` MUST run from `artifacts/bolo-mobile`.** The shell's cwd persists
   between tool calls, so check `pwd` rather than assuming a reset.
8. **A RELEASED VERSION CANNOT ACCEPT A NEW BUILD.** If the Build section offers
   nothing, the version record is either already released or is not the number
   your build carries.

---

## 8. Working style

Verdict first, short bullets, bold the keywords, **no em dashes anywhere**. Say
which terminal a command runs in and whether it writes. **ONE STEP AT A TIME:
end with "Your plate" naming exactly ONE action, then stop.**

**The owner art-directs live against the simulator and reverses himself
freely.** Today the home hero was restyled about eight times in one sitting and
every reversal improved it. Take them cheerfully; small verified diffs beat big
planned drops.

**MEASURE, DO NOT INFER, AND CHECK THE INSTRUMENT FIRST.** Every expensive
mistake in this session was a measurement that could not answer the question
being asked of it: a screenshot taken too late, a probe on the wrong branch, a
grep whose pattern never matched. When a negative result arrives, prove the
instrument can produce a positive one before believing it.

**When you are wrong, say so plainly and move on.** I told the owner the web
hero port was blocked on the journey parity item; it was not, web already has
the board art. Correcting it changed his decision.
