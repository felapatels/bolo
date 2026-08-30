# Handoff: BOLO Build 23

Written 2026-08-30 (small hours) by BOLO Build 22. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 23. Use that exact name as your H1 on every message.**

---

## 0. THE STATE, HONESTLY

- **PUSHED.** `origin/main` moved from `c98d1386` to `811d982e` on
  2026-08-30 (21 commits: the five approvals, the pass and tear fixes, the
  green-suite pins, the build-number write-back). This handoff's own last
  edits are after that push; check `git log origin/main..HEAD`.
- **Four files in the tree are NOT ours**: `gujarati-coach/src/pages/landing.tsx`,
  `src/test/landing.test.tsx`, `src/components/looping-video.tsx` and
  `public/video/`. Another session's web landing work. Never sweep them into
  a commit; stage by listed files.
- Typecheck is clean on mobile and web at every commit.

## 1. WHAT BUILD 22 BUILT (all mobile, verified on the iPhone 17 Pro simulator)

1. **The games art loop finished**: all fourteen cards and the hero are real
   paintings; `scripts/import-game-art.py` now keys a painted checkerboard to
   alpha and crops the parchment to its sheet. The painted parchment sheet
   under the home pass is WIRED AND SWITCHED OFF (`PARCHMENT_PAINTED` in
   `ParchmentPass.tsx`, the owner's ruling on sight); the drawn sheet is the pass.
2. **Home**: gold star and medal on the stats strip, a gold-to-indigo gradient
   ring on the Bolo Chat tab, the pass's cut edge in indigo (web ticket too),
   the Resume pill lower and clear of the train.
3. **Progress** rebuilt to the mockup: milestone ticket, one-row stats,
   journey card (`components/progress/JourneyProgressCard.tsx`), All-Access
   card, Bolo's bubble (`components/SpeechBubble.tsx`).
4. **Leaderboard**: ONE shared board on the Feed tab and the standalone screen
   (`components/leaderboard/*`, `lib/boardRanking.ts`, `lib/useRankDeltas.ts`):
   XP or Streak pills, weekly race bar on the server's Monday-UTC window,
   podium, rank arrows "since this device last looked". The Feed tab was
   silently on all-time XP while the screen was weekly; both weekly now.
5. **Journey**: heavier, wider track with TRUE parallel rails ahead
   (`lib/railOffset.ts`, twin `src/lib/rail-offset.ts` on web, both with
   pins), bigger darker planks, the painted train in a round node on the
   rail, the modern zone card (`CarvedBoard variant="modern"`) with Bolo and
   the fact box, the stall as a painted card built by
   `scripts/make-stall-card.py` from delivered art, darker world (ink scrim),
   ivory stop cards with the zone card's lavender edge, deeper shadows, the
   throbbing indigo glow under the current node and card, the trace card as a
   notched ticket with a tip box.
6. **Bazaar**: a hub with four doors (`app/(app)/bazaar/{index,tailor,
   station,tickets,languages}.tsx`); the old single-scroll screen is gone,
   its till lives in `components/bazaar/OutfitShop.tsx` with every pin kept;
   the Ticket Counter is stamps over the wallet's own hooks
   (`components/bazaar/PassCards.tsx`). Two honest gaps: the Station Master
   has one item (the cap; the rest is undrawn art) and languages are not
   priced in Chai (Chai buys a STOP; the tiles say so).
7. **Chai wallet**: the stall under a scalloped awning, the balance card, a
   tiled history with dates and a filter capped at five, "Browse Bazaar".
8. **Paywall**: Bolo beside the benefits, the annual card's SAVE badge from
   the real prices, the trial box, the two-tone headline. **NOT SEEN**: the
   dev client has no RevenueCat offerings, so the simulator shows the
   "not available in this build" card; TestFlight shows the rest.
9. **The tear** (owner: "the ticket tear doesn't happen now"): build 21
   started the arrival film at the tear's first frame and the film covered
   the stub before it moved, PROVEN by recording the simulator at 8fps. The
   film now waits `TEAR_SPLASH_DELAY_MS` (320) and the sound is trimmed to
   0.8s (`assets/sounds/tear-sfx.m4a`, original kept in this session's
   scratchpad only; the file in git is the short one).

## 2. RULES THE OWNER SET (unchanged, and each cost something)

- **NEVER `eas build` unless the owner's MOST RECENT message says so.**
- **Typecheck only while iterating; all suites once at the end, before the build.**
- **ONE STEP AT A TIME.** "Your plate" names exactly one action.
- **Show on the simulator as you work**; terminate + launch before believing
  an edit did nothing; say before you drive the shared simulator.
- **Colour law**: gold/brown is the world, purple is "touch me", green is "done".
- **Verify the mechanism**: the tear looked fine in code and was invisible on
  screen; a recording (`xcrun simctl io booted recordVideo`, then ffmpeg
  frames) settled it in a minute. Use it for anything that moves.

## 3. VERIFICATION, WHERE IT STOOD WHEN THIS WAS WRITTEN

The mobile suite's first full run this session (the first since build 20)
found **25 failing suites, 148 tests**, most of them build 21's, never run:
every screen that mounts a ChaiPill mounts the wallet sheet, whose
`useSafeAreaInsets()` threw without a provider (twelve suites); the home
pass's drawn parchment uses svg gradients the tests' `react-native-svg`
mocks lacked (six suites); three census tests read the deleted
`app/(app)/bazaar.tsx`; the rest were this session's pins to invert
(podium order, "Browse Bazaar", the rail helper's left and right, the
outfits mock). All fixed in place. **Final: mobile 152 suites, 1454 tests, all pass;
web 139 files, 1491 tests, all pass** (2026-08-30, both on this Mac). Along
the way the games hub's two suites needed `useLanguage`, `useJourneyProgress`
and `useFocusEffect` mocked, three build 21 additions.
**Api suite: Repl Shell only**, never here; not run this session.

## 4. THE QUEUE, IN THE OWNER'S ORDER

1. **THE 1.0.6 BUILDS, where they stood at handoff (2026-08-30 ~01:30 EDT).**
   iOS `1.0.6 (525)` `a0ec08bb-988e-438b-a788-355519cd1150`: FINISHED,
   **HEALTHY** by `artifacts/bolo-mobile/scripts/checkBundleHealth.ts`
   (45,974 functions, the animating shape; the script lives THERE, not in
   `scripts/`, which is where CLAUDE.md sends you), and `eas submit
   --platform ios --latest` was started on the owner's word ("push them all
   the way to testflight/play store"). Android `1.0.6 (526)`
   `1cb4711c-ce13-4581-8f3c-69a7c1f577fc`: still building at handoff, with
   `eas submit --platform android --latest` queued behind it (internal
   track). **Check both on expo.dev / App Store Connect / Play before
   trusting this line**; "already submitted" from eas means it is on Play.
   `app.json` carries the write-back (525 / 526), committed and pushed.
2. **THE REPL IS ON `811d982e`** and its api suite ran there: **1451 tests,
   1449 pass, 0 fail, 2 skipped** (build 20's 1450/1448 plus the flashback
   pin). The owner was republishing at handoff; the server's flashback door
   fix (`00d44c95`) goes live with that publish. **The Repl holds 120 files
   GitHub does not**: `artifacts/bolo-mobile/assets/story/*.webp`, storybook
   art created in the Repl and auto-committed there, never pushed (the Repl
   cannot push without the PAT flow in memory). Nothing on the Mac or on
   GitHub references them; they are one Repl away from lost.
3. **Web parity** for everything in section 1 that is mobile only: Progress,
   Leaderboard, the journey's zone card, stall card, stop colours, trace card
   and glow, the bazaar doors, the wallet, the paywall. The rail palette and
   offsets are already on web.
4. The Bazaar "Your Flex" card (memory `bolo-feed-and-bazaar-mockups-2026-08-29`).
5. Flashback lightbox, the web corrections, the XP question (build 22's
   handoff section 4, untouched).

## 5. TRAPS BUILD 22 PAID FOR

1. **`git add` refuses a deleted path** in a listed pathspec and aborts the
   whole add; name the deletion only in `git commit -- <paths>`.
2. **Maestro's `tapOn: id:` cannot see `PressableScale`** (an animated
   Pressable) any more than ChunkyButton; tap by point. `openLink` and
   `launchApp` in one flow are reliable; a flow without `launchApp` on a cold
   Maestro driver killed the app once.
3. **A swipe that starts on the pinned zone board does not scroll the map**;
   start it on the map.
4. **The generator paints its checkerboard.** A "transparent" PNG request came
   back as a JPEG with grey-and-white squares; the import script keys it.
5. **The same board, two windows**: the Feed tab and the Leaderboard screen
   drew "the same" board off different queries (all-time vs week). When two
   surfaces share a component, check they share the params too.
6. **A nested Text with its own face ellipsised at one line** inside a
   two-line strip on the simulator, twice; two plain Texts fixed it.
7. **Watchers**: an `until grep -q stitched` loop matched an EARLIER line
   containing the word; grep for an anchored, unique marker.
