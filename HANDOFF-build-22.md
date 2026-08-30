# Handoff: BOLO Build 22

Written 2026-08-29 (evening) by BOLO Build 21. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 22. Use that exact name as your H1 on every message.**

---

## 0. THE STATE, HONESTLY

- `origin/main` is `c98d1386`. **Five commits are ahead of it, UNPUSHED** (the
  owner never said PUSH; ask with one YES/NO line, then push):
  `60642a0c` home pass scaling + View Map pulse, `952ae898` journey crawl,
  `00d44c95` server flashback door fix, `ac9e228e` chai chip, `818ac28d`
  home-to-journey crossfade.
- **The tree is DIRTY with a whole evening of approved-but-uncommitted work**
  (about 30 files, several binary). Typecheck is clean on mobile, web and api.
  First job after reading: `git status --porcelain`, then ask the owner for
  COMMIT, then commit by listed files, `-m` before the pathspec. What is in it:
  1. **The parchment boarding pass** (mobile): `components/journey/ParchmentPass.tsx`
     (deckled torn outline, mottle, freckles, stains, fibres, brass nameplate,
     no dark rim), `components/journey/Landmark.tsx` (city landmark silhouettes:
     the six Ganga Line cities drawn, `domes` fallback for the rest),
     `JourneyPassCard.tsx` rewired off CarvedBoard, art nudge retired, filled
     Resume pill, kulhad by the tail, engine closes the stops row, `HOME_PANEL_H` 222.
     Owner approved it ("boarding pass is good"), then asked it be centred (done).
  2. **The painted train is canonical** (both platforms): `TrainEngine.tsx`
     (mobile) and `train-svg.tsx` (web) draw `assets/journey/train-loco.png` /
     `public/journey/train-loco.png`; `train-full.png` beside them. The plate
     was blanked (it was painted Devanagari). `__tests__/train-engine.test.tsx`
     inverted for the raster. `tint` and `palette` props are accepted no-ops.
  3. **The Games hub rebuilt to the owner's mockup** (mobile):
     `app/(app)/(tabs)/games/index.tsx` (hero under the status bar with the XP
     and Chai strip floating over it, ivory cards with 4:3 paintings, medallion
     over the picture's foot, badge on the picture, "Continue playing" from the
     device's last-played id), `games/_layout.tsx` (strip in flow on game
     screens, overlay with a cream veil on the hub, via `useSegments`),
     `lib/gameArt.ts`, `lib/lastPlayedGame.ts`, `assets/games/*.png` (ten real
     paintings, four placeholders, the hero), `public/games/*` (web copies),
     `scripts/import-game-art.py`. The language line in the hero is the
     language switch (the globe went). `chacha-call` got a hue.
  4. `app.json` carries the autoIncrement write-back (523 to 524, 524 to 525)
     from the CANCELLED Android build (section 6). Keep it; it rides the real build.

## 1. THE IMAGE LOOP YOU INHERIT (the owner is mid-way through it)

The owner generates pictures from the brief and **drops them in `~/Downloads`
under the generator's own names** ("word match.jpeg",
"Hand_holding_ticket_punch_over_…jpeg"). You identify each (look at it, check
the no-text rule and the subject), copy it to
`~/Downloads/bolo-games/games/<id>.jpeg`, and run
`python3 artifacts/bolo-mobile/scripts/import-game-art.py` from the repo root,
which resamples it over the placeholder in both apps. **Check the newest file
is the one you think it is**: build 21 once filed the tiles picture as Signal
Lights because "newest" had moved.

**Still placeholders:** `storybook`, `emergency` (the brief calls it Beat the
Train), `listen-and-pick`, `wrong-platform`, `wrong-platform-2`, and
`home/parchment.png`. The brief (prompts, sizes, references, the no-text law):
https://claude.ai/code/artifact/91383345-8292-4e3b-90cf-e3320748c86f

**When `home/parchment.png` lands:** the import script writes
`assets/journey/parchment.png` (transparent, 4:3). Wire it into
`ParchmentPass.tsx` as an `Image` under the words in place of the drawn sheet,
keep the drawn sheet as the fallback, and show the owner.

**Game ids vs brief names:** `chacha-ji-calls` is `chacha-call`, `beat-the-train`
is `emergency` (the script knows both).

## 2. RULES THE OWNER SET THIS EVENING (each cost something)

- **NEVER `eas build` unless the owner's MOST RECENT message says go.** Build 21
  started an Android build from a rejected command (the upload had begun
  before the rejection landed); it was cancelled (`4227ac6a`). "Cut the
  builds" earlier in a session does not carry across later corrections.
- **Typecheck only while iterating.** No mobile or web suites per change; all
  suites once at the end, before the build. Pins are still written as you go.
- **ONE STEP AT A TIME.** "Your plate" names exactly one action.
- **Show on the simulator as you work.** `xcrun simctl terminate` + `launch`
  before believing an edit did nothing: Fast Refresh keeps `useMemo` values
  and mounted screens run old code. The simulator is SHARED (another session
  drove a Chacha-ji call mid-evening); say before you drive it.
- **Gold/brown is the world, purple is "touch me", green is "done"** (the
  owner's colour law for the journey redesign, section 4).

## 3. VERIFICATION OWED BEFORE THE BUILD (in this order, when the owner says)

1. Mobile: `pnpm --filter @workspace/bolo-mobile exec jest --forceExit` (the
   full suite; `run test -- --forceExit` runs nothing). Expect churn in
   `games-hub-gate`, `games-hub-vignettes` (the hub changed shape; the text
   pins should hold, testIDs kept), `journey-pass-motion`, `ticket-sizing`,
   `chai-stall` (census counts 15), `train-engine`. Invert with reasons.
2. Web: `pnpm --filter @workspace/gujarati-coach run test`. Baseline was 137
   files / 1475 before build 21; build 21 added pins (hook, scale, station fit,
   pulse, arrival film).
3. Api, **Repl Shell only**: `pnpm --filter @workspace/api-server run test`.
   The gating suite has a new pin (free flashback never lists a Plus phrase).
4. Then, and only on the owner's go: EAS from `artifacts/bolo-mobile`,
   production profile, both platforms, `scripts/checkBundleHealth.ts` on the
   ipa, STOP before any submit. Meta SDK stays out.

**The server flashback fix is NOT live** until the Repl pulls, runs the api
suite, and the owner publishes. Free accounts still get "Oops, that didn't
work" on the flashback in production until then.

## 4. THE QUEUE, IN THE OWNER'S ORDER

1. Finish the image loop (section 1), then show the whole hub.
2. **Web parity** for what mobile got tonight: the parchment pass with the
   landmark, the hub with pictures and the hero, the painted train is already
   on web. Say why not where not.
3. **Flashback lightbox** on the journey page, both platforms: before the
   lesson opens, a lightbox with Enter and Skip, copy "Repetition is the key to
   success". Today mobile `router.replace`s straight into `review?flashback=1`.
4. **The journey redesign brief** (memory `bolo-journey-redesign-brief-2026-08-29`):
   ten points plus the glow on the active stop and big pictures on every card.
   Web's journey is the twin.
5. Web corrections still owed off the owner's screenshots: the mascot cut off
   at the top of the web home; the boarding pass on web drops into the lesson
   instead of the journey map (mobile fixed it earlier); the serpentine should
   use the width on large screens; the web journey's green top header should
   go, floating back arrow like mobile.
6. **XP**: the owner asked what XP does ("is it just for bragging? can we
   implement an XP cash in for Chai? or maybe some other idea, i don't want to
   devalue the chai"). Today XP feeds the daily train-class meter, the
   leaderboard and badges; it has no sink. Answer as an A/B with a
   recommendation that does not turn XP into a Chai printing press (a
   milestone one-off, a cosmetic unlock, a First Class day) before building.
7. The two rulings from build 20 (streak push overlap; Sentry pino hooks fix),
   the poster repaints, the Play Store track: `HANDOFF-build-21.md` sections 3 and 5.

## 5. TRAPS BUILD 21 PAID FOR

1. **`useElementWidth` measured once in `useEffect([])` while Home showed its
   skeleton**, so the ticket build 18 taught to scale sat at scale 1 in
   production. Callback ref now (`useElementSize`). Web's journey
   `useMapWidth` has the same shape; not touched.
2. **RN `Animated.loop` on the JS driver is real under jest** and hung a home
   suite by ticking outside act. Every idle loop is reanimated through
   `useLoopProgress`, inert under the jest mock. Use that.
3. **The journey crawl, measured four ways on the simulator at 60fps:** the
   shipped hop chain has 150ms dead stops; reanimated `scrollTo` per frame is
   continuous but lands about 12 updates a second there; native steps every
   140 or 50ms throb; an animated `contentOffset` prop does not move the map
   at all. Shipped: reanimated per frame plus a JS landing. The recorder
   cannot grade a native fling, so fine cadence is a TestFlight question.
4. **RNTL hides accessibility-hidden elements from queries**; halo and splash
   queries need `includeHiddenElements: true`.
5. **The Metro log is in another session's scratchpad**
   (`/private/tmp/claude-501/-Users-aakeshpatel/d08061ae-…/scratchpad/metro.log`)
   and the review screen now `console.warn`s the real scoring status, which
   is how the 402 was found.
6. **Local web dev**: vite on 5173 with a `pk_test` key, proxied to a stub on
   3001 (`stub.mjs` in that same scratchpad) that fakes the six lesson-group
   routes and proxies the rest to production. That is "dev" to the owner.
7. **The painted parrot in the hero made two birds** with the app's Mascot
   overlay; the overlay went. The turbaned parrot in the app is the owner's
   own outfit on the canonical bird, not a second character.
