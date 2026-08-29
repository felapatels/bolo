# Handoff: BOLO Build 20

Written 2026-08-29 by BOLO Build 19. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 20. Use that exact name as your H1 on every message.**

`origin/main` is `872f5775` plus this handoff, tree clean, nothing unpushed.
**Nothing in this build has been deployed or built yet**: the web and server
changes wait on a Repl pull and publish, the mobile changes on an EAS store
build. Both are the owner's track (section 5).

---

## 0. WHAT BUILD 19 DID, IN ONE LINE

**The three Play-tester asks on both platforms, then six owner asks that
arrived live**, in nine commits (`dca0ccfd` to `872f5775`):

1. **Rate Bolo!** row under Support. Android: Play's in-app review through
   `expo-store-review`, listing fallback. iOS: the App Store write-review URL
   directly (SKStoreReviewController never shows in TestFlight, is capped at
   three a year, and Apple says not to fire it from a button). Web: a link to
   the listing the visitor can rate on; hidden for Android until
   `PLAY_STORE_LIVE` flips. `lib/store.ts` (mobile), `src/lib/rate-link.ts`.
2. **The password eye**, once, in `AuthShell`'s `Field`: sign-in, sign-up and
   account/password all get it. Web is Clerk's own inputs, which already have
   it (verified on the live site). Typing after revealing keeps the text on
   iOS (checked in the sim: "abcd", reveal, "ef" gives "abcdef").
3. **The first-run walkthrough**: step one is the modal **language picker**
   (search box, coloured tiles), opened by the welcome screen over card one
   for an account that has not chosen; then **four cards** (Welcome aboard;
   Say it out loud; Bolo learns you; Chai, games and friends, ending "Watch
   out for emergencies and unexpected fun!"), Skip at every step, once per
   account via the server-side `hasCompletedTour`. Skipping lands on home with
   Hindi, so the July 30 decision survives as the skip path. The notification
   primer waits for it. **Existing accounts meet it once on their next
   launch**, the owner included.
4. **No em dashes in the coach's feedback**: the rubric prompt now forbids
   them and `api-server/src/lib/spokenCopy.ts` scrubs whatever the model
   writes anyway. Plus the handful of learner-facing strings on the lesson
   and error paths, by hand. Comments, prompts and product names untouched.
5. **The first-word lightbox** before the first score ever shown ("Your first
   word!", scoring gets more accurate as you go, Bolo learns how you sound).
   The score reveal AND any unlocked badge wait behind it and release
   together on tap, score first, badge over it. Pinned on the real practice
   screen on both platforms. Shows only when the language's cached progress
   summary says zero attempts AND the device has not shown it.
6. **The feedback on the first screen**, mobile: compact mascot and word card
   while an outcome is up, Hear it moved into the result card beside Hear
   yourself, scroll settles on the end. Seen in the sim. Web untouched (its
   result panel already stays in view); not checked with the owner yet.
7. **The first-login yes turns the daily reminder on** at 19:00 local (owner:
   YES). One enable path, `applyReminderPrefs` in `lib/reminders.ts`, shared
   by the reminders screen and the primer.
8. **The password checklist**: 8 characters, a letter, a number, ticked live
   under the field on sign-up and set-password (red x-circle / green
   check-circle, state also in the label). Sign-up's button waits for all
   three. **Web not done**: both web forms are Clerk's components.

Baselines: **web 135 files / 1462 tests, mobile 146 suites / 1417 tests**,
typecheck clean on mobile, web and api. **The api suite has NOT been run**
for the server change (Repl Shell only): five pure tests on `spokenCopy`
pass on the Mac.

---

## 1. WHERE THE BUILDS ARE

| build | commit | status |
|---|---|---|
| iOS 1.0.5 (523) | `0dc2ad2e` | **in App Store review** (owner, 2026-08-29) |
| Android 1.0.5 (524) | `0dc2ad2e` | Play internal track |

Neither carries anything from build 19. **The next build is 1.0.6** (owner
ruling): `app.json` is already bumped to 1.0.6 with buildNumber 523 and
versionCode 524, and EAS autoIncrement will write 524 / 525 back into the
tree after each build, so expect a dirty `app.json` afterwards.

**The simulator dev client was rebuilt** this session (`expo-store-review`
is a native module): pods installed, `npx expo run:ios --no-install
--no-bundler`, Metro on 8081 was already running from an earlier session.

---

## 2. OWNER DECISIONS THIS SESSION, DO NOT RELITIGATE

- The walkthrough's step one is the PICKER, not `choose-language`. The old
  full-screen chooser stays as a deep-link-only route with its padding fixed.
- The walkthrough must say Bolo learns from you and gets more accurate and
  personal (its own card), and must end with the emergencies line.
- The first-login yes enables the daily reminder (YES).
- The first-word lightbox must never collide with the first badge celebration.
- Em dashes: never, in anything a learner reads.

---

## 3. THE META SDK, STILL NOT STARTED

Owner: "need to add meta sdk to builds next round." `react-native-fbsdk-next`
and its config plugin (App ID, client token, display name), the iOS ATT
string and SKAdNetwork entries, the Android manifest meta-data, the
`AppEventsLogger` activate call AFTER the fonts and the film, never at module
load, with the same census guard `splash-film.test.tsx` gives expo-image.
**Ask the owner for the App ID and client token; never write them into a
tracked file** (`.gitignore` covers `.env*`; confirm wherever they land).

---

## 4. PARKED (carried forward)

1. Web twin of the outcome layout, if the owner's web screenshots ask for it.
2. Web password checklist: only possible by replacing Clerk's forms with
   Clerk Elements; not worth it unless asked.
3. The streak-at-risk push still has no caller in the repo; the Nest's
   `streakPushLast` is the only proof of one outside it.
4. A one-pager map view of the whole journey.
5. The camera permission string before `CHACHA_CALL_SELF_VIEW_ENABLED` flips.
6. `openapi.yaml` owes: `callsNow`, `heardRomanized`, `heardEnglish`,
   `xpEarned`, `selfView`, `encounterChai`.
7. A shared react-native-svg / vector-icons jest mock on mobile.
8. Android's launcher icon (`adaptive-icon.png`, July) does not match the
   white iOS icon; the Play 512x512 is a by-hand upload.
9. The api-server has never sent one error to Sentry.
10. `introScrollDurationMs` unused on both platforms; web `HALT_H` and the
    scenery test's lane block, delete together; the card slide-in on web.
11. The organic in-app review prompt (after a zone closeout) would be the
    right home for iOS's SKStoreReviewController; the Rate row is not.

---

## 5. THE OWNER'S TRACK

**Deploy this build**, one step at a time: pull in the Repl (`git pull
--no-rebase --no-edit`), run the api suite ALONE in the Shell (the server
change is `openai.ts` + `spokenCopy.ts`; expect the pass count to move by
the five new tests, not the total only), republish, then verify by content
(`curl https://bolo-india.app/` and grep the referenced `/assets/index-*.js`
for "Bolo learns you"). Then an EAS store build for both platforms, from
`artifacts/bolo-mobile`, never the root.

**Google Play** is unchanged from `HANDOFF-build-18.md` section 6: the
14-day line on the closed test's dashboard, then the production-access
application with the honest answers, then (now truthfully) the three tester
asks, then the launcher icon.

---

## 6. TRAPS THIS BUILD PAID FOR

1. **The handoff said "the language chooser is already step one"; by content
   nothing routed to it** since July 30. And when it WAS wired as step one
   the owner did not recognise it: there are two language screens, and the
   one learners know is the modal picker. Check which screen a name means
   before building on it.
2. **LogBox, Maestro ids, stale bundles**: all three in CLAUDE.md's dev-loop
   entry now. The stale-bundle one cost the most: two edits looked like they
   did nothing until the app was relaunched.
3. **The web vitest config swallows console output**; to see a value from
   inside a test, throw it in an Error message.
4. **A `useCallback` focus effect keyed on `router`** needs a stable router
   in tests; a fresh object per render re-runs the effect on every press.
5. **Full-replacement API mocks on mobile** (all 24 practice tests) mean a new
   hook in the practice screen must already be in every mock; the summary
   hook was, `queryClient.getQueryData` was not. Read the mocks before
   choosing how a screen reads data.
