# Handoff: BOLO Build 19

Written 2026-08-29 by BOLO Build 18. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 19. Use that exact name as your H1 on every message.**

`origin/main` is `9f4ae1ba` plus this handoff, tree clean, nothing unpushed.

---

## 0. WHAT BUILD 18 DID, IN ONE LINE

**Web parity for everything the mobile app got in build 17**, item by item off
`HANDOFF-build-18.md` sections 2 and 3, in two commits:

- `2fcacf57` the home: the Your Journey frame, the hybrid ticket (PLATFORM
  stamp, station dots, unboxed CTA, narrower stub), the stall's copy on the
  left, and `components/stop-dots.tsx`, the one drawing of the dotted row.
- `9f4ae1ba` the journey: STATION_H 176, PC_H 256, the violet rail with the
  lime centre, numbered parchment badges, the zone CARD on a `bare`
  CarvedBoard, the chalkboard, the story plaque, dots on every card, the
  stall's invitation, the row-per-beat opening shot with the clearance floor,
  the light warm band wash, and the showroom rows through `planZoneRows`.

Web suite **131 files / 1434 tests** (was 1421), typecheck clean. Eleven
assertions inverted with the owner's words beside each, nine pins added.

Then, off the owner's screenshots and asks the same morning:

- `c1f11a18` **the web ticket scales with the board** ("boarding pass ticket
  on web is too small and not responsive to size"): `hooks/use-element-width`
  measures the board's content box, `homeTicketScale` runs 1 (phone, parity
  with mobile's 148) to 1.8 (a 700px column), and `MiniTicket` takes a `scale`
  that moves its type, paddings, notches and the stamp's extent together.
  The stamp's three rows now also fit the ring DOWN, not only across.
- **The splash** (mobile, next build): the native splash is the bird on
  WHITE (`app.json` splash.backgroundColor #FFFFFF) and BrandSplash draws a
  matching bird-on-white plate as its top layer, releases the native splash
  only once the plate's bird has loaded, then crossfades the plate over the
  film (600ms). expo-splash-screen's own fade is iOS-only, which is why the
  crossfade is drawn in JS and reaches Android. The READY hold now counts
  from the crossfade, not from mount. Verified in the simulator with three
  150ms screenshot bursts; mobile suite 141 / 1365.

**ASKED FOR THE NEXT BUILD ROUND, NOT STARTED: the Meta SDK.** Owner: "need
to add meta sdk to builds next round." That is `react-native-fbsdk-next` with
its config plugin (App ID, client token, display name), the iOS ATT prompt
string and SKAdNetwork entries, the Android manifest meta-data, and the
`AppEventsLogger` activate call at launch. A native change, so it rides an
EAS build, and the launch path is the one place this app has crashed: put
the initialisation AFTER the fonts and the film, never at module load, and
give it the same census guard splash-film.test.tsx gives expo-image.

**NOT DONE, ON PURPOSE:** the card slide-in (section 3 item 13, optional),
retiring `HALT_H` on web (it only feeds one scenery test's old lane geometry;
delete both together), and the journey's sticky boarding-pass header, which
mobile removed on 2026-08-27 but which predates build 17 and has its own
pins in `journey-zone-titles.test.tsx`.

---

## 1. WHERE THE BUILDS ARE

| build | commit | status |
|---|---|---|
| iOS 1.0.5 (523) | `0dc2ad2e` | on TestFlight, health-checked |
| Android 1.0.5 (524) | `0dc2ad2e` | **on the Play Console internal track**, submitted by chat 17 at 02:20 |

Build 18 health-checked 524 too (45,525 functions, the same compile as iOS
523's 45,542; Android reads UNCALIBRATED by design) and then tried to submit
it, and Google refused: "You've already submitted this version of the app."
Chat 17's session was still running and had submitted it two minutes
earlier (`b12674b5`). **Two sessions were live in this repo at once again**;
CLAUDE.md's shared-index rule and memory `git-commit-takes-the-whole-index`
are why the commits still came out clean.

**`eas build:view` takes no `--non-interactive`, and eas-cli 22 has no
`submission:list`.** Poll a build with `eas build:list --platform android
--limit 1 --non-interactive` and read `Status` / `Application Archive URL`.

**The server is still one commit behind:** `99bb369e` added `encounterChai`
to the zone signals payload. Web now reads it too (falls back to 3). The
owner's plate: pull in the Repl (`git pull --no-rebase --no-edit`), run the
api suite alone in the Shell, republish.

---

## 2. WHAT WEB DOES DIFFERENTLY FROM MOBILE, AND WHY

Every one of these is deliberate; do not "fix" them into parity.

1. **The fact box still cycles** (`FactStrip`, 6s crossfade, tap to
   advance). Mobile's is static because its release builds cannot animate.
   `journey-fact-strip.test.tsx` pins the cycle; its fixture now opens one
   stop per zone, because a gate-locked zone shows the test-out button in
   the fact's place.
2. **The current card keeps its glow pulse and its sign glyph.** Mobile
   dropped both (ca16a295, 10fa8387) because the ring could not pulse and
   the glyph wrapped the chip; neither is true on web.
3. **The opening shot is a tween, not a hop chain.** Same three numbers
   (`INTRO_HOPS`: 176px a row, 520ms a beat, ten rows' worth max) as a
   duration. `introScrollDurationMs` is exported and called by nobody on
   either platform now; delete it on both together with its tests, or
   leave it, but do not wire it back in.
4. **`ZONE_BOARD_MIN_PANEL_H` is 182 on web, 180 on mobile.** Both measured
   (mobile with an onLayout, web in Chrome with the real markup in Inter,
   the longest line name, "Thiruvananthapuram Central" and a three-line
   fact: 181.5 at every column width). Web's type runs a little larger.
5. **The chalkboard is `min-height` 150 on both**, and on both it grows to
   about 160 when the letters line wraps to two ("3 of 8 letters traced"
   does). The 176 row holds it. A fixed 150 would clip the dots.
6. **The story plaque at a 320px viewport** (card 182 wide) wraps its
   chips under the kicker and truncates the title. Mobile's cards are a
   fixed 250 and never see this. Acceptable; the owner has not seen it.
7. **The band wash matches mobile now** (`#FFF3DE` at 0.1). Build 18's
   handoff said "if the owner asks"; the owner then said "Web should match
   mobile as close as possible", which is the ask.

---

## 3. THE THREE TESTER ASKS (Play, section 6 item 3), STILL OPEN

None of these exist on either platform yet: a "Rate Bolo!" row in settings
(`expo-store-review`, Play listing fallback), a show/hide eye on the three
password fields (`sign-in.tsx`, `sign-up.tsx`, `account/password.tsx`), and
a short skippable first-run walkthrough (the language chooser is step one).
Ship them on BOTH platforms while Google reviews the production-access
application. The paid testers' PDF draft claims they exist; it must not be
pasted anywhere until they do.

---

## 4. TRAPS THIS BUILD PAID FOR

1. **Measure in Chrome, not in jsdom.** The zone card's 181.5 came from a
   static harness (Tailwind play CDN, Google Fonts Inter, the exact classes)
   served on localhost and read through the Chrome tools. The first reading
   was WRONG on every card that introduced a new Tailwind class: the play
   CDN generates CSS asynchronously, so measure after a settle, never on the
   frame you append the markup. Rendering the real page needs Clerk and the
   API, which the Mac does not have (CLAUDE.md, "Running locally").
2. **Anchored splices beat hand-matched edits for 250-line blocks.** The
   journey's marker, fact box, card, rail and shot were each replaced
   between two unique anchor lines by a script that refused to run unless
   every anchor matched exactly once. Nothing mid-file was ever typed twice.
3. **A test that pins the visible stop number on the trace card** now pins
   the aria label instead (`journey-trace-stop.test.tsx`), because the
   chalkboard prints none. Three places, all inverted with the reason.
4. **The opening-shot tests play the whole shot by `INTRO_HOPS`, not by
   `INTRO_SCROLL.maxMs`.** A 900ms wait now lands mid-tween; "never runs
   the shot twice" waits 5.5s on the real clock and carries a 15s timeout.
5. **`chai-stall.test.tsx`'s glyph census is a count.** The blurb says
   "N Chai" in text and carries no glyph on purpose; adding one there would
   fail the census and double the mark.

---

## 5. PARKED (carried forward)

0. **The Meta SDK in the next build round** (section 0), and the splash
   change above needs a STORE build to be seen: the native splash colour is
   baked at prebuild, and the local dev client's `ios/` storyboard is stale
   (it already draws white with a 100pt logo, which is not what EAS's legacy
   branch draws). The day's FIRST launch still crossfades into the empty
   bazaar before Bolo flies in; if the owner wants the bird to become the
   film's bird, the film itself needs a white opening, which is an asset
   change.
1. A one-pager map view of the whole journey, home's View Map destination.
2. Repl: pull, api suite, republish for `encounterChai`.
3. The camera permission string in `app.json` before
   `CHACHA_CALL_SELF_VIEW_ENABLED` ever flips.
4. `openapi.yaml` owes: `callsNow`, `heardRomanized`, `heardEnglish`,
   `xpEarned`, `selfView`, `encounterChai`.
5. A shared react-native-svg / vector-icons jest mock on mobile.
6. Android's launcher icon (`adaptive-icon.png`, July) does not match the
   white iOS icon; the Play 512x512 is a by-hand upload.
7. The api-server has never sent one error to Sentry.
8. `introScrollDurationMs` unused on both platforms (see section 2 item 3).
9. Web `HALT_H` and the scenery test's lane block, delete together.
10. The card slide-in on web (optional; floor 0.75, home as the card
    clears the bottom edge, if ever).

---

## 6. GOOGLE PLAY: THE ROAD TO PRODUCTION

Unchanged from `HANDOFF-build-18.md` section 6, which stays the owner's
track. Build 524 is on the internal track. When the owner asks "what next on
Android", it is that list, one step at a time, starting with confirming the
14-day requirement line on the closed test's dashboard.
