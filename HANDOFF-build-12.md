# Handoff: 2026-08-27, small hours

## Name this session BOLO BUILD CHAT 12

Chat 11 rebuilt the journey to the owner's reference live on a simulator and
shipped 1.0.3 (516) to both stores' pipelines. You are 12. Increment once.

**Read `CLAUDE.md` first, then this. Your job: WEB PARITY of the chat 11
journey redesign, owner-ordered.**

---

## 1. THE DEV LOOP EXISTS NOW. USE IT, DO NOT REBUILD IT.

Chat 11 stood up the loop chat 10's handoff begged for, and it found in two
hours what five EAS builds could not. The pieces, all on this Mac:

- **Simulator dev client** already built and installed: iPhone 17 Pro sim,
  app `org.name.Bolo` (placeholder id, DEV ONLY). It talks to the DEPLOYED
  API. The owner's account is signed in.
- **Metro**: `cd ~/bolo/artifacts/bolo-mobile && npx expo start` (if not
  already running). JS edits hot-reload in seconds; lib-file edits force a
  full reload back to Home.
- **Deep links work in the dev client** (chat 11 added the URL scheme to the
  generated plist): `xcrun simctl openurl booted "bolo-mobile://journey"`,
  `bolo-mobile://leaderboard`, etc. This is how you navigate without hands.
- **Maestro drives taps and swipes** (text matching does NOT see RN's tree;
  use `point: "50%,70%"` coordinates):
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
  `export PATH="$HOME/.maestro/bin:$JAVA_HOME/bin:$PATH"` then
  `maestro test flow.yaml`.
- **Screenshots**: `xcrun simctl io booted screenshot out.png`. Crop with
  PIL before reading; full shots waste context.
- **Layout truth**: temporary `onLayout` console probes read through Metro's
  log answered in one reload what four TestFlight builds could not. Measure,
  do not infer.

**The dev client is NOT evidence for animations or release behaviour** (see
CLAUDE.md measurement rules). It IS evidence for layout, navigation, and
touch.

---

## 2. Build state

| | version | where |
|---|---|---|
| iOS **516** | 1.0.3 | building or TestFlight, chat 11 was submitting at handoff time |
| Android **516** | 1.0.3 | building or Play internal, same |
| Android 515 | 1.0.3 | Play internal (superseded on arrival of 516) |

- 516 carries the ENTIRE journey redesign (section 3) plus the chat screen
  changes. **Bundle-health preflight** (`scripts/checkBundleHealth.ts`) on
  the iOS ipa before install was the rule chat 11 followed; keep it.
- **App Store REVIEW submission is the owner's press**, TestFlight upload is
  not.

---

## 3. What chat 11 shipped (all owner-directed, all sim-verified)

**The journey is per-zone now.** Sticky carved boards (`stickyHeaderIndices`)
over per-zone blocks; each zone's painting is VIEWPORT-PINNED while its zone
is on screen (`ZoneBandFixed`, scroll-driven counter-translation, plus a
'cap' twin inside the sticky child); even-size stop tags with per-kind
shapes (pointed luggage tag for phrase stops, dog-eared sheet for trace,
double-ruled plaque for story, gold-edged tag for done, on one parchment);
emblems 52pt bare art; 0.10 warm wash over the painting (was 0.28 dark);
heavier rail; Chacha-ji on a plate, drawn above the card plane; ALL-ACCESS
on EVERY plan-locked stop; the daily DID YOU KNOW fact on the board
(`lib/indiaFactForZone.ts`, web's arithmetic, same fact both platforms same
day); kind chips and locks on the status row; ticket inks in card interiors
(dark-mode sweep); full-width progress tracks; PRESS & HOLD around the nav
Bolo button (the actual hold-to-talk), chips raised above it.

**And the board finally renders on device.** The root cause of 511-515's
blank board was never chat 10's four fixes: on device an Image sized by
percentages/absoluteFill inside this tree resolves to INTRINSIC pixels.
Explicit point sizes everywhere on the board now. RNTL cannot catch this
class; only the sim can.

---

## 4. YOUR JOB: WEB PARITY, the owner's explicit ordering

"Lets push the ios and android builds all the way to testflight and play
store internal. THEN do the web parity with all these updated design
choices." Builds pushed. Now web.

The web journey (`artifacts/gujarati-coach/src/pages/journey.tsx`) still has
the OLD design. Port, in rough order of visibility:

1. **Scrim**: `src/lib/zone-backdrops.ts` ZONE_BACKDROP_SCRIM 0.28 dark →
   0.1 of `#FFF3DE` (add ZONE_BACKDROP_SCRIM_COLOR, swap the `#1B120E` div).
2. **Rail weights**: `src/lib/rail-palette.ts` → tie 18, rail 9.5, between
   6.5, tieDash '5 9', glow [{width 12, opacity 0.5}]. **Update the web pin
   test** (`src/test/journey-rail-and-medallions.test.tsx`) with the same
   reasoning comment mobile's carries. Mobile and web pins DIVERGE right
   now; this is the half that closes it.
3. **ALL-ACCESS chip on every plan-locked stop** (web still gates on
   sentence/trace/story; mobile widened on the owner's instruction).
4. **Even tags, mixed shapes**: web cards are CSS; the tag silhouettes are
   clip-path or inline SVG backgrounds. Mobile's TagCardBack (journey.tsx)
   is the geometry reference: pointed = flat top/bottom, 15px die-cut point
   to the eyelet end, r10 far corners; trace = square sheet + dog-ear;
   story = double rule. One fixed card size, kind chip + lock on the status
   row, full-width progress track.
5. **Emblems bigger and bare** (web medallion sizes live near
   `stop-emblems.ts` usage).
6. **Sticky zone boards + pinned painting**: web is `position: sticky` for
   the boards and `background-attachment`-style pinning for the band
   (transform-based, web's rail pulse shows the pattern). The serpentine
   svg is per-slice already, same as mobile was.
7. **Chacha's plate box** (journey-scenery.tsx web twin).

Suites: web vitest journey tests pin much of the old look; invert with
reasons, never delete. `pnpm --filter @workspace/gujarati-coach run test`.

---

## 5. OPEN, NOT IN 516

- **The leaderboard tour still points wrong** (owner: "leaderboard tour is
  still not pointing to the right buttons", AFTER chat 10's caret fix).
  Chat 11 ran out of runway. The caret math
  (`components/FeedTabsCoach.tsx coachCaretX`) assumes the Feed/Flex strip;
  REPRODUCE FIRST on the sim: the seen-flag was already cleared
  (`bolo.feedTabsCoachSeen` removed from AsyncStorage manifest), so the
  tour fires on the next leaderboard visit. Deep link:
  `bolo-mobile://leaderboard`. Fix mobile AND web
  (`src/components/feed-tabs-coach.tsx`).
- **The API suite has STILL not run** since `0d058a1d` (two handoffs
  running). Replit Shell only. The command block is in HANDOFF-build-11.md
  section 4.
- **RevenueCat toast on the sim** is dev-only noise; ignore.
- **`ZoneVista` remains unrendered on both platforms** (chat 10 flag);
  delete or house it.
- **Story stop progress bar** still needs scene-read tracking (parked).
- The old three-slice board asset `zone-sign.png` is still unused on disk.

---

## 6. Traps chat 11 paid for. Read before touching the journey.

1. **RN Image + percentage/absoluteFill sizing can resolve to INTRINSIC
   pixels on device** while RNTL resolves it fine. Every image in the board
   is explicit points now. If art renders giant or cropped, this is why.
2. **A zone-wide react-native-svg overlay eats every touch under it even
   with pointerEvents="none"** (found when all stop cards went dead).
   Chacha's above-cards layer is one SMALL svg per stall for exactly this
   reason. Never span an svg over tappable things.
3. **EAS switches to bare-workflow if it sees `artifacts/bolo-mobile/ios`**
   and then builds the DEV project and ignores app.json (and the
   credentials flow breaks non-interactively). `.easignore` excludes
   ios/android now; `.easignore` REPLACES .gitignore on EAS, which is why
   the gitignored dir uploaded at all.
4. **Run eas-cli from `artifacts/bolo-mobile`, never the repo root.** A
   root run scaffolds stub app.json/eas.json at the root (chat 11 deleted
   them once already) and fails confusingly.
5. **The sim dev client's Info.plist was hand-patched** (mic/speech/photo
   usage strings, URL schemes). `expo prebuild` on this Mac WILL try to
   rewrite package.json dependency versions; it was interrupted once and
   the plist patched by hand instead. If you regenerate ios/, re-add the
   usage strings or chat crashes on mic access, and re-add CFBundleURLTypes
   or deep links die. EAS builds are unaffected (full prebuild from
   app.json).
6. **Maestro cannot see RN's accessibility tree** on this setup: tap by
   coordinates. Text asserts fail even on visible text.
7. **Fast Refresh resets to Home on lib-file edits.** Batch lib edits, then
   one deep-link navigation.
8. **The trace stop's title row wraps if you stack plates on it.** Kind
   chips live on the status row now; keep new badges off the title row.

---

## 7. Working style

Verdict first, short bullets, bold keywords, **no em dashes anywhere**.
Say which terminal, say if it writes. **ONE STEP AT A TIME: end with "Your
plate" naming exactly ONE action, then stop.**

**The owner art-directs LIVE against the sim.** Reload, screenshot, let
them look, take the next correction. Small diffs, verified visually, beat
big planned drops. Expect reversals ("gold tags" came and went in one
reload); take them cheerfully, the loop is the point.

**Verify by measuring on the simulator, then say what you measured.**
