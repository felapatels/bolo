# Handoff: BOLO Build 18

Written 2026-08-29 by BOLO BUILD CHAT 17. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 18. Use that exact name as your H1 on every message.**

`origin/main` is `49e0186b` plus this handoff, tree clean, nothing unpushed.

---

## 0. YOUR JOB, IN ONE LINE

**WEB PARITY for everything the mobile app got in build 17.** The owner said,
after the mobile builds went out: "start on the web parity of all these UX
changes." Sections 2 and 3 are the list, item by item, with the mobile commit
to read and the web file and test to change. Nothing on mobile needs touching.

The web artifact is `artifacts/gujarati-coach` (React, Vite, Wouter, Tailwind).
Tests: `pnpm --filter @workspace/gujarati-coach run test` (vitest), last green
at **131 files / 1421 tests** on 2026-08-28. Typecheck:
`pnpm --filter @workspace/gujarati-coach run typecheck`. No device needed:
`pnpm --filter @workspace/gujarati-coach run dev` with the proxy from
CLAUDE.md, or the web tests, which already render both pages.

---

## 1. WHERE THE BUILDS ARE (not your job, but you will be asked)

| build | commit | status |
|---|---|---|
| iOS 1.0.5 (522) | `12dd7d08` | on TestFlight; superseded |
| Android 1.0.5 (523) | `12dd7d08` | finished on EAS, NOT submitted; superseded |
| **iOS 1.0.5 (523) / Android 1.0.5 (524)** | `0dc2ad2e` | **the candidate**; cut 02:00, chat 17 submits both when they land |

Every store build goes through `artifacts/bolo-mobile/scripts/checkBundleHealth.ts`
before `eas submit`; iOS healthy shape is ~45,544 functions.

**The server is one commit behind:** `99bb369e` added `encounterChai` to the
zone signals payload (`api-server/src/routes/learning.ts`). The owner was asked
to pull in the Repl, run the api suite, and republish. Until then the phone
falls back to 3, which is the server's own `TOKEN_EARN_CHACHA_ENCOUNTER`.

**The Google Play 512x512 icon is a by-hand upload; Android's launcher icon
(`adaptive-icon.png`) is still the July one.** iOS got the white icon.

---

## 2. HOME PARITY (`src/pages/home.tsx`)

Mobile reference: `844ab7d5` (the commit message quotes the owner's mockup
annotations), then `10fa8387`, `ca16a295`.

1. **The "Your Journey" frame. Web has none.** Mobile:
   `bolo-mobile/app/(app)/(tabs)/index.tsx` `home-journey-frame`: a card with a
   1.5pt `BADGE.brassEdge` border, a small crown at the top centre (a train
   glyph in a half-round tab), a `YOUR JOURNEY` kicker in `primary`, the line
   "Board your train and continue learning", a "View Map" pill (map-pin icon,
   links to `/journey`), and the boarding pass INSIDE it, not bleeding. The
   owner kept View Map even though the pass already opens the map, for a future
   one-pager whole-journey view (parked, section 5).
   Web: wrap `home.tsx:977-1025` (the `journey-pass-card` Link and its
   `CarvedBoard`) in that frame.
2. **The hybrid ticket.** Mobile `JourneyPassCard.tsx`. Eyebrow "BOARDING PASS
   · brand" in `primary` (web `:1046-1061`); **station dots in place of the
   brass bar** (web `:1099-1126`), `total = stopCount`, `done = stopNumber - 1`,
   `current = stopNumber`, a skyline glyph at the end; **the CTA unboxed** (web
   `:1138-1220` is a bordered plate on `TICKET.stockBottom`; mobile drew the
   train, the tail and the verb straight on the paper, verb and arrow in
   `primary`); the stamp reads **PLATFORM**, not FARE ZONE
   (`src/components/ticket.tsx:68-135` `ZoneStamp`; test
   `ticket-stub-fit.test.tsx` names the chord for "FARE ZONE"); mobile also
   narrowed `STUB_W` 176 to 148 to keep the eyebrow whole at the frame's width
   (web `home.tsx:70`), and eased tracking on ADMIT ONE and the eyebrow.
   Tests: `home-boarding-pass.test.tsx:201-301` (CTA copy is unchanged; check
   the arrow/plate classes at `:203-224`).
3. **The stall.** Mobile `components/ChaiStall.tsx`. Copy on the LEFT: title,
   a blurb "Take a break and spend your **N Chai**" (the number in
   `#FBBF24`, corrected from the mockup's "earn"), the violet balance pill;
   Chacha-ji on the right; scrim the LEFT half fading rightward. Web
   `src/components/chai-stall.tsx:183-205` is the mirror image, and
   `chai-stall.test.tsx:164-179` pins the right-half `bg-gradient-to-l` scrim:
   invert it with the reason. The three errand links stay (owner ruling).
4. **Stats strip: no change.**

---

## 3. JOURNEY PARITY (`src/pages/journey.tsx` and `src/lib/*`)

Mobile references: `17a2656a`, `a5631a12`, `99bb369e`, `926c3e17`, `46ed3675`,
`d6a41e34`, `4315b4a9`, `0dc2ad2e`. Each message quotes the owner.

**The shared-constant files are twins with whole-object `toEqual` guards on
BOTH sides.** Change the web value and the web assertion together:
`rail-palette.ts` ↔ `railPalette.ts`, `zone-backdrops.ts` ↔ `zoneBackdrops.ts`,
`journey-intro-scroll.ts` ↔ `journeyIntroScroll.ts`. `journey-rows.ts` is
already in step.

1. **The pitch: `STATION_H` 88 to 176** (web `journey.tsx:157`). "Cards are
   too tight, lets double each zones background so we can space everything
   out better", and "make the winding tracks less tight". One number does
   both. Web still has `HALT_H = 96` (`:182`), which mobile retired on
   2026-08-26 (the stall moved to the marker's left); decide whether to
   retire it here too or leave the stall lane as is. `journey-scenery.test.tsx`
   pins the geometry and reads `SERPENTINE`.
2. **The rail** (`src/lib/rail-palette.ts`, `journey.tsx:959-1001`
   `RailSegment`). Mobile's final values: `rail '#8B5CF6'` on both runs,
   `between '#84CC16'` (the owner's lime; `#ECF584` "looks yellow" and
   `#4ADE80` was mint), `glow '#BEF264'`, `RAIL_GLOW_PASSES [{width 12,
   opacity 0.5}]`, `RAIL_STROKE { tie 18, rail 12, between 7, line 2.5, gauge
   9.5, tieDash '5 9' }`. **`betweenUnlit` and `unlitDash` are gone**: the run
   ahead is two 2.5pt violet strokes a gauge apart (two copies of the path
   translated ±4.75 in x; a mask was tried first and made scrolling choppy on
   a device), nothing between them, no dash. The travelled run is the 12pt
   violet stroke with the 7pt lime centre and the halo under it.
   Test: `journey-rail-and-medallions.test.tsx:111-153`, three whole-object
   assertions.
3. **The markers** (`journey.tsx:310-391` `StationMarker`). Non-current stops
   become a 30pt parchment disc, 2pt `BADGE.brassEdge` ring, the stop number in
   `ZONE_BOARD.ink` (ahead: `TICKET.inkAhead`, **never opacity**), a 15pt green
   `#22C55E` check on the top-right corner when done. The current stop keeps
   its train pill. Keep `data-testid="station-medallion-${kind}"`.
   Test: `journey-rail-and-medallions.test.tsx:155-186` (emblem art; kind not
   status; no opacity).
4. **The zone card** (`journey.tsx:508-593` `ZonePostcard`,
   `src/components/carved-board.tsx`). The parchment panel goes: give
   `CarvedBoard` a `bare` prop (mobile `components/journey/CarvedBoard.tsx`:
   no panel slice, no cream fill, children inset only to
   `panelInsetLeft/Right`). Under the pediment, ONE cream `#FFF8EE` card: a
   3px top edge gradient `primary` to `#EC4899`, wood `#8A5D4A` 3px on the
   other three sides, bottom radius 14; inside: a `primary` pill with a train
   glyph and the LINE NAME uppercased; the city at 22px extrabold `#2B1A0E`;
   "N stops in this zone" `#6B5B4E` with the Free taste counter inline on a
   teaser; a gold dashed rule (`${BADGE.brassBg}99`) with a diamond in the
   middle; then the fact in its own rounded box (`#FFFDF8`, 1px
   `${BADGE.brassEdge}80`) behind a 34px gold spark circle, label "DID YOU
   KNOW?" in `primary`, fact up to three lines; the zone test-out button
   INSIDE the card, violet, in the fact's place on a gate-locked zone.
   **The owner rejected the panel art staying behind the card** ("no i don't
   want to keep that old box underneath"). Web's `FactStrip` auto-cycles;
   mobile is static by rule (release builds cannot animate). Keep web's cycle
   if `journey-fact-strip.test.tsx:103-144` matters to you, but the box is the
   fact's home now. `PC_H` 184 to 256 (`journey.tsx:160`) and
   `ZONE_BOARD_MIN_PANEL_H` 98 to 180 (`zone-backdrops.ts:274`); mobile
   measured 177 of card with an onLayout before setting either, so measure
   with the DOM before you trust those two numbers on web fonts.
   `journey-board-budget.test.ts:11` mirrors `PC_H`.
5. **The chalkboard.** The tracing stop is not a tag: 150 by 150, `#1F3D2B`
   slate, 4px `#8A5D4A` wood border, radius 10, a column in a chalk face
   (`Chalkduster` on iOS; on web use a chalk web font or `"Chalkduster",
   "Comic Sans MS", cursive`): the chips row top-right, `TRACE` 18px
   letterspaced, the letters line, the count `0/8` at 22px, the letters as
   white dots, a 30px `primary` pencil badge hung on the bottom-right corner
   (dots stop 30px short of it). Web `StationCard` `journey.tsx:610-952`,
   trace branch; `journey-station-paper.test.tsx:122-173` counts exactly one
   stock per card, so give the slate a stock testid.
6. **The story plaque.** Paper stays; a 52px open book (`stop-emblems.ts`
   story emblem, the 3D one; the owner asked for "a 3-d looking book like my
   example" and that is it) on the left, a `primary` `STORY` kicker, the
   book's title, the scenes line. No stop-number text on the trace or story
   cards; the badge on the rail carries the number, the aria label still says
   it.
7. **The kind chips** TRACE and STORY in `primary` with white ink
   (`journey.tsx:775-802`), and **every lock in `primary`** (`:823`, the
   lock dialog too).
8. **Dots on every card.** Port `bolo-mobile/components/journey/StopDots.tsx`
   whole (100 lines, the behaviours are in its header) and use it for the
   pass (item 2.2), the phrase card's mastered row (web `journey.tsx:876-910`;
   `journey-zone-titles.test.tsx:392-414` pins the `.h-1.5` bar and
   "3/8 mastered" text, keep the text) and the chalkboard's letters. One
   component; a second copy is the defect.
9. **The stall's invitation.** Under Chacha-ji's nameplate on the map, a
   violet chip 104px wide: "Take a break and earn **N Chai**", N from
   `signals.encounterChai ?? 3` (server field from `99bb369e`), hidden in the
   showroom. Web `journey.tsx:2480-2560`.
10. **The opening shot hops.** Web tweens with rAF and has duration control
    (`journey.tsx:1214-1323`), so it does not need mobile's hop chain; but the
    owner's complaint was seeing the stops go by, so slow the tween to the
    same feel: about a row per 520ms, capped at ten rows' worth. Also port
    `introScrollLead(viewportH, clearance)` if web's sticky header ever eats
    the top of the viewport the way mobile's pinned board does
    (`journey-intro-scroll.test.ts:74-88` pins the single-arg shape).
11. **The band.** Web's bands are already per-zone, full-height, static divs
    (`journey.tsx:2379-2418`), which is exactly where mobile ended up after
    "it feels like the background is moving when it shouldn't". Nothing to
    do, except the scrim: mobile is a light warm wash (`#FFF3DE` at 0.1); web
    is dark `#1B120E` at 0.28. Match mobile's if the owner asks; not asked
    yet.
12. **No cap, no fade, no box behind the zone board.** The owner rejected all
    three on mobile ("the zone card should float", "no blended cross fade at
    the top", "first image should start at the top"). Web has none of them;
    do not add any.
13. **The card slide-in.** Web has none. Optional; if you add one, the floor
    is 0.75 opacity, home as the card clears the bottom edge (mobile
    `SlidingCardSlot`, `SLIDE_MIN_OPACITY`).

---

## 4. TRAPS CHAT 17 PAID FOR, THE ONES THAT APPLY TO WEB

1. **Measure before you set a budget.** Every panel number on mobile was set
   from an onLayout, and the two that were guessed were wrong (a 40pt overrun
   that did not exist; a 98 minimum that had never fit). Use the DOM.
2. **A helper that exists and is not used is the shape of most bugs here.**
   `rewardChai` was read for the stall's chip and it is the signal games'
   reward; the owner caught it. Grep the server before trusting a field name.
3. **Read the test before changing it; invert with the reason.** Twelve
   assertions were inverted on mobile tonight, every one with the owner's
   words beside it.
4. **Look at the target before overwriting.** `.easignore` was overwritten
   without being read and had to be restored. `git show HEAD:<path>` first.
5. **One step at a time with this owner, and take corrections mid-task.** The
   home took one pass; the journey took fourteen one-line corrections, each
   from a screenshot, each fixed and shown before the next.

---

## 5. PARKED

1. **A one-pager map view of the whole journey**: the owner's idea for where
   home's View Map should go ("later we can create a onepager map view that
   shows the full journey").
2. **Repl: pull, api suite, republish** for `encounterChai`.
3. **The camera permission string** in `app.json` before
   `CHACHA_CALL_SELF_VIEW_ENABLED` ever flips.
4. **Web showroom rows**: web still skips the tracing and story rows in a
   showroom (`journey.tsx` around `!showroom` on the trace and story splices);
   mobile draws them via `planZoneRows`. Fold into this parity pass if it
   fits.
5. **`openapi.yaml` owes**: `callsNow`, `heardRomanized`, `heardEnglish`,
   `xpEarned`, `selfView`, `encounterChai`.
6. **A shared react-native-svg / vector-icons jest mock** on mobile: ten
   hand-written mocks each had to learn `Mask` and `MaterialCommunityIcons`.
7. **Android's launcher icon** (`adaptive-icon.png`, July) does not match the
   white iOS icon.
8. **The api-server has never sent one error to Sentry.**

---

## 6. GOOGLE PLAY: THE ROAD TO PRODUCTION, IN ORDER

The 14-day closed test is over (the owner confirmed on 2026-08-29). The
steps, each one verified before the next:

1. **Confirm the requirement line in Play Console** on the closed test's
   dashboard: 12 testers opted in continuously for 14 days. Memory
   `play-closed-test-zero-margin`: one opt-out restarts the clock, and it has
   happened once. If the line reads short, the clock restarted; do not apply.
2. **Apply for production access** with HONEST answers. The paid testers'
   PDF draft claims a Rate button, a walkthrough and a password eye were
   implemented; none of them exist (no `expo-store-review`, no visibility
   toggle on `sign-in.tsx` / `sign-up.tsx` / `account/password.tsx`, only the
   `choose-language` first-run step). Chat 17 wrote truthful answers in the
   conversation on 2026-08-29; the substance: recruited via the paid provider
   plus family; no crashes on their devices; the real changes made during the
   test were the Android sign-out fix, Chai crediting, the hidden first stop,
   Chacha-ji speaking the learner's language, the ringtone, the free tastes,
   the home and journey redesigns. Google reviews the form in a few days.
3. **While waiting, ship the three tester asks on both platforms**, so the
   next application (if any) and the store listing are true: a "Rate Bolo!"
   row in settings via `expo-store-review` (in-app review flow, Play listing
   fallback), a show/hide eye on the three password fields, and a short
   skippable first-run walkthrough (the language chooser is already step one).
4. **Fix the Android launcher icon** (`assets/images/adaptive-icon.png`,
   July) to match the white iOS icon, and upload the 512x512 in the console.
5. **When production access is granted, promote the NEWEST healthy build**
   from the internal track to production (never 523 or older), with release
   notes; chat 17's "What's New" text for 1.0.5 is in the conversation and is
   reusable. Roll out to 100 percent only after the internal build has been
   used for a day.
6. **Screenshots**: the console wants 1320x2868 (6.9"); chat 17 produced
   `bolo-home-6.9in.png` and `bolo-journey-6.9in.png` by resampling the
   17 Pro simulator's 1206x2622 shots with `sips -z 2868 1320`. The same
   recipe works for any screen.
