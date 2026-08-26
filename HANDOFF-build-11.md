# Handoff: 2026-08-26, night

## Name this session BOLO BUILD CHAT 11

Chat 9 fixed the API's Sentry blindness and painted the journey. **10 was the
journey made real on a device: the map re-skinned from the owner's own element
sheet on both platforms, four bugs that only a phone could show, and 1.0.3 built
and submitted.** You are 11. Increment once, at the start.

**Read `CLAUDE.md` first, then this.**

---

## 1. WHERE 1.0.3 STANDS. Start here.

**iOS 514 and Android 514 were building and submitting when chat 10 ended.**
Check them before anything else:

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli build:list --limit 4
```

- **514 is the first pair carrying everything.** 511, 512 and 513 all shipped a
  BLANK ZONE BOARD and 513 also has green rail through locked zones. **None of
  them should be promoted.** Android 511 went to the Play internal track and is
  live there until 514 supersedes it.
- **iOS is uploaded to App Store Connect, NOT submitted for review.** Pressing
  Submit for Review and writing the "what's new" text is the owner's.
- **Android goes to the INTERNAL track**, per the submit profile. The closed
  test still completes ~2026-08-29.

### The one thing the owner has not confirmed

**Bolo's pagdi may be clipped on the chat screen.** Reported on an old build, and
chat 10 could not reproduce it from the code: nothing has `overflow: hidden`, and
both the base and the accessory draw `resizeMode="contain"` in the same square.
The likeliest candidate is the listening pulse ring crossing the turban rather
than a crop. **Ask before changing anything.**

---

## 2. THE API SUITE STILL HAS NOT RUN, and it now matters more

It was already flagged in handoff 10 as unrun since `0d058a1d`. **Fifteen
api-server commits have landed since**, including `openPhraseCount`, which chat
10 added and which is **typechecked and has never executed**.

Both clients degrade safely when the field is absent, so the risk is a wrong
count rather than a crash. But three separate surfaces now depend on it: the
Phrasebook doors, every game's topic picker, and nothing else has proved it.

**In the BOLO Replit Shell, ~6 minutes:**

```bash
cd /home/runner/workspace && mkdir -p tmp && pnpm --filter @workspace/db run sync-schema && cd artifacts/api-server && node --import tsx --test --test-reporter=tap --test-concurrency=1 --experimental-test-module-mocks "src/**/*.test.ts" > /home/runner/workspace/tmp/api.log 2>&1; cd /home/runner/workspace && { echo "exit=$?"; grep -E "^not ok" tmp/api.log | head -60; grep -E "^# (tests|pass|fail|skipped)" tmp/api.log; } > tmp/api-summary.log 2>&1; cat tmp/api-summary.log
```

---

## 3. What shipped in chat 10

**THE JOURNEY IS THE OWNER'S SHEET NOW, BOTH PLATFORMS.** Stop cards are paper
tickets with an eyelet, a hairline rule and three tag variants; badges are
enamelled plates; the zone header is the carved station board; the rail is brown
sleepers under a bright green centre stripe; the medallions are the cut art
alone. **Every colour was read off `pageelements.jpeg`'s raw pixels**, not
eyedropped.

**THE OPENING SHOT.** The map opens at the top, holds 700ms on the zone card,
then travels to the current stop. Duration caps at 900ms so **further means
faster**. A tap lands you on your card; a wheel or key cancels.

**FOUR BUGS A PHONE FOUND AND A SCREENSHOT COULD NOT EXPLAIN.** See §4.

**`openPhraseCount`** on `GET /categories`: how many phrases the caller can open
right now. It fixed the Phrasebook's twelve identical doors AND every game's
topic picker, which offered topics the game then refused.

**Smaller:** the home moment card rotates four moments with a crossfade and snaps
back when news lands; buying an outfit asks first; the leaderboard tour points at
the tab it describes; quick chips on the chat page in two sets; PRESS & HOLD
written around Bolo; the wide bazaar fills the desktop margin.

---

## 4. Traps this session paid for

### 4.1 A SCREENSHOT CANNOT TELL "BLANK" FROM "CLIPPED"

The zone board rendered empty on the phone through **two TestFlight builds** and
three wrong fixes. Each fix was a real bug and none was the cause:

1. A percentage `top`/`bottom` pair on an absolute child — **Yoga does not derive
   a height from it the way CSS does.**
2. Before that, a percentage *padding* — **CSS resolves percentage padding
   against the WIDTH on all four sides**, so a vertical inset written that way is
   wrong by however much the box is wider than it is tall.
3. The actual cause: **`PC_H` was 152 on mobile and 184 on web.** The two never
   shared it and chat 10 assumed they did. The pediment took 67pt, leaving 85 for
   ~98pt of content, and `overflow: hidden` made "does not fit" look identical to
   "is not there".

**The lesson is the method, not the numbers.** Reading the constant would have
taken thirty seconds; three screenshot-driven guesses took two builds.
`ZONE_BOARD_MIN_PANEL_H` and `zoneBoardPanelH` now assert the budget at 320, 360
and 390 wide on both platforms, and one case asserts the old 152 would have
failed so the guard cannot quietly stop guarding.

### 4.2 BUILD THE PREVIEW YOU ARE MISSING

Chat 10 had no way to see mobile and no local web server, and iterated blind off
cropped screenshots for four rounds on the board's insets. **Compositing the
slices at their real rendered size with the content box drawn on top settled it
in one look.** ffmpeg is already on the Mac and this cost two minutes:

```bash
ffmpeg -i zone-sign-top.png -i zone-sign-panel.png -filter_complex \
  "color=c=0x6B4A33:s=350x184:d=1[bg];[0:v]scale=350:65[t];[1:v]scale=350:119[p];\
   [bg][t]overlay=0:0[a];[a][p]overlay=0:65[b];\
   [b]drawbox=x=28:y=79:w=294:h=87:color=red@0.9:t=2,scale=750:-1[out]" \
  -map "[out]" -frames:v 1 -update 1 -y /tmp/check.png
```

The same trick proved the tileable paintings: render a real 390x1150 band and
look at the seam.

### 4.3 REACT NATIVE'S NINE-SLICE IS iOS ONLY

`capInsets` does nothing on Android, which needs a 9-patch drawable a `require()`d
PNG cannot be. This decided three times to DRAW an element from the sheet's
sampled palette rather than stretch the raster. Raster stays right for anything
**one fixed size** — the medallions and emblems are real PNGs. When only one axis
stretches, a hand-rolled slice works identically on both.

### 4.4 A SLICE IS NOT EDGE TO EDGE, AND IT MAY NOT BE CENTRED

`zone-sign-panel.png`'s first 28 of 760 columns are fully transparent, its frame
begins at 47, and its margins are **3.68% left against 5.39% right**. A symmetric
fill spilled past the right frame. Scan the alpha before assuming a file is what
it looks like.

### 4.5 THE THREE-SLICE THAT SKIPPED ITS OWN MIDDLE

The board was cut 0-142, 220-260 and 300-344. **Rows 142-220 and 260-300 were in
no slice**, so stretching butted two unrelated rows of a drawn frame together and
the rule jogged. Two contiguous pieces cannot have that fault. Squashing a frame
slightly is invisible; losing 78 rows out of one is not.

### 4.6 `cover` THROWS AWAY THE OTHER AXIS

A zone band is ~390x1200 and the paintings were 1280x2276. `cover` fills the
taller axis and **discarded 42% of the width** — the learner saw a blown-up slice
of a street, never the street. Handoff 10 put this at "about 9% off each side",
measured against a short zone and wrong for every real one. Fitting to the width
and repeating fixed it and **made the bundle smaller**: 860x1359 replaces
1280x2276, 1.9MB against 4.4MB.

### 4.7 `autoIncrement` BUMPS AS IT QUEUES

With `appVersionSource: local`, writing the build number you want and building
produces the number **after** it. To land on a chosen number, write one below it.
Two builds were cancelled learning this.

### 4.8 A CONDITIONAL HOOK CAN HIDE FOR MONTHS IN REACT NATIVE

`Journey` had three early exits above three hooks on web and **four on mobile**,
so every "Laying the tracks" to map transition changed the hook count. Web only
got caught because the owner screenshotted the runtime overlay. **A React Native
screen has no such overlay** — it would have shipped. If you touch either
journey screen, check that every hook is above every `return`.

---

## 5. The journey: done and not done

**DONE, both platforms:** painted backdrops (tileable, fit to width), stop
transition films, the carved station board, paper-ticket cards with three tag
variants, enamel badges, brass medallions, the repainted rail with its green
centre stripe, glyph plates under Chacha-ji and the signals, Bolo on the card,
the trace progress bar, the opening shot.

**WEB ONLY, by design:** the wide bazaar filling the desktop margin. A phone IS
the 390pt column, so there is nothing for it to fill.

**NOT DONE:**

- **The story stop has no progress bar.** The owner asked; nothing anywhere
  records how much of a book has been read, so a bar would be decoration. It
  needs scene-read tracking first.
- **`ZoneVista` is unrendered on both platforms** and its tests still run. It
  became a crop of the zone painting in the morning and came off the board in the
  afternoon. **Delete it or give it a home** — it is currently pinning art
  dimensions nothing draws.
- **`zone-sign.png`** (the uncut original) is unused now that the board is two
  slices.
- **The rail following the painted road**, still the big one from handoff 10 §5,
  still not started, still a re-plumb of the map's geometry rather than a paint
  pass.

---

## 6. The work queue

**The owner's order from the published page was 1, 5, 6, 2.** Items **1, 5 and 6
are done**. Item **2 is deliberately parked**:

> **(2) Run `syncSchema` at api-server boot.** Chat 10 refused to ship this
> blind. **The script's own docstring says it is NOT a substitute for
> `drizzle-kit migrate` on production** — it is written for the shared dev DB and
> skips duplicate-object errors. The goal behind the item is real (production
> should not depend on anybody remembering step two), but the right implementation
> is probably `drizzle-kit migrate` at boot, possibly with syncSchema as a net.
> **It touches production schema at startup. Get a decision before writing it.**

**Parked, with reasoning, in the memory `bolo-parked-work-queue`.** Item 11
(chat suggestion pills) is now DONE and can come off it.

---

## 7. Commands, by terminal

Unchanged from handoff 10 except the deploy hash. **Deploy web, in the BOLO
Replit Shell**, then Republish:

```bash
cd /home/runner/workspace && GIT_EDITOR=true git pull --no-rebase origin main && pnpm install --frozen-lockfile && git merge-base --is-ancestor a9aea984 HEAD && echo "OK a9aea984 IS IN"
```

**Client suites, Mac terminal.** They take about four minutes together, so batch
them: the owner asked twice to stop running them between every change.

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

**Build and submit, Mac terminal.** The EAS MCP tool CANNOT be used: the project
has no GitHub repo connected and `build_run` fails with "No repository found".
The CLI is authenticated.

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli build --platform all --profile production --non-interactive --no-wait
```

Then commit the app.json bump EAS just wrote, and submit by build id:

```bash
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx eas-cli submit --platform ios --profile production --id <BUILD_ID> --non-interactive
```

`eas submit` **waits for an in-flight build** rather than refusing it, so both can
be armed the moment the builds are queued. Its output is block-buffered when not
attached to a terminal: empty output means waiting, not failure.

**Two known flakes**, both pass alone and on re-run: `practice-streak-xp` (web,
noted in handoff 10) and `family.test.tsx` (mobile, new). Do not chase either
into a change you just made.

---

## 8. Working style

Verdict first, short bullets, **bold the keywords**, no long paragraphs. **No em
dashes, ever.** Paste shell commands as complete blocks, say which terminal, say
whether it writes.

**ONE STEP AT A TIME, and it beats every other rule.** End with "Your plate"
naming exactly ONE action, then stop.

**THE OWNER WILL ASK YOU TO BATCH.** Chat 10 was told twice to stop running the
full suites between changes and once to stop previewing. Typecheck between edits;
run the suites once before a commit that matters.

**MEASURE BEFORE YOU FIX A VISUAL.** Every expensive mistake in chat 10 was a
guess from a cropped screenshot when the answer was a constant, a pixel scan or a
composite away. Three of them cost a TestFlight build each.

**SAY WHICH PLATFORM, FROM THE DIFF.** Handoff 10 opened with this and chat 10
still needed it: mobile had the same conditional-hook bug web did, and no
nameplate at all, and both were only found by sweeping deliberately rather than
trusting memory of what had been done.
