# Handoff: build 18

Written 2026-08-29 by BOLO BUILD CHAT 17. **Read `CLAUDE.md` first, then this.**

`origin/main` is `9187f28b` plus this handoff, tree clean, nothing unpushed.

---

## 0. WHERE THE BUILD ACTUALLY IS

**THREE PAIRS OF STORE BUILDS WENT OUT TONIGHT. ONLY THE LAST IS THE ONE.**

| build | commit | what | status |
|---|---|---|---|
| 1.0.5 (520 / 521) | `ca16a295` | camera in the call, unswitchable | internal only, **NEVER submit for review** |
| 1.0.5 (521 / 522) | `042f1fe3` | camera behind the server flag | superseded |
| **1.0.5 (522 / 523)** | `12dd7d08` | + home and journey to the owner's hybrid mockups | **the candidate**; cut 01:40, check the watcher |

**When 522/523 land:** `checkBundleHealth.ts` (it lives at
`artifacts/bolo-mobile/scripts/`, not `scripts/`) on both, then `eas submit`
both; the two earlier pairs were done exactly that way and the commands are in
the chat. iOS 45,539 functions is the healthy shape; Android came out at
45,522 twice and is the same compile.

**NOT VERIFIED ON A DEVICE, ANY OF IT.** The owner visually confirmed the home
and the journey on the SIMULATOR through Metro, screen by screen, tonight.
Nothing in a release build has been seen: motion, the ringtone, haptics, the
chai grant on a live call, the opening shot's hop chain, Chalkduster.

**THE SERVER IS ONE COMMIT BEHIND.** The owner republished after `042f1fe3`
(self-view flag); `99bb369e` then added `encounterChai` to the zone signals
payload (`routes/learning.ts`). Until that is pulled, api-suite-run and
published, the phone's "Take a break and earn N Chai" chip falls back to 3,
which IS `TOKEN_EARN_CHACHA_ENCOUNTER` today. The api suite has not run on
the Repl since `800eb602`.

**The Google Play 512x512 icon is still a by-hand upload in the console.**

---

## 1. THE OWNER'S TWO MOCKUPS, AND WHAT THEY BECAME

Both landed in the second half of the night, on the sim, with the owner
watching every shot and steering. The pattern was: ship the mockup's shape,
screenshot, adjust to the one-line correction, repeat. Fourteen corrections in
a row. Read the commit messages from `844ab7d5` to `4315b4a9`; each quotes the
owner's words.

**HOME (`844ab7d5`).** A gold-lined "Your Journey" frame with a pediment crown
around the boarding pass; the pass takes the app's violet for its eyebrow,
station dots and Resume; the stub narrowed 176 to 148 so the ticket keeps its
words at the frame's width; the stall's copy moved left with the balance in
gold. `JourneyPassCard` measures its width on the WRAP now, not the press.

**JOURNEY (`17a2656a` to `4315b4a9`).**
- `STATION_H` 88 to 176: every zone doubles, every bend halves.
- The rail: two violet 2.5pt rails; the owner's lime `#84CC16` between them
  behind, an SVG mask cutting the centre out ahead so the sleepers show.
- Numbered parchment badges with a gold ring and a green check when done.
- The zone board: `CarvedBoard` gains `bare`, the parchment panel is gone,
  one cream card under the pediment with a violet-to-pink edge, the line as a
  pill, the city at 22pt, a gold dashed rule, the fact boxed behind a spark.
  `PC_H` 256, `ZONE_BOARD_MIN_PANEL_H` 180, both from an onLayout.
- The tracing stop is a 150x150 chalkboard in Chalkduster (Android: the
  casual hand); the story stop wears `emblem-story.png`, the 3D book.
- `StopDots` is the one dotted row, on the pass, every phrase card, the
  chalkboard. The mastered bar is gone.
- The opening shot hops one row every 520ms, at most ten hops; a touch still
  lands it because the target lives until the last hop.
- **The board FLOATS. No painting behind it.** A still crop of the zone art
  was painted behind the pinned board for an hour (`d6a41e34`, `411da6de`)
  and the owner rejected it outright; the fade under the clock is all that
  remains. A card passing under the pinned board shows at its edges. That is
  the pin, and the owner has seen it.
- The first zone's band reaches up by the inset alone, so the first tile's
  top row is the top of the screen ("first image should start at the top").
- Every lock is `colors.primary`.

**The bottom sheet from the journey mockup was NOT built**, on the owner's
word: "B, I don't think we need that."

**Web got none of this.** The home and the map are separate surfaces there;
the showroom-rows port (below) is still the only web debt named.

---

## 2. WHAT ELSE LANDED TONIGHT (first half; the messages carry the detail)

- The pinned board, the intro lead and the fact box: three bugs the build 17
  handoff had folded into one wrong one (`19acf416`).
- Free taste chips on stops 2 and 3 of a showroom (`01d82d18`).
- The ringtone (`1fb55a8e`), unheard by anyone.
- Romanizer card style, `ch`/`chh`/`sh` (`cc94948b`).
- The self-view server flag, default off (`042f1fe3`); the camera permission
  string in `app.json` is still the profile-picture one and must be fixed
  before that flag is ever turned on.
- `.easignore` overwritten and restored (`230991d8`, `cc2df3e1`). It lives at
  the git root. The upload is still 209 MB.

---

## 3. TRAPS THIS SESSION PAID FOR

1. **LOOK AT THE TARGET BEFORE `cat >`.** The `.easignore`.
2. **A JSX comment inside `{cond && (` is a syntax error.** Put it above.
3. **Every test that renders the map mocks `react-native-svg` and
   `@expo/vector-icons` by hand**, so a new primitive (`Mask`, a second icon
   family) fails ten suites with "Element type is invalid" until every mock
   lists it. There are ten such mocks; a shared mock file would end that.
4. **BSD `sed` has no `\b`, and a perl rename hits module paths.** Use node
   for exact string edits; `replace.mjs` in the scratchpad did all of tonight.
5. **`SlidingCardSlot` faded every card to 40% until it had scrolled 240pt
   past 0.82 of the viewport**, which with a doubled pitch made a slate read as
   glass. Floor 0.75 now, home at the bottom edge.
6. **The chai chip's first number came from the wrong helper**: `rewardChai`
   is the signal games' reward. The owner caught it ("I thought chachaji's
   stop awarded 3 chai?"). Grep for the constant on the server before
   trusting a field's name.

---

## 4. PARKED, IN THE ORDER I WOULD TAKE THEM

1. **Health-check and submit 522/523**, then ten cold starts on a phone.
2. **Repl: pull, api suite, republish** for `encounterChai`. The api suite
   will show the one route test I added on `chachaCall.test.ts` (selfView) and
   `learning.ts`'s new field.
3. **The camera permission string**, before the flag ever flips.
4. **Web showroom rows**: port `planZoneRows` so stops 2 and 3 exist there.
5. **`openapi.yaml` owes**: `callsNow`, `heardRomanized`, `heardEnglish`,
   `xpEarned`, `selfView`, `encounterChai`.
6. **A shared react-native-svg / vector-icons jest mock** (trap 3).
7. **The exhausted card** offsets every pinned board by its height for an
   exhausted teaser learner. Same class as the pin bug; unfixed.
8. **`ZoneBandFixed`'s `cap` mode has no caller.** Dead code.
9. **The api-server has never sent one error to Sentry.**
10. **The Play icon.**
11. **A one-pager map view of the whole journey**, the owner's idea for where
    home's View Map pill should eventually go ("later we can create a
    onepager map view that shows the full journey"). Today the pill and the
    boarding pass both open the same journey screen; the owner kept the pill
    for that future.
