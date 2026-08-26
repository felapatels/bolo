# Handoff: 2026-08-26, evening

## Name this session BOLO BUILD CHAT 10

Chat 8 was the blocking control, the Nest dashboard and iOS 1.0.2. **9 was this:
the API's Sentry blindness fixed and proved, the Phrasebook's false promise
retired, the Feed collapsed to one tab, and the journey repainted from six
commissioned illustrations.** You are 10. Increment once, at the start.

**Read `CLAUDE.md` first, then this.**

---

## 1. THE THREE THINGS I WAS MID-WAY THROUGH. Start here.

These are in priority order and the first one is a bug I introduced.

### 1.1 The stop cards are illegible over the painted backdrop

**BOTH PLATFORMS.** Every station card except the current one renders with **no
background**. That was invisible over a flat theme and is unreadable over a
painting: "Stop 1 of 11 / Completed / 8/10 mastered" is dark text straight on a
bazaar. Reported with a screenshot of the web dev preview.

The owner's reference draws them as **opaque paper tickets**. That is the fix,
and `pageelements.jpeg` in `~/Downloads` has five card shapes cut for it,
including an eyeleted tag and a folded-corner card. **Nothing uses them yet.**

### 1.2 The web rail and medallions do not exist

**AND THE COMMIT MESSAGE ON `98aae1ca` SAYS THEY DO. It is wrong.** The rail
repaint and the stop medallions are **mobile only**. Web got the backdrops, the
halt-row retirement and the transition, and nothing else. Verified by reading
the diff, not by memory:

```
git show 98aae1ca -- artifacts/gujarati-coach/src/pages/journey.tsx
```

Mobile has `lib/stopEmblems.ts`; web has no `src/lib/stop-emblems.ts`. The six
emblem PNGs and `zone-sign.png` ARE in `public/journey/` already, so the assets
are there and only the code is missing.

### 1.3 The boarding pass drops straight into a lesson

It should **always land on the journey first**, on every platform. The owner's
words: it should never skip the screen that says where you are and what you have
done. **The journey is the destination; a lesson is a choice you make from it.**

---

## 2. Where things stand

- **Repo `/Users/aakeshpatel/bolo`, `main`, HEAD `98aae1ca`, tree clean, pushed.**
- **NOTHING SINCE `61c33738` IS DEPLOYED.** The last republish carried the Sentry
  DSN fix. Six commits of product work sit on GitHub and not in production.
- **iOS 1.0.2 (510) is in review.** No other version can be submitted until it
  clears or you reject it yourself.
- **Android 509 is on the Play INTERNAL track and installed on the owner's
  device.** It carries the Firebase config and a push token registered 14:08 UTC.
- **The Play closed test completes ~2026-08-29**, and that starts the clock on
  production access, it does not end it. Two waits, not one.
- Client suites green at HEAD: **web 117 suites / 1333 tests**, **mobile 121 /
  1219**. **The api suite has still not run since `0d058a1d`.**

**YOU ARE SHARING A CHECKOUT WITH THE BOLO NEST SESSION.** Same directory, not
two clones. It stages by file name and stays inside three cockpit files
(`nest.tsx`, `routes/nest.ts`, `nest-production.html`). Do the same and never
stage by exclusion.

---

## 3. What shipped in chat 9

**THE API HAD NEVER SENT A SINGLE EVENT TO SENTRY, and it was one wrong string.**
`SENTRY_DSN` named project `4511813821792256`, which does not exist in the org.
Ingest answers 403 for an unknown project and the SDK swallows transport errors,
so nothing threw and nothing logged. Every server-side 500 this app has ever
produced went into the void. Fixed in `61c33738`, deployed, and **proved by a
delivered event**: `NODE-EXPRESS-2`, environment production, level warning, full
stack frames. See §4.1 for how it was found, because the method generalises.

**THE PHRASEBOOK PROMISED "ANY ORDER" AND NEVER ALLOWED IT.** `learning.ts:617`
filters served phrases to unlocked lesson groups and journey stops ARE lesson
groups. Learners were being told "No phrases here yet" on topics holding 8 free
phrases in all 22 languages. Owner's call: it is a library of what the Journey
has opened. Copy fixed, empty state split into two honest cases, no server
change needed.

**THE FEED IS ONE TAB, PLUS FLEX.** Weekly XP and Streak read the same payload
and are now one row carrying both numbers. Flex appears only when Bolo is
dressed, derived from `useEquippedOutfit`. Green pulse on new moments, first-run
tour, home mirrors the board row. Both platforms.

**THE SPLASH WAS FLASHING WHITE IN THREE PLACES AT ONCE.** `app.json`'s native
plate, `index.html`'s boot style and `BrandSplash`'s own ground were three
separate hardcoded colours and none had followed the film when it changed. All
now `#89695B`, the new film's first-frame average. Tap to skip on both.

**THE JOURNEY IS PAINTED.** Six illustrated zone backdrops, a stop transition
film per zone, the rail as wood under a green halo, and stop medallions that say
KIND while the card says status. See §5 for what is done and what is not.

**Six user-facing fixes** rode along: the ALL-ACCESS pill running off the screen,
"Full sentences" losing its count, the journey filling the screen, Chacha-ji's
halt row giving back 576 of map, the web desktop losing a transition that looked
blurry on it, and the Phrasebook door copy.

---

## 4. Traps this session paid for

### 4.1 A DSN can be well-formed and still point at nothing

`Sentry.init()` validates the SHAPE of a DSN, never the project. The wiring can
be perfect and the envelopes still land nowhere. **The check that found it took
two minutes**: list the org's projects with their ids and compare against the id
in the DSN's path.

```
mcp__claude_ai_Sentry__search_events   fields: ["project", "project.id", "count()"]
```

`bolo-mobile` and `bolo-web` matched their DSNs exactly. `node-express` did not
match the api's. **Corroboration mattered more than the mismatch**: because the
other two were byte-identical to the shipped values, the odd one out was proven
rather than suspected.

### 4.2 I CLAIMED BOTH PLATFORMS AND SHIPPED ONE

`98aae1ca`'s message describes the rail and the medallions without saying they
are mobile only. I did mobile, said "web next", got pulled onto another request,
and wrote the message from intent instead of from the diff. **Read
`git diff --cached` before writing a message that says "both platforms".** The
repo rule already says every user-facing change states its reach; it does not
help if the statement is written from memory.

### 4.3 The exact-shape test earned its keep

`expect(STALL_PLACEMENT).toEqual({...})` asserts the whole object, which reads
like over-specification until it saves you. Adding `laneDxLeft` to mobile alone
broke it **immediately**, with the message "web parity", which is exactly the job
it exists to do. It is why both platforms got the constant in the same commit.
**Do not loosen it.**

### 4.4 The stall needed a row because it was on the wrong side

`HALT_H` grew 74 to 96 on 2026-08-25 because a card's second line was reaching
Chacha-ji's stall. The real fault was never the height: **the stall and the card
were on the same side**. Encounter stations are always left-flank, so their card
is on the right and their left was empty the whole time. Moving the stall left
let the entire row go, ~576 of map per journey.

### 4.5 A backdrop crops by the band's aspect, and you should know the number first

A zone band is at most 390 wide (`MAP_MAX_W`) and 850 to 1200 tall, so about
0.46 against the paintings' 0.56. `cover` therefore crops **about 9% off each
side**, more on a long zone. That number is why the art was briefed with its
detail at the edges and a quiet corridor down the middle. **Measure this before
commissioning art, not after.**

### 4.6 `practice-streak-xp` is flaky and it is not yours

It failed three times today in the full web run and passed alone every time,
across unrelated changes. Do not chase it into a change you just made. It does
deserve its own look eventually.

### 4.7 Video from a generator arrives at absurd bitrates

The stop films came in at ~15MB for 3 seconds, about 40 Mbps. Trimmed to 1.2s
and encoded at CRF 28 they are **513KB to 1.1MB, VMAF 96.0**. The set is 4.3MB
against 91MB as delivered. **Always measure VMAF before claiming a quality
level**, and remember a comparison against a downscaled source measures the
downscale, not the encode.

---

## 5. The journey re-skin: done and not done

**DONE, both platforms:** six painted zone backdrops (4.2MB), full bleed to the
window with the map geometry unmoved, foot tones sampled per zone, a flat scrim
at 0.28; six stop transition films (4.3MB) playing on stop entry AND on journey
load; the halt row retired.

**DONE, MOBILE ONLY, and this is item 1.2 above:** the rail palette, the stop
medallions.

**CUT AND SHIPPED BUT NOT WIRED:** `zone-sign.png`, the carved station board with
a blank nameplate. It belongs on the fare-zone postcard and that is a
restructure, not a paint pass.

**STILL HAND-CODED SVG:** `ZoneVista`, the thumbnail ON the postcard. It should
probably become a crop of the same painting.

**THE BIG ONE, PROTOTYPED AND NOT STARTED: making the rail follow the painted
road.** Scanning a painting for the palest, least saturated run per row does find
the road, but the raw trace wanders 0.35 to 0.63 of the width and jumps 0.57 to
0.37 near the bottom, catching pale buildings and sky. **It needs a continuity
constraint to be usable.** More importantly it is a **re-plumb of the map's
geometry, not a paint job**: the serpentine constants are shared with the scenery
placement tests, and the stops, halts and every scenery placement hang off them.

**Assets live in `artifacts/bolo-mobile/assets/journey/` and
`artifacts/gujarati-coach/public/journey/`, 9.3MB, identical in both.** The
masters are in `~/Downloads/bolo-zones/` and the element sheets are
`~/Downloads/pageelements.jpeg`, `rail segments.jpeg` and `emblem.jpeg`.

**Extracting from a sheet works and is proven**: crop, then
`colorkey=0xFFFFFF:0.10:0.02,format=rgba`. The white keys out and the cream card
stock and book pages survive, because they are cream and the background is pure
white. Verified by reading corner and centre pixel alpha.

---

## 6. The work queue

**The owner asked for the full queue and it is a published page:**
https://claude.ai/code/artifact/b5a963f2-761d-4ef3-9921-b4dd823564a2

**It is out of date on the "shipped" side** now, but the Open and Parked sections
are current. Re-read it before proposing anything new.

**The owner picked the order themselves from that page's Open section: 1, 5, 6,
2.** Item 1 is the journey and is where §1 above sits. After the journey:

1. **(5) The Phrasebook list still shows twelve identical doors.** Fixing the
   destination does not tell a learner which topics are open before they tap.
   **Needs a new server field**: the category listing carries no unlock
   information at all.
2. **(6) The home widget should rotate the latest moment.** Asked for in chat 7.
   The card reads the projection already but renders one entry and never
   rotates. The green pulse is adjacent and does not replace it.
3. **(2) Run `syncSchema` at api-server boot**, so production stops depending on
   anybody remembering step two of the schema rule.

**The owner also asked for a push, pull and republish cycle after the journey
work.** It has not happened. Six commits are undeployed.

**Parked, with reasoning, in the memory `bolo-parked-work-queue`.** Item 11 is
new: suggestion pills on the Bolo chat page. The design note worth keeping is
that **starter pills and mid-conversation pills are different sets**.

---

## 7. Commands, by terminal

**Deploy web, in the BOLO Replit Shell**, then hit Republish and READ the
migrations step if one appears:

```bash
cd /home/runner/workspace && ls artifacts/gujarati-coach/package.json && GIT_EDITOR=true git pull --no-rebase origin main && pnpm install --frozen-lockfile && git merge-base --is-ancestor 98aae1ca HEAD && echo "OK 98aae1ca IS IN"
```

**Apply committed migrations to DEV, same Shell**, before any publish carrying a
schema change:

```bash
cd /home/runner/workspace && pnpm --filter @workspace/db run sync-schema && psql "$DATABASE_URL" -c "\dt" | tail -5
```

**The api suite, same Shell**, ~6 minutes:

```bash
cd /home/runner/workspace && mkdir -p tmp && pnpm --filter @workspace/db run sync-schema && cd artifacts/api-server && node --import tsx --test --test-reporter=tap --test-concurrency=1 --experimental-test-module-mocks "src/**/*.test.ts" > /home/runner/workspace/tmp/api.log 2>&1; cd /home/runner/workspace && { echo "exit=$?"; grep -E "^not ok" tmp/api.log | head -60; grep -E "^# (tests|pass|fail|skipped)" tmp/api.log; } > tmp/api-summary.log 2>&1; cat tmp/api-summary.log
```

**Client suites, Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

**Read production, read-only, Mac terminal.** Always `cd` first: the working
directory persists and an unset `DATABASE_URL_PROD` connects psql to a local
default that will lie to you.

```bash
cd /Users/aakeshpatel/bolo && set -a; . ./.env.production; set +a
PGOPTIONS='-c default_transaction_read_only=on' /opt/homebrew/opt/postgresql@17/bin/psql "$DATABASE_URL_PROD"
```

**The owner's Android is connected over adb**, which is how several things were
settled today. Screenshot it and read the installed build:

```bash
adb exec-out screencap -p > /tmp/screen.png
adb shell dumpsys package com.bolo.mobile | grep -E "versionCode|versionName"
```

**THE WEB CANNOT RUN ON THE MAC.** The dev database's host is a Replit-internal
name that resolves nowhere else, so the API cannot start here and a web dev
server with no API shows a loading state. **The Repl's dev workflow is the only
preview**, and it runs against the DEVELOPMENT database: judge the art there,
never the data.

---

## 8. Working style

Verdict first, short bullets, **bold the keywords**, no long paragraphs. **No em
dashes, ever.** Always paste shell commands as complete blocks, say which
terminal, and say whether it writes.

**ONE STEP AT A TIME, and it beats every other rule.** End with "Your plate"
naming exactly ONE action, then stop. The next step is not previewed.

**Verify by content, never by assertion.** This session, the two most expensive
mistakes were both claims made from memory rather than from a command: that the
rail shipped on both platforms, and an early theory about why Sentry was silent
that three separate checks had to unwind. **Run the command.**

**Say when they are wrong, and check before saying it.** Twice today the owner
pushed back and was right: once that English shop signs in the art were fine and
only the misspelling mattered, and once that a rail asset already in the bundle
costs no extra MB. Both times my objection had collapsed to something smaller
than I had claimed.
