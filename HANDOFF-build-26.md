# Handoff: BOLO Build 26

Written 2026-08-30 (afternoon, EDT) by BOLO Build 25. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 26. Use that exact name as your H1 on every message.**

---

## 0. THE STATE, HONESTLY

- **Build 25 was the iPad session.** The owner ruled **option A** at the
  start: portrait only, full screen, one centred 600pt column on every
  screen, backgrounds full-bleed. Option B (all orientations, Split View,
  two-column layouts) was rejected; do not re-propose it.
- **Sixteen commits on `main`**, `2b5a3c4f` to this handoff, all mobile
  plus the records. Section 1 lists them. **NOT PUSHED** at the time of
  writing: the owner had not asked, and the other agent's uncommitted web
  work sits in the same tree.
- **iOS 1.0.6 (529) is the first iPhone-and-iPad binary**, EAS build
  `6aa48cb0-c4b0-4d48-ad84-7cdfcf73f7fa` off `cea37099`, started 17:44 UTC
  on the owner's "i want to see it on my device". Its outcome, the bundle
  health check and the TestFlight submission are in section 4 if build 25
  got that far; if section 4 says nothing, the build was still on the
  builder when this was written. Version stayed 1.0.6 per the standing
  ruling; **App Store Connect will require 13-inch iPad screenshots the
  first time an iPad-capable build is submitted for review** (TestFlight
  needs none), so replacing the phone-only 528 review with 529 is the
  owner's call and needs screenshots first.
- **Suites.** Mobile: 155 suites, 1468 tests, all pass (full run before the
  build, one file re-run after its own pin was corrected). Web: NOT run by
  build 25; nothing in today's commits touches web. Api: not run; no server
  change today.
- **Another agent's web work is in the tree**, uncommitted:
  `gujarati-coach/index.html`, `src/pages/journey.tsx`, `landing.tsx`,
  `landing.test.tsx`, `looping-video.tsx`, `hero-showcase.tsx`,
  `public/hero/`, `public/video/`, and a deleted `speaking-demo.tsx`. Never
  stage them. Their dev server is on `:5173` from the same checkout.
- **Chrome and simulators.** Build 25 opened nothing that is still open in
  Chrome. Three simulators are booted: iPhone 17 Pro (the usual dev client),
  iPad Pro 13-inch and iPad mini (the iPad dev client, both signed into the
  owner's gmail account, which is **Free on Hindi**). Metro is the owner's
  own `expo start` on `:8081`.
- **The owner's account was switched to Punjabi by one of my point taps and
  switched back to Hindi.** Ids over points wherever a list can be up.

## 1. WHAT BUILD 25 DID (commit order, all on `main`)

1. `2b5a3c4f` **Bolo! Family is off sale on the Subscription screen too.**
   Web withdrew the tier on 2026-08-24; mobile never got the flag. Not an
   iPad bug, the iPad just showed it. Pinned both roles.
2. `399fb51f` **The content column**: `lib/contentWidth.ts`, `Screen`'s
   column, the tab bar on the column, ten width readers re-pointed, nine
   bottom sheets capped at the column and six dialogs at a card width, the
   Feed coach card on the column.
3. `108b753c` **Journey on the iPad: web's wide bazaar edge to edge, the map
   at 560** (the owner chose 560 over 390 from side-by-side captures; the
   artifact is at https://claude.ai/code/artifact/6e8acee4-d053-4cc6-a6be-9d6b68d3ead8).
   `assets/journey/zone-wide.jpg` copied from web.
4. `f83a539b` **The zone rail beside the map**, a twin of web's build 24
   rail, with `zones2` (Journey 2 station names) ported for all 22 lines.
5. `497565dc` The rail shows only where it fits (13-inch only today).
6. `9cea52d7` Call screens' button rows capped to the column (code only).
7. `eeb8c093` Bazaar welcome key art covers a wide screen.
8. `201fa7e9` **Games hero covers the column** (owner's catch).
9. `b6b61d50` **Chat bird under the time bar**, not on it (owner's catch;
   Free accounts only, so a phone had it too).
10. `2c182762` **The chat bird's band is hers alone**: the transcript
    viewport starts below her, the strip is inset from her (owner's catch,
    proven on the iPad and the iPhone through a real text turn).
11. `69f18942` `supportsTablet` + `requireFullScreen` in app.json.
12. `cea37099` The Screen column pin by id.
13. `a79b0bd1` app.json write-back, iOS 529.

## 2. RULINGS THE OWNER MADE

- **Option A** for the iPad (see section 0). **560** for the map on the wide
  bazaar. **The zone rail** brought over from web. **Fix Family now** rather
  than park it. **Version 1.0.6** stays for the iPad build.
- **Android tablets** are out of scope for this train. The Android 16 ruling
  is owed: Expo SDK 54 targets API 36, where a portrait lock is ignored on
  screens 600dp and wider, so an Android tablet will rotate this app to
  landscape. Options: the one-release manifest opt-out, or accept landscape
  with the column centred.

## 3. VERIFICATION, WHERE IT STOOD

- **Seen with real data on the iPad Pro 13-inch and the iPad mini:** Home,
  Games and a game, Progress, Chat (a full text turn), Journey, Leaderboard
  with the coach, Bazaar and its welcome, one-pager map, paywall and language
  picker (page sheets, columned inside), Settings, Subscription, Badges,
  Phrasebook, Friends, Storybook, Emergency, practice, review, analytics, a
  category, reminders, voice, memories, welcome, the chai wallet sheet, the
  splash film, the zone rail and its tap.
- **Seen on the iPhone 17 Pro:** the chat band fix.
- **Not seen anywhere:** Chacha-ji's call screens (reaching them rings him
  on the owner's account); the release build's behaviour on a real iPad
  (a dev client is not evidence for animations or crashes, CLAUDE.md).
- **Not run:** web suite, api suite (nothing of theirs changed).

## 4. THE BUILD AND THE QUEUE

0. **1.0.7 (530) is BUILT AND SUBMITTED on both platforms** (evening,
   after the storybook fix): iOS `72858604` HEALTHY (46,030 functions) and
   submitted to App Store Connect for TestFlight; Android `d06a45af`
   submitted to the Play internal track ("All done!"). Full suites ran
   green immediately before (mobile 156/1475, web 142/1518). **The server
   half of the storybook fix ships ONLY with a Repl publish** (pull
   `d7c8d6fc`+, api suite in the Shell, publish); until that publish, every
   build still shows the Gujarati blank-page fix's client half against a
   server that returns no variant rows. The owner was running that block
   when this was written; confirm it happened before assuming the fix is
   live.

1. **Build `6aa48cb0` (1.0.6, 529) FINISHED at about 18:05 UTC, HEALTHY
   (46,007 functions, the animating shape), and was SUBMITTED to App Store
   Connect** (submission `76d3e24f-63be-4455-92b2-2eb1dd0a53bc`, "Submitted
   your app to Apple App Store Connect"). Apple's processing takes 5 to 10
   minutes, then it appears in TestFlight for the owner's iPad. Ten cold
   starts, never five, before calling it clean; the splash film, the wide
   bazaar and the rail have only ever been seen on a dev client.
2. **13-inch iPad screenshots** for App Store Connect before any iPad build
   goes to review: the simulator at 2064x2752 is the 13-inch slot; the same
   seven scenes as the phone set in `~/Desktop/appstore-noalpha/`, flattened
   and alpha-free.
3. **The Android 16 orientation ruling** (section 2) before the next Android
   build.
4. **Games do not explain journey-locked topics** (owner, build 25, for the
   next round): a game's topic list shows "0 phrases" rows with no word that
   the journey unlocks them. Say why, and point at the journey.
5. **The Progress screen lost its share options** (owner, build 25, for the
   next round): whatever used to offer sharing from Progress is not there.
   Find what shipped it last and restore or redesign it.
6. Everything build 24 left: the Repl pull and publish of the second wave,
   the Your Flex card, the splash flicker on a store build, the XP question,
   the wide serpentine.

## 5. TRAPS BUILD 25 PAID FOR

1. **Never tap "Open" blind after `openurl` to the dev client.** When the
   dialog is absent the tap lands on the launcher's server row and loads the
   bundle twice; the client dies 5s in (a reanimated turbo-module assert or
   EXC_BAD_ACCESS in Fabric's mount). Three crash reports were read as an
   app bug first. `tapOn: {text: "Open", optional: true}`; 8/8 alive since.
2. **A point tap switched the owner's account language.** Ids over points
   wherever a list can be up. The zone rail hides itself from the
   accessibility tree (as on web), so it alone must be tapped by point.
3. **`useContentWidth` where you meant the window breaks full-bleed art.**
   The first pass pointed the journey's zone tiles at the column and got a
   600 band on a 1032 screen. The window for backdrops; the column for cards.
4. **A hero sized off its height at 16:9 stops covering at 600.** 462 wide
   passes every phone and fails the column. Cover on whichever axis needs
   more.
5. **Absolute chrome anchored to a measured header measures the wrong box
   the day a sibling appears.** The chat's time bar (Free only) sat outside
   the measured pill row, so the bird landed on it. Measure the whole band.
6. **A 1 MB artifact page tripped Cloudflare in the viewer**; 293 KB did
   not. Send the picture with SendUserFile as well.
7. **Maestro's `pressKey: Enter` once backgrounded the dev client** on the
   iPad (the app survived); the same flow worked on the next run.
8. **`xcrun simctl terminate` can silently not terminate**; check
   `launchctl list` before believing a relaunch captured a cold start.
