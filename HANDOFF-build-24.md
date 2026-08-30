# Handoff: BOLO Build 24

Written 2026-08-30 (about 04:00 EDT) by BOLO Build 23. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 24. Use that exact name as your H1 on every message.**

---

## 0. THE STATE, HONESTLY

- **Everything is pushed.** `origin/main` is at the last commit listed in
  section 1 below; `git log --oneline dc5b49e8..HEAD` is the night's work.
- **Four files in the tree are NOT ours**: `gujarati-coach/src/pages/landing.tsx`,
  `src/test/landing.test.tsx`, `src/components/looping-video.tsx` and
  `public/video/`. Another session's web landing work, untouched all night.
  Stage by listed files, never sweep them in. Build 22 was alive in another
  tab until about 01:25: it committed handoff edits between my `git status`
  and my `git push` twice. Assume the index is shared.
- **Stores, morning of 2026-08-30.** The owner said "build now" at 07:58 and
  both builds were cut from `15ef37ff` (everything in this handoff, including
  the wallet scrim fix `82ad6f53` and the flashback lightbox). iOS `1.0.6
  (528)` (`b558fd11`) is HEALTHY (45,985 functions) and uploaded to App Store
  Connect (submission `b30a5e0d`); the owner said they will replace the
  in-flight 527 review with it. Android `1.0.6 (529)` (`72413e89`) is on the
  Play internal track (submission `02202f00`, "All done!"). The earlier iOS
  `527` review and Android `528` internal build carry `163a7065` without the
  scrim fix. An Android `527` (`0333ca22`, no fixes) is still stuck
  IN_PROGRESS on EAS with an artifact; never submit it, cancel it if it
  bothers you.
- **App Store screenshots.** Seven flattened, alpha-free PNGs (1320 x 2868,
  the 6.9-inch slot) are in `~/Desktop/appstore-noalpha/`, numbered in
  upload order: home, journey map, progress, leaderboard, games hub, tailor,
  choose a language. Made with PIL from the owner's phone captures in
  `~/Downloads` (macOS screenshot names carry a narrow no-break space before
  "AM"; glob for them). App Store Connect rejects PNGs with an alpha channel.
- **The next build needs the owner's go in the current message.** Keep
  `1.0.6` unless told otherwise: the owner ruled 1.0.6 three times for
  rebuilds of an unreleased train.
- **The Repl pulled `008424d8` at 08:38 on 2026-08-30 and has NOT pulled the
  second wave (section 1b, twelve commits, `105e2536` to `bfe7a07c`).** The
  pull block that worked: in the Bolo Repl Shell,
  `test -f artifacts/bolo-mobile/app.json && git pull --no-rebase --no-edit origin main && git merge-base --is-ancestor <sha> HEAD && echo ok && git diff --quiet origin/main HEAD && echo identical`.
  No schema or lockfile change all day, so no sync-schema and no install.
  Then the api suite there, then publish.
- **THE FULL SUITES HAVE NOT RUN SINCE `45f4b6eb`.** The owner's standing
  rule (CLAUDE.md, Tests): typecheck only while developing, the full suites
  once, right before a build or a publish. Every change since ran its own
  file's suite at most (and some only typecheck); the web suite as a whole,
  the mobile suite as a whole and the api suite are all owed before the next
  `eas build` or Repl publish. Expect pin moves in files nobody ran.
- **UNBUILT ON MOBILE:** the wallet order (`e7053556`) and the pass landmark
  centred at a quarter of ink (`11698233`). Both seen on the simulator, both
  ride the next build, which needs the owner's go.
- **Web was never seen in a browser tonight.** The web app cannot run against
  data on this Mac (CLAUDE.md). Every web change is typecheck plus the
  suites; the first pair of eyes on it is the Repl preview.

## 1. WHAT BUILD 23 DID (commit order, all on `main`)

1. `dc5b49e8` **Journey: tracing and story rows in every zone of a showroom;
   the Emergency on every zone's last stop.** Owner, off 1.0.6 on a Free
   account: "Every zone for every language should have a script trace and a
   story stop however I'm just seeing it in Zone 1 for each." The showroom
   rule in `planZoneRows` (both twins) hid zones 2 to 6; the `showroom` flag
   is gone from the plan. The Emergency fired only on arrival at a zone's
   ninth stop; counted from production, zone 3 has seven stops everywhere
   and five languages run 5/5/3/5/5/5, so `emergencyStopIndex` in
   `lib/emergency` is the zone's last stop capped at the ninth. Seen on the
   sim in the Gujarati showroom.
2. `987b0b06` app.json write-back (iOS 526, Android 527) after the first
   1.0.6 rebuild; `cbf7baea` the second (iOS 527, Android 528); `15ef37ff`
   the third, the morning build (iOS 528, Android 529).
3. `9220e2a6` **Web Progress** rebuilt to the mockup (ticket, one-row stats,
   journey card, All-Access card, Bolo's bubble).
4. `5f68c674` **Web Leaderboard**: one shared board on both doors, XP or
   Streak, weekly race bar, podium, rank deltas since last look.
5. `7a52d58a` **Mobile: wallet scroll bound, Bazaar hub back button (with a
   fallback to home), home upgrade card is the Ticket Counter's.**
   `5a339f40` **Splash: the bird holds until the film has its first frame
   at its true start** (the flicker; UNVERIFIED on a store build, see §4).
   `163a7065` the splash test's two-step timer pin.
6. `4852f273`, `ca6d91bb`, `c4adbb7f` **Web journey**: ink scrim, painted
   stall card, round train node with the throbbing glow, stop cards in the
   zone card's colours; the modern zone card with Bolo and the bulb box; the
   notched trace ticket with its tip slip.
7. `82ad6f53` **Chai wallet: the dismiss scrim is a sibling under the sheet,
   so the body scrolls.** The owner's 527 report ("feels stuck"). Proven on
   the sim with the identical drag that failed before the change. NOT BUILT.
8. `18c2229c` **Web Bazaar**: hub with four doors; the outfit shop behind the
   Tailor and the Station Master; the Ticket Counter; the Language Office.
9. `0534d568` **Web Chai wallet**: the stall under a scalloped awning, the
   balance card, tiled history with dates and a filter capped at five.
10. `bf02bdc1` **Web paywall**: two-tone headline, Bolo beside the benefits,
    kulhads and the SAVE badge on the annual card, the trial box.
11. `9434dbca` **Web corrections**: floating back arrow on the journey in
    place of the green header; headroom for the home mascot. The pass
    already landed on the map (stale item). Wide serpentine parked (§5).
12. `27120cc1` **The flashback lightbox on both platforms**: a finished
    journey stop asks for the three due phrases; with any due it opens a
    lightbox (Enter, Skip, "Repetition is the key to success"); with none
    it goes to the map. 26 mobile practice test mocks grew the hook stub.
    NOT BUILT on mobile.
13. The commit after it: the closing web run's pin moves, the scenery
    geometry fix and the glyph census, then this handoff and the CLAUDE.md
    baselines.

## 1b. THE SECOND WAVE (2026-08-30, 09:00 to 11:00, off the Repl preview)

The owner reviewed the dev preview and listed gaps; each is one commit,
web unless said, all pushed:

1. `105e2536` **Splash**: the blurred first frame inlined under everything
   (index.html and the overlay, lib/splash-lqip.ts, pinned in step), the
   scene fades in, a 640ms crossfade out. "No blank brown page."
2. `e7053556` **Chai wallet order, BOTH platforms**: Bazaar door, packs,
   history.
3. `d426640d` **Home pass is the parchment sheet** (components/parchment-pass,
   components/landmark), engine closes the stops row, Resume pill, glow
   back; HOME_PANEL_ASPECT 1.9, HOME_STACK_BASE_H 180.
4. `72d6ab95` **Journey map 560 wide on lg**; the zone board's cap holds its
   phone height (ZONE_BOARD_PEDIMENT_MAX_H). UNSEEN in a browser.
5. `a58607c8` **Games hub to the phone's three bands** (lib/game-art,
   lib/last-played-game); the shelves and the Featured card are gone.
6. `b83c373c` **Feed page to the phone's order**; the stock tab strip is
   gone (leaderboard-page.test.tsx is new).
7. `673b07b5` **Language switcher: search, Recent, subtitle**
   (lib/recent-languages); the games hero's line opens the picker, never
   /choose-language (which redirects an account that has chosen).
8. `11698233` **Landmark centred on both, mobile at 0.26 ink** (a tenth was
   invisible on the phone, checked on the simulator); the web frame's
   padding clears the breathe.
9. `77cdb910` **Both store badges in the home footer, always.** Play is still
   the coming-soon badge until `PLAY_STORE_LIVE` flips.
10. `bfe7a07c` **CLAUDE.md**: typecheck only while developing.

**Rulings in this wave:** no full test runs until the end, typecheck only
(permanent, in CLAUDE.md); the wallet order; both badges regardless of
device; the landmark centred.

**iPad, the owner's question, answered in chat:** `supportsTablet` is false
and the app is portrait-only, so today it runs on iPad in phone-compat mode
with no separate build. A real iPad build is one flag plus layout work:
18 mobile files size off the window width and every screen is a phone
column, and web's lg work does not transfer (it is CSS). Cheapest honest
route: a centred content column (about 600pt) on every tab screen, the
window-width users re-pointed at the column, a QA pass on the iPad
simulator, and the mandatory 12.9-inch screenshots. Estimate: one to two
focused days, not hours.

## 2. RULINGS THE OWNER MADE TONIGHT

- **Every zone has a Script Trace stop, a story stop, a Chacha-ji call, an
  Emergency and a flashback.** Trace and story: fixed. Emergency: fixed.
  The call was already one per zone by design (server-side hash; zone 1 at
  station 3). The flashback is calendar-driven (FSRS due dates, whole days,
  floor of one), so it cannot be promised per zone; the owner chose **A,
  leave it calendar-driven**, over building a guaranteed zone flashback.
  Do not relitigate.
- **1.0.6 stays the version for rebuilds** of the unreleased train.
- **No build without the owner's go in the current message.** "don't build
  yet, i'm still testing" stood at the end of the night.
- **The gmail account is Free on Hindi** in production; it is the account on
  the owner's phone and on the sim. I switched it to Gujarati for a proof
  and back; production reads `hi`.

## 3. VERIFICATION, WHERE IT STOOD

- **Mobile suite**: see the numbers at the foot of this section.
- **Web suite**: idem.
- **Api suite**: Repl Shell only; not run this session; no server change
  since `811d982e` (1451 tests, 1449 pass there).
- **Seen on the iPhone 17 Pro simulator**: the showroom rows (zone 2 of
  Gujarati), the Bazaar back button, the wallet scrolling after the scrim
  fix, the home upgrade card. **Not seen anywhere**: the splash sequence
  (a dev client proves nothing about it; CLAUDE.md), all of web.
- Suite numbers at close (2026-08-30 about 04:30 EDT, both on this Mac):
  **mobile 152 suites, 1456 tests, all pass; web 139 files, 1492 tests, all
  pass.** The web run first found eleven failures in six files; one was a
  real catch (the 64px node against the scenery's edge, fixed in the
  geometry), the rest were pins on deliberate changes, each moved with its
  reason (commit "Web: the scenery clears the 64px node...").

## 4. THE QUEUE, IN THE OWNER'S ORDER

1. **The owner's testing of 528/529** (the wallet scrim fix and the lightbox
   are in them), then whatever they find.
2. **The Repl**: pull the second wave (section 0 has the block), the FULL
   suites once (web and mobile on the Mac, api in the Shell), publish, then
   look at section 1b's changes in the preview: the wide map and the games
   hub have not been seen in a browser by me.
3. **The Bazaar "Your Flex" card** (memory
   `bolo-feed-and-bazaar-mockups-2026-08-29`), both platforms. Not started.
   The catalogue has no rarity and no unlock rules; the honest version
   shows owned against not-owned with prices.
4. **The splash flicker**: the fix is code-only and its measurement is a
   store build on the owner's phone. If it still flickers, the next lever is
   the poster: `SPLASH_POSTER` is the film's first frame at 0, while a
   short-mode launch starts at 2.6s; a poster of the short-start frame would
   close the gap the failsafe leaves.
5. **The XP question** (build 22, section 4 item 6). Recommendation for the
   owner, as an A/B: **A (recommended)**: XP stays the race currency
   (leaderboard, badges, daily meter) and buys nothing, but XP MILESTONES
   unlock things Chai cannot buy: a First Class day at 500 XP, a badge frame
   or one outfit at 1,000 XP, a Feed flourish at 2,500. Exclusive to XP, so
   neither currency devalues the other. **B**: a one-way XP to Chai counter
   at a steep rate with a weekly cap (500 XP to 5 Chai, once a week). B is
   the Chai printing press the owner said they did not want, throttled.
6. The wide serpentine on large screens (parked, §5), the 120 storybook
   webps only the Repl has (build 23 handoff §4.2), the Android 527 ghost.

## 5. TRAPS BUILD 23 PAID FOR

1. **A ScrollView under a Pressable ancestor does not scroll on this app's
   New Architecture.** The wallet sheet was a Pressable inside a Pressable
   backdrop; the drag was claimed above the scroller and the list
   rubber-banded. Make the dismiss scrim a SIBLING under the sheet. Memory
   `bolo-scrollview-under-pressable-does-not-scroll`.
2. **Maestro's drag is trustworthy.** When a swipe moves nothing, suspect the
   app, not the harness: the same swipe that failed on the broken wallet
   moved it the moment the scrim was a sibling. I lost an hour blaming the
   tool.
3. **`console.warn` probes show up in LogBox's count**, not in `log stream`;
   an unchanged count means the code never ran. **Metro's project root is
   the monorepo**, so the bundle URL is
   `/artifacts/bolo-mobile/node_modules/expo-router/entry.bundle?platform=ios&dev=true`;
   `curl` it and grep for your string to know what the sim is running.
4. **A deep link into the language picker, then a pick, leaves a stack with
   nothing behind it** (GO_BACK warning, back arrow dead). Terminate and
   relaunch the dev client; it lands on home with a working stack.
5. **A jest state change inside a timer commits at the end of the `act`**,
   so a fade that starts from that state needs a second `act` with its own
   advance. One long advance runs out before the animation exists.
6. **`lazyRoute` infers `object` for a page with an optional-props default
   parameter**; pass the generic explicitly (`lazyRoute<{ door?: ShopDoor }>`),
   type-import the prop type so the page stays a lazy chunk.
7. **The zone board's panel budget is tied to the map width** (the modern
   cap takes the pediment art's aspect); widening the web map for desktop
   shrinks the panel under the cap. Size the cap independently first.
8. **The owner's gmail account is Free; the two others are Plus.** A showroom
   bug is invisible on a Plus account. Check `users.tier` in production
   before choosing which account to reproduce on.
