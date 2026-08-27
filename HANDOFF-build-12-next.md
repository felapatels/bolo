# Handoff: 2026-08-27, midday

## Name this session BOLO BUILD CHAT 12

Chat 11 rebuilt the journey live on a simulator, shipped 1.0.3 builds 516/517
(iOS) and 517/518 (Android), then kept going for another dozen commits that
are NOT in any build. You are 12. Increment once.

**Read `CLAUDE.md` first, then this.**

---

## 1. THE ONE THING TO DO FIRST

**Cut a build.** Twelve commits are ahead of what is installed, and FOUR
separate things cannot be verified any other way:

- the launch handover (no more white flash between the native splash and the film)
- the paywall's chai row
- the Android PRESS & HOLD ring offset
- everything else below, on a release binary rather than a dev client

The owner deliberately held builds while stacking work. That hold is over.

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli build --platform all --profile production --non-interactive --no-wait
```

**Run eas-cli from `artifacts/bolo-mobile`, NEVER the repo root** (a root run
scaffolds stub app.json/eas.json there and fails confusingly). Commit the
`app.json` bump EAS writes. Preflight the ipa before submitting:

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && node --experimental-strip-types scripts/checkBundleHealth.ts <ipa-url>
```

HEALTHY is ~45,194 functions. The poisoned cluster is ~52,900; a poisoned
build is rebuilt, never installed.

---

## 2. Build state

| | version | where |
|---|---|---|
| iOS **517** | 1.0.3 | TestFlight, preflight HEALTHY |
| Android **518** | 1.0.3 | Play internal |

**iOS and Android numbers differ and that is not a typo:** a failed first
build bumped Android's versionCode before dying, so Android runs one ahead.
autoIncrement bumps as it QUEUES.

---

## 3. What is committed and NOT built

Twelve commits. The big ones:

- **Bolo remembers you.** `chat_memories` (migration 0057, APPLIED TO DEV
  already), distilled facts not transcripts, capped at 40 per learner, pruned
  by last-used. Extraction never blocks a turn. Disclosure line on the chat
  screen and `GET`/`DELETE /account/memories` shipped WITH it, because many
  learners are children. No write endpoint by design.
- **Bolo can see the learner**: journey progress, mastered phrases (same
  threshold the rest of the app uses), chai and what it affords. Separate
  file from memory on purpose: memory is what he was TOLD, context is what is
  TRUE now.
- **The stuck "Bolo is speaking…"**, fixed in THREE places (native, Expo-web,
  and the web app's own player, where `onerror` never released the phase).
- **The journey header**: no bar, no ticket. The map scrolls behind a floating
  back arrow; the zone board is an OVERLAY above the ScrollView, not a sticky
  header. Line name and free-taste counter rehoused onto the board.
- **Sliding stop cards**, live home-card flash, splash fades, second splash
  removed, leaderboard tour anchored to the measured strip, build number in
  Settings, paywall chai row (served, never hardcoded).

---

## 4. THE DEV LOOP, AND ITS ONE BROKEN PART

Everything in `bolo-mobile-dev-loop` memory still applies, EXCEPT:

**Maestro's touch injection is DEAD on this machine.** Taps and swipes report
COMPLETED and never reach the simulator. A simulator reboot and a wipe of its
iOS driver both failed. `idb` is not an option (its companion needs a Command
Line Tools version this Mac does not have).

**What still works:** deep links (`xcrun simctl openurl booted
"bolo-mobile://journey"`), screenshots, Metro console probes, `adb` for the
owner's Android, and hot reload. **Taps need the owner's hands.**

**The lesson that cost real time:** when a swipe produced no movement I
bisected three suspects against a frozen screen and read "still frozen" three
times as evidence. It was the dead tool. **Run a control first** — a tap that
MUST visibly change something — before trusting any negative result.

---

## 5. Open, in the owner's own order

The owner's plan when this session ended: **web parity, then Share, then
Games, then the Memory UI.**

1. **WEB PARITY OF THE WHOLE JOURNEY.** The largest outstanding item and it
   grows every time mobile ships. Web still has the OLD journey. Port list is
   in HANDOFF-build-12.md section 4, PLUS everything from this session: the
   floating header, the overlay board, the line name and free-taste on the
   board, sliding cards, the chat memory tip, the chips (shuffled, ten per
   set), the PRESS & HOLD ring. Mobile and web rail pin tests DISAGREE right
   now; closing that is part of this.
2. **Share button on the Progress page.**
3. **Games page reorganization.** The recommendation given and accepted in
   principle: group by what the learner is DOING (Speak / Listen / Read &
   Write / Play), not by price or difficulty, with locked games mixed INSIDE
   the section a learner already wants and marked with the ALL-ACCESS plate.
   Free-vs-paid grouping builds a wall and converts worst.
4. **Memory UI.** Endpoints exist; no screen to view or clear.

---

## 6. Also open

- **`learning.zone-testout.test.ts` fails** — "zone GET sampleSize caps at the
  phrase cap". Pre-existing, NOT from this session, and not the Nest's.
- **The Nest owns 7 api failures** in `nest.range.test.ts`. **The owner told
  the Nest session directly and it is working the fixes as of 2026-08-27.**
  Not yours: do not chase them, and expect that count to drop on the next
  api run without anything changing on this side.
- **The whole-line station total** disappeared with the boarding pass. The
  test records where it belongs if wanted back.
- **Bolo's pagdi on the chat screen** — chat 10 asked for this to be confirmed
  on a real build. Still never checked.
- **ZoneVista unrendered** on both platforms; **`zone-sign.png`** unused,
  444KB.
- **Story stop progress bar** needs scene-read tracking.
- **`syncSchema` at api-server boot** — parked, needs an owner decision. It
  touches production schema at startup.
- **The rail following the painted road** — still the big one.
- Parked queue in memory `bolo-parked-work-queue`: Leaderboard→"Feed", chat
  pointer after onboarding, retention offers, cancellation reason, journey 2
  guards, prove push delivers, storybook paywall copy, Script Trace lag,
  Script Trace has no finish moment. **Family plans are moot.**

### The UX list the owner asked for and has not actioned

Zero states are shouted not designed (home leads with 0/100 XP and 0 DAY
STREAK; the empty leaderboard still sends you nowhere); the locked wall (ten
identical "Locked · 10 phrases" rows); **iPhone SE's practice Retry/Next row
sits ~135px below the fold and this is already MEASURED in CODEBASE-FACTS**;
first run has three good moments with gaps between them; Chacha-ji's plate
reads as a sticker on hand-painted art.

---

## 7. Traps this session paid for

1. **A react-native-svg `<Svg>` eats every touch under it even with
   `pointerEvents="none"`.** A zone-wide overlay killed every stop-card tap.
   Use one small svg per element, never one spanning tappable UI.
2. **RN sticky headers cannot be z-ordered.** RN wraps a sticky child in its
   own container and THAT is the sibling z-order applies to. zIndex and
   elevation on your own view do nothing. Draw it outside the ScrollView.
3. **An RN `Image` sized by percentage or absoluteFill can resolve to its
   INTRINSIC pixels on device** while RNTL resolves it fine. This was the
   entire blank-board saga of builds 511-515.
4. **Absolutely positioned children ignore a parent's paddingTop.** Offset the
   wrapper instead.
5. **`react-native-svg`'s TextPath ignores `textAnchor` on iOS but honours it
   on Android**, so `startOffset` means different things per platform. Both
   values are measured and commented; re-measure both if the wording changes.
6. **A callback is not a completion signal.** `onDone` from a single
   `didJustFinish` stranded the chat screen forever. Anything that can fail to
   arrive needs a bound.
7. **EAS goes bare-workflow if it sees `artifacts/bolo-mobile/ios`** and builds
   the dev project. `.easignore` excludes it and REPLACES .gitignore on EAS.
8. **Economy numbers are never inlined in a client.** `tokenEconomy.ts` says
   so; the chai allowance already moved 50→15 server-side precisely so no
   client release was needed. Serve it.

---

## 8. Working style

Verdict first, short bullets, bold the keywords, **no em dashes anywhere**.
Say which terminal, say whether it writes. **ONE STEP AT A TIME: end with
"Your plate" naming exactly ONE action, then stop.**

**The owner art-directs live against the simulator** and reverses himself
freely (the boarding pass was restyled twice and then deleted). Take
reversals cheerfully; small verified diffs beat big planned drops.

**MEASURE, DO NOT INFER, AND CHECK THE INSTRUMENT FIRST.** Every expensive
mistake in this session and the last was trusting a signal that could not
speak: a screenshot that could not say which build it came from, a test
renderer that hands out its own frames, and a tap tool that reported success
while injecting nothing.
