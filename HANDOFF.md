# BOLO India, handoff

Copy this whole file into a new agent. Read `~/bolo/CLAUDE.md` first; it outranks
anything here.

---

## STATE OF THE TREE, exactly

Clean. `main` is **6 commits AHEAD of `origin/main`, unpushed**, newest first:

```
d72fc36c  nest: the free taste on the Dashboard, and a correction about visitors
61e5b3f8  docs: one table for what travels between the five forks
d6f55092  web: the favicon is the South Asia artwork
2874f1bf  web: the same card, the same count, the same wording
d807dc58  mobile: the hub says how many plays are left, and shuts the card at zero
c393e969  server: the free taste, three hub plays and then the wall
d2b6e974  lib: the sixth free game, and the runs the taste is not allowed to see
```

(`a95417d8` and everything below it is already on `origin/main`.)

---

## TASK 1 (DONE, all four layers): the games paywall

**The owner's ruling, 2026-09-04:** *"The ones we have Free right now should be
Free Taste (3 plays) then paywalled. Keep the All-Access ones the way they are."*

Layer 1 lib, layer 2 server, layer 3 mobile, layer 4 web, one commit each, plus
the Nest. **Nothing is verified against the dev database yet: see GATES.**

### What the half-finished layer 2 actually had wrong

It typechecked clean and it was unreachable. Five faults, found by reading
`~/bolo-east`'s `fb3e2f40`, which built the same ruling hours earlier:

1. **`GameSessionBody`'s zod enum was still the old four ids.** `openapi.yaml`
   and both generated copies were widened; the route parses with its OWN
   hand-written schema, so every new id answered **400** and the taste backstop
   under it was dead code. `GAME_IDS` in `learning.ts` is now the one list and
   **must be kept in step with the spec by hand**.
2. **`isCorrect` named three ids literally**, so a new id fell through to
   `false`: a perfect round would have recorded nought out of ten, failed
   `gameSessionPassed`, and taken the signal and closeout Chai with it. Now
   `SELECTION_GAMES`, derived from the list.
3. **No `MAX_RESULTS` entries** for the new ids.
4. **`game_sessions.context` was never written** by this route, so every row
   ever recorded holds null and a hub play cannot be told from the journey's.
5. **The wall counted and refused EVERY run**, including signal and closeout.
   That would have stranded a crossing mid-line on the free tier the map exists
   to serve.

### And one game was missing

`TASTE_GAME_IDS` was five, written off the MOBILE hub. **`express-listening` is
free on the WEB hub and has no phone card at all**, so it was invisible from
there and would have been the only free game left unwalled. Six now.

### The shape, as shipped

- **`@workspace/game-taste`** is pure: `GAME_TASTE_PLAYS = 3`, `gameTasteState`,
  `gameTasteLabel`, `TASTE_GAME_IDS` (6), `isTasteGame`, `isHubPlay`.
- **`artifacts/api-server/src/lib/gameTasteCounts.ts`** is the one DB read, and
  three callers share it. Hub plays only.
- **`POST /game-sessions`** refuses a spent taste with 402 and the
  `UpgradeRequired` envelope. Reason stays `feature_locked`, deliberately: both
  clients read only the structural `upgradeRequired` flag, and a new vocabulary
  word is a bill this repo has paid before.
- **`POST /openai/chacha-call/start`** is the call's half. **The handoff used to
  say chacha-call's plays lived in "its own call-session tables". THERE ARE NO
  TABLES**: `chachaCallSessions.ts` is an in-memory `Map` with a 4 minute TTL
  that deletes a call on hangup. It is also the one tasted game the server sees
  BEGIN, so its wall is at `/start`, and `/start` now writes a `game_sessions`
  row (game `chacha-call`, context `hub`, **zero XP**, because the turns pay per
  turn) which is what the single count reads. `mode=game` only; the journey's
  interruption is never counted and never refused.
- **`GET /games/plays`** is the gate a learner actually meets: zero-filled, so an
  absent key can never read as undefined, then falsy, then locked.
- **Both hubs** draw `gameTasteLabel` on the access pill (green either way, the
  state is in the WORDS, never the hue) and lock the card at zero. **They fail
  OPEN while the count is loading**, the opposite of the Plus gate beside them,
  because the server refuses past three regardless.
- **Both shells** invalidate the plays query after a hub run only.
- **The Nest** has a "Free taste used up" tile with a `tasteSpent` drill.

**Tests written: `games.taste.test.ts` (new, needs the dev DB), two cases in
`chachaCall.test.ts`, five on the mobile hub, six on the web hub. Six pins
INVERTED with dated comments, never deleted.**

---

## TASK 2 (DONE): the portability map

One table, not a new document.

- Canonical: **`~/bolo-sea/docs/fork-playbook.md` section B0**, committed there
  as `999a93f4`.
- Mirror here: **`docs/fork-portability.md`**, whose first line says the playbook
  wins if they ever disagree.

The row that matters most: **a FINDING travels even where code cannot.** Reading
`bolo-east`'s commit found all five faults above in minutes. **The forks are each
other's review and it costs one read.** A shared component library was argued and
rejected; the reasoning is in the table.

---

## GATES. Read before shipping anything.

**1. `canClaimGift` MUST NOT BE REMOVED.** `fec82be8` deleted the silent
daily-Chai grant; `00370956` added the `canClaimGift` capability flag to
`AttemptInput` so **old builds keep being paid on their first attempt**. Remove
it and every learner on an older build silently stops earning their daily Chai.
Its removal condition is written in three places: the openapi field, the branch
in `learning.ts`, and the three client call sites. Not until builds without the
gift box are gone (iOS 538 / Android 540 are the first that have it).

**2. THE API SUITE HAS NOT RUN. This is the biggest open risk in the tree.**
`games.taste.test.ts` is brand new and `chachaCall.test.ts` gained two cases;
the api suite cannot run on a Mac. **Repl Shell, before any publish.** Baseline
to beat: 1485 tests / 115 suites / **1483 pass**. The pass count is the signal.
`chachaCall.test.ts` is database-free and WAS run alone (51 pass) to confirm its
inversion; nothing else on the server side has executed.

**3. Web and mobile full suites have not run either.** Only the touched files
did: mobile `quick-game-shell` + `games-hub-gate` + `games-hub-vignettes` (83
pass), web `games-hub` + `quick-games` + `journey-two` + `game-taste` +
`quick-game-frame` (190 pass).

**4. THE FREE TASTE DOES NOT BITE UNTIL THE CLIENTS SHIP.** No historical row
carries a tasted game's id, because every quick game recorded as
`listen-and-pick` or `word-match`. Everybody starts at zero; nobody is
retroactively locked out. That was explicit and accepted.

**5. iOS 538 and Android 540 (1.0.14) are submitted and do NOT contain any of
this**, nor the app icon from `064d95a9`.

**6. The Play Store listing icon is a manual upload.** It never rides a build.

---

## OPEN, and each needs the owner

1. **THE FAVICON AND THE APP ICON ARE DIFFERENT PICTURES.** `d6f55092` cut the
   web favicon from `BOLO-SA.png` (the NewBOLO_Favicons zip, cap and scarf,
   cooler). `064d95a9` cut the mobile app icon from
   `~/Downloads/BOLO-SA-Faviconv2.png` (no cap, waistcoat, Red Fort, warmer).
   Same idea, two renders. **Whichever is the keeper, the other surface needs
   redoing before the next build.** Also: at 16 and 32 pixels the wordmark is a
   smudge; cutting those two sizes from a crop of the bird alone is the fix if
   it is wanted.
2. **DAILY VISITORS.** Website: **yes, buildable today.** `$pageview` is unseen
   (autocapture and capture_pageview are off on purpose) but `homepage_view`
   fires on the landing page's mount and ran 2 to 139 a day over the last 30
   (12 on 09-04, 52 on 09-01). Only a PostHog read key is missing. **iOS and
   Android listing views: NOT reachable**, and not a query. Apple's are in App
   Store Connect Analytics behind an issuer id, a key id and a .p8; Google's are
   not in the Play Developer API at all, they are CSVs in a Cloud Storage bucket
   behind a service account.
3. **The four other favicons in the zip** (SEA, EU, EA, AF) belong to the sister
   repos and nothing has been done with them here.
4. **Mobile still has no shared api-client mock base.** The handoff's 96-line
   warning did NOT apply this time: only three suites render the games hub or
   the shell. Build the twin of web's `src/test/api-client-mock.ts` on the next
   change that touches a screen everything mounts.

---

## HOUSE RULES THAT BIT THIS SESSION

- **Typecheck while developing. Suites only before a build or a publish.** The
  one exception is a test you just INVERTED, run alone, said out loud.
- **Never rewrite `main`.** Fix forward. `d2b6e974` is a fix-forward on two
  already-pushed lib commits and that is the correct pattern.
- **No attribution trailers in commit messages.** The repo is public.
- **Commit messages via `git commit -F <file> -- <paths>`.** Options go BEFORE
  the `--`, and an UNTRACKED path cannot be a pathspec: `git add` it by name
  first.
- **`timeout` does not exist on macOS.** Use node's `--test-timeout`.
- **Adding a mobile route breaks typecheck** until `.expo/types/router.d.ts` is
  regenerated, and that file is gitignored. From `artifacts/bolo-mobile`:
  `EXPO_ROUTER_APP_ROOT="$PWD/app" node -e "require('expo-router/build/typed-routes').regenerateDeclarations('.expo/types')"`.
  The env var must be set **before** the require.

---

## BASELINES (measured 2026-09-04, recorded in CLAUDE.md)

```
api      1485 tests, 115 suites, 1483 pass, 0 fail, 2 skipped, ~422s   Repl Shell only
web      150 files, 1634 tests, all pass
mobile   168 suites, 1596 tests, all pass
```

CI runs typecheck, web, mobile and the api's 63 database-free files on every push.
