# Handoff: 2026-08-26, night

## Name this session BOLO BUILD CHAT 11

Chat 9 fixed the API's Sentry blindness and painted the journey. **10 re-skinned
the journey from the owner's own element sheet on both platforms and built 1.0.3
five times over.** You are 11. Increment once, at the start.

**Read `CLAUDE.md` first, then this.**

---

## 1. DO THIS BEFORE YOU WRITE A LINE OF CODE

**Stand up a dev-client loop so you can see a change in seconds instead of a
25-minute build.** This is the single most important thing in this handoff, and
it is the owner's own words: *"You've gotta be able to do better and check faster
if it working than a full build."*

Chat 10 shipped **five builds** (511, 512, 513, 514, 515) chasing two mobile bugs
it could not see, and every failure report arrived from a build that predated the
fix it was reporting on. That loop is the actual defect.

**It should work, because the mobile app does not need a local API.** There is no
`EXPO_PUBLIC_API_URL`; the client resolves its host from `EXPO_PUBLIC_DOMAIN`
(`bolo-india.app`) in `artifacts/bolo-mobile/.env.local`, so it talks to the
DEPLOYED API. The Replit-internal dev database, which is what stops the WEB app
running on the Mac, does not stand in the way here.

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx expo start
```

The owner's iPhone is on the same network and their Android is on adb. **Confirm
this works and tell them how to open it before doing anything else.** If a dev
client is needed rather than Expo Go (RevenueCat, Clerk and Sentry are all native
modules), build one ONCE with the `development` profile and it is reusable
forever:

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli build --platform ios --profile development --non-interactive
```

**Also available and unused: adb.** The owner's Android is connected. Screenshots
come back in one command and cost nothing:

```bash
adb exec-out screencap -p > /tmp/screen.png
```

---

## 2. THE TWO BUGS THAT MAY OR MAY NOT STILL BE OPEN

**Both were reported repeatedly and both were fixed repeatedly. As of the end of
chat 10 nobody had confirmed a build that actually contains the current fix.**

### 2.1 The carved board's panel renders EMPTY on the phone

Pediment with its nameplate, nothing underneath: no city, no stop count.

Three attempts, and each one was a real bug that was not the cause:

1. A percentage `top`/`bottom` pair on an absolute child. **Yoga does not derive
   a height from that the way CSS does.**
2. Points instead of percentages. Same construct, same collapse.
3. `PC_H` was **152 on mobile against web's 184** and the two had never shared
   it. The pediment takes 67pt, leaving 85 for ~98pt of content.

**The current state (`1d0b9e62`) makes the body a flex child**, which cannot
collapse, and `PC_H` is 184 on both. `ZONE_BOARD_MIN_PANEL_H` and
`zoneBoardPanelH` assert the budget at 320/360/390 wide on both platforms, and
one case asserts the old 152 would have failed.

**Verified in the test renderer, never on a device.** A probe confirmed the geo
name reaches the tree, so if it is still blank the cause is layout, not logic.

### 2.2 The opening shot does not scroll

The map should open at the top, hold 700ms on the zone card, then travel to the
current stop. On device it stays at the top.

**The cause found and fixed:** a hand-rolled tween drove
`scrollTo({ animated: false })` once per `requestAnimationFrame`. **It passed
every test because the test renderer hands out the frames itself**, and it never
moved a real ScrollView. `1d0b9e62` hands the travel back to
`scrollTo({ animated: true })`, which this screen used before the hold existed.

A probe confirmed: nothing during the hold, then exactly one
`scrollTo({ y: 1306, animated: true })`.

**If either is still broken on 515, get a dev client first and do not cut another
build to look.**

---

## 3. Build state at the end of chat 10

| | version | where | safe to promote |
|---|---|---|---|
| iOS **515** | 1.0.3 | App Store Connect | **the only one worth using** |
| Android **515** | 1.0.3 | **live on Play internal** | **the one to use** |
| iOS 514 | 1.0.3 | App Store Connect | **no** |
| Android 514 | 1.0.3 | EAS only, never submitted | n/a |
| Android 511 | 1.0.3 | superseded by 515 | no |

- **511, 512, 513 and 514 all carry the blank board**; 513 and earlier also carry
  green rail through locked zones.
- **iOS is uploaded, NOT submitted for review.** That press is the owner's, along
  with the "what's new" text.
- **Android goes to the INTERNAL track** per the submit profile. The closed test
  completes ~2026-08-29.

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli build:list --limit 4
```

---

## 4. THE API SUITE STILL HAS NOT RUN, and three surfaces now depend on it

Flagged in handoff 10 as unrun since `0d058a1d`. **Sixteen api-server commits have
landed since**, including `openPhraseCount`, which chat 10 added and which has
**never executed**.

It is now read by the Phrasebook's doors, every game's topic picker, and nothing
else has proved it. Clients degrade safely when the field is absent, so the risk
is a wrong count rather than a crash. **In the BOLO Replit Shell, ~6 minutes:**

```bash
cd /home/runner/workspace && mkdir -p tmp && pnpm --filter @workspace/db run sync-schema && cd artifacts/api-server && node --import tsx --test --test-reporter=tap --test-concurrency=1 --experimental-test-module-mocks "src/**/*.test.ts" > /home/runner/workspace/tmp/api.log 2>&1; cd /home/runner/workspace && { echo "exit=$?"; grep -E "^not ok" tmp/api.log | head -60; grep -E "^# (tests|pass|fail|skipped)" tmp/api.log; } > tmp/api-summary.log 2>&1; cat tmp/api-summary.log
```

---

## 5. What shipped in chat 10

**THE JOURNEY IS THE OWNER'S SHEET NOW, BOTH PLATFORMS.** Paper-ticket stop cards
with an eyelet, a hairline rule and three tag variants; enamel badges; the carved
station board; brown sleepers under a bright green centre stripe; cut-art
medallions with no drawn chrome; glyph plates under Chacha-ji and the signals;
Bolo standing on the card. **Every colour was read off `pageelements.jpeg`'s raw
pixels**, never eyedropped.

**`openPhraseCount`** on `GET /categories`: how many phrases the caller can open
right now. It fixed the Phrasebook's twelve identical doors AND all six game
topic pickers, which offered topics the game then refused.

**Also:** the home moment card rotates four moments and snaps back on news;
buying an outfit asks first; the leaderboard tour points at the tab it describes;
chat quick chips in two sets; PRESS & HOLD written around Bolo; the wide bazaar
fills the desktop margin; a real conditional-hook bug fixed on **both** platforms.

---

## 6. Traps this session paid for

### 6.1 A SCREENSHOT CANNOT TELL "BLANK" FROM "CLIPPED", AND IT CANNOT TELL YOU WHICH BUILD IT IS

This cost four builds. Every "still broken" arrived from a build older than the
fix, and there was no way to tell from the image. **Ask which build, or get a dev
client.**

### 6.2 A TEST RENDERER HANDS OUT ITS OWN FRAMES

The scroll tween passed every test and never moved a device. Anything driven by
`requestAnimationFrame`, layout, or measurement is **unverified by RNTL**. Prefer
the platform primitive that already works over the tunable one that might.

### 6.3 YOGA IS NOT CSS

- A percentage `top`+`bottom` pair does **not** derive a height.
- A percentage **padding** resolves against the **width** on all four sides.
- `flex: 1` inside a parent with a height cannot collapse. Prefer it.

### 6.4 REACT NATIVE'S NINE-SLICE IS iOS ONLY

`capInsets` does nothing on Android. This decided three times to DRAW an element
from the sheet's palette rather than stretch the raster. Raster stays right for
anything **one fixed size**.

### 6.5 `cover` THROWS AWAY THE OTHER AXIS

A zone band is ~390x1200 against 1280x2276 art: `cover` discarded **42% of the
width**. Fitting to width and repeating fixed it and made the bundle smaller
(1.9MB against 4.4MB).

### 6.6 A SLICE IS NOT EDGE TO EDGE, MAY NOT BE CENTRED, AND MAY SKIP ITS MIDDLE

`zone-sign-panel.png` is transparent for its first 28 of 760 columns and its
margins are 3.68% left against 5.39% right. An earlier three-slice **left rows
142-220 and 260-300 in no slice at all**, so the drawn frame jogged at the join.
Scan the alpha; keep slices contiguous.

### 6.7 `autoIncrement` BUMPS AS IT QUEUES

With `appVersionSource: local`, writing the number you want produces the one
**after** it. Write one below. Two builds were cancelled learning this.

### 6.8 BUILD THE PREVIEW YOU ARE MISSING

ffmpeg is on the Mac. Compositing the slices at their real rendered size with the
content box drawn on top settled in one look what four screenshots could not.

---

## 7. Open work

- **The story stop has no progress bar.** Asked for; nothing records how much of
  a book has been read, so a bar would be decoration. Needs scene-read tracking.
- **`ZoneVista` is unrendered on both platforms** and its tests still run. It is
  pinning art dimensions nothing draws. **Delete it or give it a home.**
- **Bolo's pagdi may be clipped on the chat screen.** Reported on an old build,
  not reproducible from the code: nothing has `overflow: hidden` and both layers
  draw `contain` in the same square. **Confirm on 515 before touching it.**
- **`zone-sign.png`** (the uncut original) is unused now the board is two slices.
- **The rail following the painted road**, still the big one, still not started,
  still a re-plumb of the map's geometry rather than a paint pass.

### The work queue

The owner's order was 1, 5, 6, 2. **1, 5 and 6 are done.** Item **2 is parked on
purpose**:

> **Run `syncSchema` at api-server boot.** **The script's own docstring says it is
> NOT a substitute for `drizzle-kit migrate` on production** — it is written for
> the shared dev DB and skips duplicate-object errors. The goal is real
> (production should not depend on anybody remembering step two) but the right
> implementation is probably `drizzle-kit migrate`. **It touches production schema
> at startup. Get a decision before writing it.**

Parked items live in the memory `bolo-parked-work-queue`. **Item 11, chat
suggestion pills, is DONE and can come off it.**

---

## 8. Commands, by terminal

**Deploy web, in the BOLO Replit Shell**, then Republish:

```bash
cd /home/runner/workspace && GIT_EDITOR=true git pull --no-rebase origin main && pnpm install --frozen-lockfile && git merge-base --is-ancestor a7a82efd HEAD && echo "OK a7a82efd IS IN"
```

**Client suites, Mac terminal.** About four minutes together. **The owner asked
twice to stop running them between every change** — typecheck while working, run
the suites once before a commit that matters.

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

**Build and submit, Mac terminal.** The **EAS MCP tool cannot build**: the project
has no GitHub repo connected and `build_run` fails with "No repository found".
The CLI is authenticated as `aakeshp`.

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli build --platform all --profile production --non-interactive --no-wait
```

Commit the `app.json` bump EAS just wrote, then submit by build id. **`eas submit`
waits for an in-flight build** rather than refusing it, and its output is
block-buffered off a terminal, so empty output means waiting, not failure.

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli submit --platform ios --profile production --id <BUILD_ID> --non-interactive
```

**Two known flakes**, both pass alone and on re-run: `practice-streak-xp` (web)
and `family.test.tsx` (mobile). Do not chase either into a change you just made.

**You share the checkout with the BOLO NEST session.** Stage by file name, never
by exclusion, and leave `nest.tsx`, `routes/nest.ts`, `presence.ts` and
`nest-production.html` alone unless you are that session.

---

## 9. Working style

Verdict first, short bullets, **bold the keywords**, no long paragraphs. **No em
dashes, ever.** Paste shell commands as complete blocks, say which terminal, say
whether it writes.

**ONE STEP AT A TIME.** End with "Your plate" naming exactly ONE action, then
stop.

**MEASURE, DO NOT INFER.** Every expensive mistake in chat 10 was a guess from a
cropped screenshot when the answer was a constant, a pixel scan, a composite or a
probe away. Reading `PC_H` would have taken thirty seconds and saved three builds.

**SAY WHICH PLATFORM, FROM THE DIFF.** Mobile had the same conditional-hook bug
web did and no Chacha-ji nameplate at all; both were found only by sweeping
deliberately rather than trusting memory.

**THE OWNER MOVES FAST AND ADDS WHILE YOU WORK.** Expect new asks mid-task. Finish
what is half-done before starting the next thing, and say plainly when a build is
being held so they can decide.
