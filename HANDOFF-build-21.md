# Handoff: BOLO Build 21

Written 2026-08-29 by BOLO Build 20. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 21. Use that exact name as your H1 on every message.**

`origin/main` is `dadf5bea` plus this handoff, tree clean, nothing unpushed.
Sessions overlap in this repo: `git status --porcelain` before any commit,
stage by listing files, `-m` before the pathspec.

---

## 0. WHAT BUILD 20 DID, IN ONE LINE

**Build 19 deployed, then five things the owner asked for live, all
native-free**, in seven commits (`3c10387b` to `dadf5bea`):

1. `3c10387b` CLAUDE.md says ONE step at a time (owner correction, twice).
2. `93fe9945` **openapi.yaml pays its six owed fields** and gains the four
   Chacha-ji call routes; both clients regenerated; three casts gone.
3. `d2595a93` **The one-pager map** behind home's View Map, both platforms:
   poster on top, live legend beneath (`useJourneyProgress(...).zones`, same
   six payloads as the journey, same "Stop N of M").
4. `7ee80b75` **The flashback between stops**, both platforms: up to three
   due phrases, FREE (owner ruling A), skippable, on a finished journey
   stop's way back to the map. **Hesitation counts**: the server measures
   the leading silence in each clip (`audioNoise.leadingSilenceMsFromWav`),
   carries it as `hesitationMs` on the signed token, and at 1.5 s drops the
   FSRS rating one notch (never below Hard) and tags the attempt
   `hesitated`. `GET /review/phrases?limit=N`: three or fewer is free.
5. `abcfff42`, `d07ca3b3`, `dadf5bea` **The posters**: text-free art with the
   app writing every word (section 3). All 22 languages have one.

Also this session: the api-server Sentry silence has a found cause
(section 5.1), the streak push overlap is documented (5.2), the stale
"empty leaderboard" note was deleted (the button has existed since
2026-08-25), and a stop sheet of every journey stop per language was
published: https://claude.ai/code/artifact/b7fe22ce-23f5-4f0a-b8c0-803ab27da39f

Baselines: **web 137 files / 1475 tests**, **mobile 148 suites / 1433
tests**, **api 1450 tests / 109 suites / 1448 pass / 0 fail / 2 skipped**
(Repl Shell, 2026-08-29, after build 20's server change). Typecheck clean
on web, mobile and api.

---

## 1. WHERE THE BUILDS ARE, AND THE DEPLOY

| build | commit | status |
|---|---|---|
| iOS 1.0.5 (523) | `0dc2ad2e` | in App Store review (owner, 2026-08-29) |
| Android 1.0.5 (524) | `0dc2ad2e` | Play internal track |
| **1.0.6** | not built | **HELD by the owner** with the Meta SDK ("lets hold on meta sdk, and the build for now") |

**Web and server:** build 19 was published and verified by content at
12:11 on 2026-08-29 (`index-ClMWqBXz.js`). Build 20's server changes
(flashback door, hesitation, spec) passed the api suite in the Repl
(1450/1448/0/2), the Repl pulled `dadf5bea`, and **the owner published at
the end of the session: VERIFIED LIVE** at 17:25 UTC on 2026-08-29, index
`fccZNL14` carrying the `/map` and `/flashback` routes, `hi.json` served as
`application/json` (1,947 bytes, six signs), `hi.jpg` as `image/jpeg`
(492 KB). Web and server are current. Mobile is not (section below).

**VERIFY BY CONTENT, AND KNOW THE TWO TRAPS.** (1) Unknown paths on
bolo-india.app answer **200 with the homepage HTML** (4070 bytes,
`text/html`), so a 200 on `/journey/maps/hi.json` proves nothing; check
`content-type: application/json` and a length in the thousands, not 4070.
(2) `journey/maps/` lives in the lazy map chunk, not the index. The index
DOES carry the route table, so: `curl -s https://bolo-india.app/`, fetch
the referenced `/assets/index-*.js`, and grep it for `/flashback`. Zero
means build 19 is still live. Build 20's watcher grepped the wrong string
for twenty-five minutes.

**Mobile:** everything from builds 19 and 20 is in the repo only. The
dev client on the iPhone 17 Pro sim (`org.name.Bolo`) has it via Metro.
When the owner lifts the hold: EAS from `artifacts/bolo-mobile`, never the
root, production profile, 1.0.6 (app.json already bumped: buildNumber 523,
versionCode 524, autoIncrement writes back), `scripts/checkBundleHealth.ts`
on the ipa, STOP before any submit.

---

## 2. OWNER DECISIONS THIS SESSION, DO NOT RELITIGATE

- **ONE STEP AT A TIME, ALWAYS.** "Your plate" names exactly one action.
  Corrected into CLAUDE.md this session.
- **The posters carry no text; the app writes the words.** Every
  text-bearing poster the generators made had a wrong city, a borrowed
  row, a misspelt sign or the wrong mascot. Empty boards, app-written
  words, native script on the station signs.
- **Any text-free poster can serve any language** ("many scenes are
  generic so you can use whatever other one with whatever language").
- **The flashback is FREE for everyone (A), sits BETWEEN STOPS, and can be
  SKIPPED.** The twelve-phrase drill stays Plus.
- **Hesitation counts against the phrase.** Measured on the server, never
  trusted from a client.
- **The mascot is the canonical parrot** (`assets/images/mascot/mascot-wave.png`:
  teal body, indigo wings and crest, coral beak, no clothing). The turbaned
  bird on the early ChatGPT posters was wrong.
- **Meta SDK and the 1.0.6 build are on hold** until the owner says.

---

## 3. THE POSTER PIPELINE (the thing you will be asked about)

**Files:** `artifacts/gujarati-coach/public/journey/maps/<code>.jpg` (1080
wide, about 550 KB) and `<code>.json` (the boards, boxes as fractions of
the image, plus `medallions`, `iconsPainted`, `size`). Served, never
bundled (`.easignore` excludes `public/`). Both apps load them by URL:
`lib/journeyMap.ts` (mobile, `https://bolo-india.app/journey/maps/...`) and
`src/lib/journey-map.ts` (web, `${BASE_URL}journey/maps/...`). **A poster
with no JSON renders as-is**: `as`, `or`, `pa` are the three approved
painted-text ChatGPT posters and must not get a JSON.

**Scripts** (`artifacts/gujarati-coach/scripts/`, Mac only, python3 with
Pillow present on the owner's Mac):
- `import-journey-maps.sh <code> ...` or `<code>=/path/file.jpeg`: resample
  (`--resampleWidth`, NOT `-Z`, which caps the long side), run the
  detector, write both files, drop a review overlay in `$REVIEW_DIR`.
  `ICONS=painted` marks medallions as painted (the app draws no icon);
  default `empty` means the app draws its own icon set into the discs.
  `NO_BOARDS=1` for a painted-text poster.
- `detect-journey-boards.py`: cream boards by colour blob; **signs by
  shape** (dark runs of sign width down the centre, because as blobs they
  merge with posts and the night ground); medallions are small near-square
  cream discs; number discs are small dark blobs at panel corners.
  **REVIEW THE OVERLAY PNG EVERY TIME.** Hand-edit the JSON when it is
  wrong (Jammu's top sign was placed by hand; its "number disc" was a rock
  and was nulled).
- `fetch-station-names.py`: Wikidata labels per language for the 132
  station names; output was written by hand into `zonesNative` in both
  `journeyLines.ts` twins. Same-script fallbacks are documented on the
  type. Two Meetei Mayek names are null on purpose.

**The Gemini brief that worked** (attach the approved Assamese poster for
style and the mascot PNG for the character): 9:16, painted, indigo
`#4F46E5` accent, rail violet `#8B5CF6`, cream `#FAECD7`, brass `#D9BE72`,
NO TEXT ANYWHERE, empty title board, empty greeting board with the parrot,
six empty dark station signs on posts, six empty cream zone panels with a
small round medallion each, a bottom cream strip with a lamp. Gemini still
drifted: painted pictures in the medallions in the wrong order, coloured
dots on the signs (Marathi), numerals in a medallion. **The next
improvement is EMPTY medallions** so `iconsPainted: false` and the app
draws the six icons (`hands-pray`, `account-group`, `numeric`,
`food-variant`, `message-text`, `heart` on mobile; `Hand`, `Users`, `Hash`,
`Utensils`, `MessageCircle`, `Heart` on web). The code for that is in and
tested; no poster uses it yet.

**Who has what** (2026-08-29): own scene for hi, gu, bn, ta, te, ur
(Lucknow), mai (Madhubani), mni (Loktak), sa (scholars), sd (Kutch desert),
doi/ks/ne (Jammu mountains, one file); generic scenes for mr (village, no
number discs), kn/ml/kok (temple hills), brx (Loktak), sat (Madhubani);
painted-text posters for as, or, pa. Known blemishes: gu and bn medallion
pictures out of order beside the right words; mr has no numbers; two mni
signs are Latin-only. The owner's raw posters are in
`~/Downloads/bolo-maps/` (named by language, some without extension).

---

## 4. THE OWNER'S TRACK

Verify the publish by content (section 1). Then the corrections off the
owner's screenshots of the live home, journey, walkthrough and MAP, one at
a time, each fixed and shown before the next. Build 19 and 20 never got
those screenshots. Google Play is unchanged: `HANDOFF-build-18.md`
section 6.

---

## 5. PARKED, WITH WHAT IS KNOWN

1. **The api-server has never delivered an error to Sentry, and the cause
   is found:** `lib/logger.ts` exports a Proxy whose Sentry forwarding
   wraps the top-level methods; `app.ts:52` hands that logger to
   `pino-http`, which calls `.child()` per request, so every route's own
   `req.log.error` plus hand-written 500 is a plain pino child that never
   reaches Sentry. Only errors that escape to `Sentry.setupExpressErrorHandler`
   arrive, and routes catch their own. Fix: forward from a pino
   `hooks.logMethod` at base creation (children inherit), and verify by
   sending one.
2. **The streak push overlap** (scout, build 20): the server's streak push
   (17:00 to 20:00 local, in-process hourly sweep from `index.ts:78`, so
   "no caller in the repo" is stale) and the device's daily reminder
   (default 19:00) can both fire in the same hour for the same condition,
   and the "Streak about to end" switch in `account/reminders.tsx` writes
   AsyncStorage only and is read by nothing. Needs a ruling: A, the server
   push defers when `dailyReminderEnabled` is on and the switch goes; B,
   mirror the switch to the account (migration) and gate on it.
3. **Meta SDK** (section 3 of the build 20 handoff still applies): needs
   the App ID and client token as EAS env vars; never in a tracked file.
4. **Repaint list:** Marathi (dotted signs, no discs), Gujarati and Bengali
   (medallion order), and eventually the three painted-text posters, all
   with EMPTY medallions so the app draws the icons.
5. Android launcher icon (July art vs the white iOS icon); the Play 512.
6. The review screen (`app/(app)/review.tsx`) has no error state: a failed
   query shows "Nothing due right now". The flashback steps aside on error;
   the plain review does not.
7. `useJourneyProgress` per-zone data could drive a "you are here" ring on
   the poster itself; the legend beneath carries state today.
8. Everything in the build 20 handoff's parked list not named above
   (web outcome layout twin, web password checklist, openapi is now paid,
   camera permission string, shared svg jest mock, `introScrollDurationMs`,
   the organic in-app review prompt).

---

## 6. TRAPS THIS BUILD PAID FOR

1. **A JSX comment cannot be a second child of a ternary branch.** Both
   map screens broke the same way; put `{/* */}` inside the element.
2. **Swapping `'` for `"` across a whole file breaks apostrophes inside
   strings** (`you'll`). Never bulk-swap quotes; write the file for its
   target.
3. **macOS has no `timeout`**; use the Bash tool's own cap. **The
   python.org Python has no certificate bundle**; fetch through `curl`.
4. **`sips -Z` caps the LONGEST side.** Width is `--resampleWidth`.
5. **A medallion's cream fill cannot tell empty from painted** (a thin
   outline reads as empty). `iconsPainted` is set at import time instead.
6. **Signs cannot be found as colour blobs**; they merge with their posts.
   Find them by shape (dark runs of sign width).
7. **`pnpm run test -- --forceExit` with no file list runs NOTHING** on
   mobile (jest takes `--forceExit` as a pattern, "No tests found"), and a
   batch of three suites once sat ten minutes without a summary. The full
   suite is `pnpm --filter @workspace/bolo-mobile exec jest --forceExit`;
   run suspect suites alone, and cap every run.
8. **`~/bolo/.env` EXISTS on the Mac** (CLAUDE.md said it did not):
   `DATABASE_URL` there is the unreachable dev host; `PROD_DATABASE_URL`
   is production, read-only use, a name nothing in the repo reads. Never
   rename it. SELECTs only.
9. **Graded stops have no names**, anywhere: all 1,025 `lesson_groups.title`
   are null and the journey says "Stop N of M". Do not promise stop names.
10. **Stops per zone differ per language and grow**: 17 languages are 64
    map stops, Gujarati 65, five languages 40 (no C1 sentence top-ups). Any
    count painted into art is wrong somewhere.
11. **Generators lose the row.** ChatGPT crossed Hindi's cities onto the
    Gujarati poster and invented a "Kalka Mail"; Gemini put the icons in
    the wrong medallions and dots on the signs. Text-free art and
    app-drawn everything is the only stable answer.
