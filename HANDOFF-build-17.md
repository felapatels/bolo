# Handoff: build 17

Written 2026-08-28 by BOLO BUILD CHAT 16. **Read `CLAUDE.md` first, then this.**

`origin/main` is `0d5f29d3`, tree clean, nothing unpushed.

---

## 0. WHERE THE BUILD ACTUALLY IS

**THE BUILD IS STILL NOT CUT, AND THE THREE BLOCKERS FROM BUILD 16'S HANDOFF ARE
ALL STILL THERE. I never reached them.** Nothing below has been near EAS:

- **`eas-cli` is NOT INSTALLED.** Not on PATH, not in `node_modules/.bin`.
- **There is no `.easignore`,** and `artifacts/bolo-mobile/ios` exists untracked.
  CLAUDE.md says `ios/` is excluded via `.easignore`, which REPLACES
  `.gitignore` on EAS. It does not exist, so EAS falls back to `.gitignore`,
  which does exclude `ios/`. That works by luck and is one file away from a
  bare-workflow build.
- **Run `eas-cli` from `artifacts/bolo-mobile`, never the repo root.**
- `expo.version` is `1.0.5`. **Do not touch it.**

**THE SERVER IS PUBLISHED AND CURRENT AS OF `bb7aed07`.** Everything after that
(`77f558f3`, `4d4a0f2e`, `4168eb7b`, `5391875e`, `0d5f29d3`) is on `main`, is in
the Repl, and is **NOT DEPLOYED**. The mobile half of those runs on the
simulator through Metro; the server half does not exist in production yet.

**Publish before judging anything server-side.** No schema change since
`0058_sleepy_famine`, so the migrations step should NOT appear. Its absence is
the signal.

---

## 1. THE ONE OPEN BUG, AND IT IS TWO SYMPTOMS OF ONE THING

**Owner, 2026-08-28: "did you know overlaps the card and border" and, earlier,
"i can scroll up and down but i can't see the top of card 1 zone 1."**

**THEY ARE THE SAME BUG.** The zone board's DID YOU KNOW fact runs to two lines,
the box does not grow to hold them, and the second line rides out through the
dashed border AND through the panel's bottom edge. What it lands on is **the top
of the first stop card of that zone**, which is why stop 1 has never been
visible at the top of zone 1.

### What is already fixed and is NOT the cause

`5391875e` fixed a real and separate overlap: the journey header is
`position: absolute, top: 0, zIndex: 50`, and the scroll content was padded by a
flat `SCROLL_CONTENT_TOP = 18`, so the first ~104 points of canvas sat under the
header with nothing above zero to scroll to. `headerH` had been measured since
the header was written and was consumed by nothing. That clearance is now spent
**inside the canvas** (`layoutY = TOP_PAD + headerClearance`) rather than as
content padding, because padding pushed the ART down too and left a bare strip
of Screen background behind the status bar (owner: **"that shouldn't be
there"**). Both of those are done and verified.

### What is measured, and it is solid ground to start from

A temporary `[JDIAG]` line on the Hindi journey printed:

```
headerH 122, headerClearance 104, PC_H 184, TOP_PAD 10, SCROLL_CONTENT_TOP 18
postcard centre 206   ->  board's SLOT is canvas 114..298
first station  360    ->  card top 334, an 18pt gap = ZONE_BOARD_GAP
```

**So the canvas reserves the right space.** The board's slot ends at canvas 298
and the first card starts at 334. The defect is that **the RENDERED panel is
taller than its 184pt slot** and overflows into that gap and past it. On screen
the panel's bottom sits around 356pt against a slot ending at 316pt, so it
overruns by roughly **40 points**.

### What I tried and what it did

Styling `boardFact` with `flexShrink: 0`, `minHeight: 42`, `overflow: 'hidden'`
and lifting `boardFactText.lineHeight` from 12 to 13 **did not change the render
at all**. Reverted; the tree is clean. Either the constraint is further up the
tree than `boardFact`, or Metro did not pick the change up. **I did not
distinguish those two, and that is the first thing to do.**

### Where to look

- `artifacts/bolo-mobile/app/(app)/journey.tsx`, the `board-fact-${zi}` block
  (~line 1596) and `styles.boardFact` / `styles.boardFactText`.
- `styles.postcard` already has `overflow: 'hidden'`, so something above the
  fact box is not height-constrained, or the panel itself is what exceeds 184.
- `PC_H = 184` is the canvas rhythm. `ZONE_BOARD_GAP = 18`.
- **`ZONE_BOARD.minPanelH` DOES NOT EXIST.** Line 188's comment says it "asserts
  the budget on both sides so a board that cannot fit fails a test rather than
  shipping blank". Grep the whole repo: the constant is nowhere. That assertion
  was never written, which is exactly how a board grew past its budget unnoticed.

### How to see it in one look instead of four

**PUT IT ON THE SCREEN.** I read these screenshots wrong twice and the console
answered in one pass. Drop this above `const slices = postcardYs.map(` and read
it out of the Metro log:

```ts
if (pts.length) {
  console.log('[JDIAG]', JSON.stringify({
    headerH, headerClearance, PC_H, STATION_H, SCROLL_CONTENT_TOP,
    rows: pts.slice(0, 5).map((p) => ({ k: p.kind, cy: Math.round(p.y) })),
  }));
}
```

Then add an `onLayout` to the postcard panel and print its REAL height beside
`PC_H`. That number is the whole bug and nobody has it yet.

**A TERMINATE AND RELAUNCH IS REQUIRED for the log to appear.** Fast refresh
alone did not produce it on the second attempt.

---

## 2. WHAT LANDED, AND THE SHAPE THEY ALL SHARED

Six commits. **Five of the six were a helper that already existed not being
used.** If something in this feature looks broken, grep for the helper before
writing one.

- **`b3f9cfe3` He speaks the learner's language.** `HELLO` and `BYE` were single
  hardcoded Hindi strings synthesized into every language's cache slot. Each
  language's lines are now generated once at first use and cached in the same
  `tts_cache` row as the clip, via `tts_cache.spoken_text` (migration
  `0058_sleepy_famine`, one nullable column). **Hindi is authored and is never
  generated:** it is the source the other 21 derive from. Cache key to `v3`,
  which orphans every wrong v2 row. **Callers pass a line key and no text**, so
  the pairing that caused this is now impossible.

  It also fixed **five tests that had been red on `main` since `e9889464`**:
  `GAME_BEATS` ran to eleven learner turns while every constant said ten, and
  four route tests counted the journey's turns with `CALL_BEATS`, which grew
  from six to twelve when the extra questions landed.

- **`bd65a38b` The turn tells the learner what it did, and the game pays XP.**
  **THE CHAI GRANT SAT BELOW `if (stream) return`** and the app always sends
  `X-Audio-Stream`, so **no learner had ever been credited a chai for a call**
  and the "+1" the caption draws could not fire. A turn earns when he HEARD
  them; chai on the journey, XP on the game, never both. The **caption long-poll
  is the only response the phone reads**, so the reward travels on it.

  **The last turn of a journey could never have earned** under that rule: the
  farewell beat is canned and ran no live turn, so nothing transcribed the
  answer it consumes. Canned beats transcribe now.

  **The glow is amber, not the red that was asked for.** Red reads as "wrong"
  and there is no wrong answer in this feature. Both glows are light on a dark
  screen and each arrives with a word and a glyph, so neither rests on hue.

- **`bb7aed07` He could never hear anyone.** iOS records **m4a**; the client
  hardcodes `format: 'wav'`; the call route was **the only audio-in path in the
  server that trusted that label** instead of reading the magic bytes. OpenAI
  got m4a in a file called `audio.wav`, threw, and a bare `.catch(() => "")` ate
  it. `ensureCompatibleFormat` had solved this everywhere else. **This is almost
  certainly why the real path had never completed a turn**: gpt-audio would have
  refused the same bytes, so every reply was the scripted fallback.

- **`77f558f3` The mirror, and the XP meter moves.** "You said" under his line:
  native script, romanization, plain English. **A mirror and never a mark** —
  a test asserts the rendered tree carries no tick, cross, "correct", "wrong" or
  "try again". The XP meter reads a cached `useGetProgressSummary` and nothing
  invalidated it; all thirteen games already do.

- **`4d4a0f2e` The script, and the header clearance.** The mirror came back in
  **Perso-Arabic on a Gujarati call**. `sttLanguage.ts` was written for exactly
  this after Hindi came back as Hungarian, and the call sent a bare
  `{ language: code }`, the shape already known to fail.

- **`4168eb7b` The schwas.** `gharamam` -> `gharmam`. Deletion ran AFTER the
  macrons were stripped, so it could not tell an inherent `a` from a long `ā`;
  `રાજા` would have become `raj`. It decides on IAST now. Deliberately timid:
  never the first syllable, never two in a row, never when the consonants either
  side merge into more than two units, **which is the only reason `નમસ્તે` is
  not `namste`**.

- **`0d5f29d3` Free tastes on stops 2 and 3.** The server already gave both away
  (tracing to every plan since 2026-08-23, the zone 1 book's first scene to
  every plan) and `journey.tsx` already marked journey 1 zone 1 `teaserStation`.
  **One condition, `&& !showroom` in `planZoneRows`, was the whole thing.**
  Stops 2 and 3 needed no arithmetic: `traceStopIndexIn` and `storyStopIndexIn`
  already land there.

---

## 3. TRAPS THIS SESSION PAID FOR

1. **A SCREENSHOT IS A MOMENT, NOT A STATE, AND I READ THREE OF THEM WRONG.**
   I reported a language divergence from a home screen taken 30 minutes earlier;
   `LanguageContext` reconciles once per mount and **the server's saved language
   wins over the local mirror**, so the app had adopted Hindi in between. I then
   built a fix for a bug that did not exist and reverted it. Twice more I read
   "card 1 is missing" off pixels when the console had the answer in one line.
   **When a number moves and your diff is empty, instrument it.**
2. **`git commit -- <paths>` DOES NOT WORK ON UNTRACKED FILES.** `git add` them
   by name first, and options go BEFORE the `--`.
3. **The Repl's `git pull` needs `--no-rebase --no-edit`.** It always diverges
   from GitHub because of Replit's own publish commits, and CLAUDE.md forbids
   rebasing `main`. `--no-edit` keeps it out of vim.
4. **`syncSchema` counts a statement as "applied" whenever it did not raise a
   duplicate-object error, NOT when it changed something.** "35 applied" for a
   one-column migration is 34 idempotent no-ops plus the column. I classified
   all 200 statements to be sure. **Do not read that number as drift.**
5. **A DECOMPOSED GLYPH INSIDE A CHARACTER CLASS LEAKS ITS BASE LETTER.**
   Writing candrabindu as a literal `m̐` in `/[...]/` puts a bare `m` in the
   class, because the glyph is m plus a combining mark. Every `m` after a vowel
   was swallowed. Use explicit codepoints.
6. **Three comments in this repo describe things that are not there.**
   `SCROLL_CONTENT_TOP`'s "measured" header clearance (the measurement existed
   and nothing read it), `ZONE_BOARD.minPanelH` (does not exist), and the call
   route's "he speaks his own Hinglish to every learner". **Verify a comment
   before you rely on it.**

---

## 4. WHAT IS VERIFIED AND WHAT IS NOT

**Verified on the iPhone 17 Pro simulator, against the LIVE published server:**
- A Gujarati call opens in Gujarati and he answers what was said.
- The mirror renders script, romanization and English.
- The amber glow, "Didn't catch that", the "+1 chai" and "+5 XP" pills, the XP
  meter, and his mouth held shut with "Chacha-ji is thinking".
- Locked Gujarati shows stop 2 TRACE and stop 3 STORY unlocked, stop 4 onward
  still locked.

**NOT verified on a device:**
- Everything after `bb7aed07` on the SERVER side. It is not deployed.
- The romanizer's schwa rule against a real learner's speech.
- **Nothing at all in a release build.** Motion is a dev build lying to you,
  haptics do not exist in a simulator, and the camera renders black there.

**Suites at `0d5f29d3`:** mobile **139 suites / 1352 tests**, web **131 files /
1421 tests**, monorepo typechecks. The api suite last ran green in the Repl at
`bd65a38b`: **1418 tests / 1416 pass / 0 fail / 2 skipped**. **Run it again
before cutting**; the pass count is the signal.

---

## 5. STATE OF THE SIMULATOR I LEAVE YOU

- **Metro is running** on 8081 from `artifacts/bolo-mobile`.
- The dev client `org.name.Bolo` is on the iPhone 17 Pro
  (`5D5A361C-597F-4B99-B766-F4948C4BC7F9`), signed in, **switched to Gujarati by
  me** so the free tastes could be seen. It syncs to the owner's phone.
- **Maestro works.** `tapOn: id: "<testID>"` and `point: "x%,y%"` both drive it.
  It needs a JRE and refuses a screenshot path outside its own run folder, so
  shoot with `xcrun simctl io <udid> screenshot`.
- `bolo-mobile://call` is the JOURNEY call, `?mode=game` the games one,
  `?fake=1&phase=connected` the no-network scaffolding, which now cycles chai, a
  miss and XP so all three states can be seen without a server.

---

## 6. PARKED, IN THE ORDER I WOULD TAKE THEM

1. **The DID YOU KNOW overlap.** Section 1. It is the only known defect.
2. **The three build blockers.** Section 0.
3. **The journey interruption has never fired organically.** It IS wired end to
   end (`chachaEncounters.ts` computes `callsNow`, `journey.tsx` pushes
   `/(app)/call` on leaving the stall) — the build 16 handoff was stale saying
   otherwise. It cannot be walked on a LOCKED language, because the stall does
   not open, so test it on Hindi at **station 3**.
4. **`openapi.yaml` owes the call routes.** `callsNow`, `heardRomanized`,
   `heardEnglish` and `xpEarned` are all read off untyped results because
   regenerating the client is lockfile-adjacent inside a held build.
5. **The api-server has still never sent one error to Sentry.** Largest
   invisible risk in the stack, untouched.
6. **Google Play still needs the 512x512 icon uploaded by hand.** I generated it
   and sent it; iOS carries its own in the binary.
