# Handoff: BOLO Build 26

Written 2026-08-31 (just after midnight EDT) by BOLO Build 25. **Read
`CLAUDE.md` first, then this.**

**You are BOLO Build 26. Use that exact name as your H1 on every message.**

---

## 0. THE STATE, HONESTLY

- **Everything is pushed** through the outfits-pin commit (`9a1535ab`) plus
  any handoff commits after it. The working tree holds ONLY: another
  session's web work (never stage it: `gujarati-coach/` index.html,
  pages/journey.tsx, landing.tsx and its test, hero-showcase, looping-video,
  app-store-badge, platform-strip, store-banner and its test, public/hero,
  public/video), and two uncommitted wardrobe leftovers of ours
  (`scripts/wardrobe/manifest.json` pointing pagdi at
  `pagdi-v2-shortplume.png`, and that generated png) — see section 4.3
  before touching them.
- **1.0.7 (530) is BUILT, HEALTHY and SUBMITTED on both platforms.** iOS
  `72858604` (46,030 functions, the animating shape) to App Store Connect
  for TestFlight; Android `d06a45af` to the Play internal track. Full
  suites ran immediately before the builds and were green: mobile 156
  suites / 1475 tests, web 142 files / 1518 tests, api 1459 tests with
  1456 passing plus the one stale pin corrected and re-run alone (16/16).
- **The Repl publish of the server half was STILL RUNNING when this was
  written** (the owner started it; no migrations step had appeared).
  **NOT verified at all yet:** my one curl of
  `bolo-india.app/games/story/book?lang=gu...` returned non-JSON (likely
  the wrong path prefix or auth), and the owner interrupted before a second
  try. FIRST JOB: verify the storybook fix against production by content
  (a Gujarati Plus account's book resolving page one, or the endpoint
  returning a phrase for "How much is it?"), per the deploy rule in
  CLAUDE.md.
- **1.0.6 (529) sits in App Store review as the pending release** (phone
  set of screenshots). 1.0.7 supersedes it in TestFlight. If the owner
  swaps the review build to an iPad-capable one, App Store Connect demands
  the 13-inch screenshot set, which now exists:
  `~/Downloads/bolo-ipad-13-screenshots/` (seven 2064x2752 flattened PNGs,
  upload order 01..07) plus a What's New text the owner has in chat.
- **The room:** iPhone 17 Pro, iPad Pro 13-inch and iPad mini simulators
  are booted with dev clients signed into the owner's gmail account (FREE,
  on HINDI; I switched it twice for repros and switched it back). Metro is
  the owner's `expo start` on :8081. The owner's Galaxy A17 (SM-A176U1,
  build 529) was attached by USB with a logcat capture running to
  `.../scratchpad/android-journey.log` (the scratchpad dies with my
  session; the FINDINGS survive below). ImageMagick and librsvg are newly
  installed on this Mac via brew.

## 1. WHAT BUILD 25 SHIPPED (the day, compressed)

**The iPad (option A, the owner's ruling):** one centred 600pt column via
`lib/contentWidth.ts` + `Screen`'s column; tab bar and sheets on the
column; the journey opts out (`column={false}`) to paint web's wide bazaar
edge to edge with a 560 map and, on the 13-inch only, the zone rail
(web's build 24 twin; `zones2` ported for all 22 lines). supportsTablet +
requireFullScreen shipped in 529; 530 is the second iPad-capable build.
CLAUDE.md carries the full iPad section and the two sim traps (never tap
"Open" blind; ids over points, except the rail which is a11y-hidden).

**Owner catches fixed on both platforms:** games hero covers the column;
the chat bird's band is hers alone (transcript starts below her; strip
inset); the leaderboard bubble tells the truth with real numbers
(boardRanking standing) from under Bolo's beak; Go Shopping button on the
chai stall (the scene root's pointerEvents "none" swallowed it at first:
box-none when the shop door exists); "N more to unlock" opens the journey;
Bolo! Family off sale on mobile as on web (FAMILY_PLAN_ENABLED in
lib/entitlements); Tailor and Station Master racks disjoint.

**Chacha-ji's call:** face framed on a stage (callStage.ts geometry,
pinned across four screen sizes), words and controls in a panel beneath,
"BOLO Wireless · 4G" carrier line on both screens. And the mouth guard is
real now: playBase64Audio's firstSoundNotifier existed but the voice queue
never passed onStart through, so he mimed before his voice on every turn;
both twins fixed and pinned. NOT yet seen through a real call (that rings
him on the owner's account).

**The wardrobe pipeline (owner: "architecture to spin up new clothing"):**
`scripts/wardrobe/manifest.json` is the single source; `pnpm wardrobe
gen|install|codegen|check|montage`; generated registries
(`outfits.catalog.gen.ts` server-side, `mascotOutfits.gen.ts` and
`wardrobeShop.gen.ts` on the clients); both compositing generators read
the manifest; ART-SPEC.md and PROMPTS.md hold the art rules and
paste-ready prompts. The api outfits parity test reads the gen file now.

**The storybook production bug (the owner's tester, Gujarati, iPhone,
1.0.6):** a paying account opened the greetings book to a blank page one.
Cause measured against production: the concept lookup accepted one exact
spelling and Gujarati writes "How much is it?" etc. Fix: aliases in
lib/story concepts.ts (also "tomorrow / yesterday" — kal means both —
"bye", the congratulations forms), plus mobile got web's story-short
state so a genuine gap never renders as silent blank. Ships as: server →
the publish above; clients → 1.0.7.

## 2. RULINGS AND OPEN DECISIONS

- **Rulings today:** iPad option A; journey map 560 on the wide bazaar;
  the zone rail; Family fixed now; version 1.0.7 for everything after 529;
  racks disjoint; wardrobe manifest approach approved; prompts from us,
  art generated by the owner, the pipeline maps it.
- **OPEN: Chacha-ji conversation variety.** The owner asked twice for
  calls that differ and tailor (the agenda is a fixed interview; live
  turns are told "react warmly, then ask X"). Options A (random topic
  draw + follow-what-they-said prompt + live goodbye) and B (A plus a
  bigger topic pool) were presented; NO ANSWER YET. Server-only work.
- **OPEN: the pagdi.** The owner's generated art seats beautifully but an
  upright plume can NEVER fully fit the 1024 frame (eye-clearance lift
  eats the headroom; halving the plume still crops). The owner chose A:
  export their candidate #2 (leaning feather) as a true transparent PNG to
  `scripts/mascot-accessory-art/pagdi-v2.png` — NOT YET DROPPED. Then:
  `pnpm wardrobe gen pagdi`, review, install. Watch for baked
  checkerboard backgrounds (their first export had one; corner flood-fill
  keyed it out). The uncommitted manifest change points pagdi at the
  shortplume experiment; repoint to the real v2 when it lands.
- **OPEN: storybook missing content** (not fixable by spelling): goodbye
  (sa, mai), fork (sat, sa, mni), father-in-law (kok, ml, mni),
  congratulations (kn), welcome (mni). Those languages now get the honest
  message; the rows need authoring.
- **The Nest wardrobe approvals** (owner: unreleased items on the Nest,
  approve-to-production instantly) = phase-2 remote wardrobe with a status
  column. Future state, recorded in memory.

## 3. THE ANDROID JOURNEY INVESTIGATION (unfinished, evidence in hand)

The owner's Galaxy A17 on 529: journey "choppy then crashes". Logcat
findings, all from one attended run:
1. **The "crash" is `System.exit(0)` by Google Play's automatic integrity
   protection (`com.pairip`)** after its LicenseClient failed three
   retries ("Licensing service unexpectedly disconnected") and showed its
   LicenseActivity. Not our code, not an ANR record, not lmkd.
2. **The failures land inside OUR main-thread stalls:** 5-8 SECOND frames
   (`Davey! duration=8368ms`), 200-340 skipped frames at a stretch, the
   cost in HWUI draw-command issue — the journey's tree is brutally
   expensive to paint on a budget Mali GPU. The working theory: our jank
   starves the licensing binder; fix the jank, the exits likely stop.
   iPhone pays no such bill (no pairip, and release-build animations are
   frozen by the known EAS bug, which HIDES per-frame costs there).
3. **The next measurement never ran:** journey open, untouched 15 seconds
   — does it stall idle (continuous animations redrawing the giant tree)
   or only during scroll (the intro auto-scroll redraws everything per
   frame)? Ask the owner to repeat with the phone attached; also grab
   `dumpsys gfxinfo com.bolo.mobile` after. Suspects in order: the intro
   auto-scroll (reanimated scrollTo per frame over a huge tree), per-zone
   Svg complexity, the parallax layer. Fix directions sketched in the
   session: land the intro instantly on Android, cheapen the Svg, and
   measure before believing anything (CLAUDE.md's rules).
4. Play Console's crash API is not enabled for the service account
   (`playdeveloperreporting.googleapis.com`, project 1086547179495) — one
   click by the owner would give Vitals access next time.

## 4. THE QUEUE

1. **Verify the publish by content** (section 0) and have the tester
   re-try the Gujarati storybook on a 1.0.7 client when TestFlight serves
   it.
2. **The Android journey jank** (section 3): measure idle vs scroll, then
   fix; it is the release blocker for Android quality.
3. **The pagdi drop** (section 2), then batch-1 refinement via the
   montage loop.
4. **Games must say WHY a topic is locked** (journey unlocks it) — owner,
   for this round.
5. **Progress screen share options are missing** — owner, for this round.
6. **Chacha-ji variety ruling** (section 2), then the server work.
7. 13-inch screenshots are made; if the owner swaps the review build to
   1.0.7, upload them and the What's New text.
8. Build 24's leftovers: the Your Flex card polish, splash flicker
   measurement on a store build, the XP question, the wide serpentine,
   the 120 storybook webps only the Repl has.

## 5. TRAPS BUILD 25 PAID FOR (beyond CLAUDE.md's new iPad section)

1. **A half-failed multi-edit script leaves later edits silently
   unapplied.** One aborted batch left both generators unwired while the
   commit message claimed otherwise; corrected in `e54e0767`. Verify every
   step of an aborted batch, not just the step you re-ran.
2. **Maestro text taps do not see RN's tree** (CLAUDE.md said it; I paid
   it again on the Feed coach). Native dialogs and Play sheets: text works.
   RN cards: ids, or the scrim, or points.
3. **The weekly race resets the Everyone board**: after rollover the
   leaderboard is an empty state — worthless for screenshots; the Flex
   view or the Streak tab are the photogenic survivors.
4. **`sips` cannot read SVG; librsvg can.** And a "transparent" export
   from a generator preview may carry a BAKED CHECKERBOARD (hasAlpha: no):
   flood-fill the corners with fuzz to key it, but ask for the real
   export.
5. **The pairip finding** (section 3): a clean `System.exit(0)` on
   Android is Play's protection layer, not a crash; grep logcat for
   LicenseClient before hunting your own code.
6. **An elided command in prose gets pasted elided.** The owner pasted my
   "`git pull ... &&`" literally. Paste-blocks must always be complete.
