# BOLO India, handoff

Copy this whole file into a new agent. Read `~/bolo/CLAUDE.md` first; it outranks
anything here.

Last rewritten 2026-09-05, at the close of a very long session. **29 commits**
landed on top of `a95417d8`, all pushed.

---

## STATE OF THE TREE

Clean. `main` == `origin/main` == **`b69e0888`**, and the Repl has pulled it.

---

## THE ONE THING BLOCKING A PUBLISH AND A BUILD

**The api suite's final result.** It was last seen at **1529 pass / 1 fail**, and
that one failure (`games.letter-stop.test.ts`) is FIXED in `2e3b9b4b`; the
confirming re-run is the outstanding step. Web and mobile are already green:

```
mobile  169 suites, 1612 tests, all pass      (was 168 / 1596)
web     152 files,  1659 tests, all pass      (was 150 / 1634)
api     1529 pass / 1 fail BEFORE the fix; needs one clean re-run
```

**THE OWNER HAS ASKED FOR iOS AND ANDROID BUILDS ONCE THAT IS CLEAR.** Do not
start one before it is, and **bump `expo.version` to 1.0.15 first**: 1.0.14 is
spent, and a closed train rejects a binary at UPLOAD, which costs a whole build.
**The new app icon is committed and the next build is the first to carry it.**

---

## WHAT LANDED

**The games free taste, four layers plus the Nest** (`d2b6e974` through
`d807dc58`, `2874f1bf`, `d72fc36c`). Three hub plays of each game that was free,
then All-Access. `@workspace/game-taste` is pure; `lib/gameTasteCounts.ts` is the
one database read; `GET /games/plays` is the gate a learner meets; the two 402s
are backstops. **Six tasted games, not five: `express-listening` is free on WEB
only and was invisible from the mobile hub.**

**Half of layer 2 was found unreachable**, and the five faults are worth knowing
because every one typechecked: a hand-written zod enum still closed at four ids
(so the widened contract answered 400), an `isCorrect` that named three ids
literally (so new ids scored zero), no `MAX_RESULTS` entries, `context` never
written to the row, and a wall that refused the JOURNEY's own runs. All fixed.

**Chacha-ji's call has no tables.** The previous handoff said its plays lived in
"its own call-session tables". `chachaCallSessions.ts` is an in-memory Map with a
4 minute TTL. It is also the one tasted game the server sees BEGIN, so its wall
is at `/start`, which now writes its own `game_sessions` row with zero XP.

**The portability table** (`61e5b3f8`), in `~/bolo-sea/docs/fork-playbook.md` B0
and mirrored at `docs/fork-portability.md`. The playbook wins if they disagree.

**Art and store.** New favicon, Play listing icon, app icon, and **eight new
phone screenshots** shot in the simulator against production. All three icon
surfaces now use the same cap-and-scarf artwork.

**The home screen.** A living boarding pass (a platform film behind the words),
animated steam from the locomotive, the corner ticket restyled to the owner's
RailTicket, the stats strip rebuilt, Bolo's hat unclipped, and the iPad column
layout fixed.

**Password work** (`c49286b2`, `010fa7e6`). The min-length placeholder now
interpolates so a change is loud; the one prop that explains a refusal is
pinned; and the sign-in screen finally says "Forgot your password?".

---

## TRAPS THIS SESSION PAID FOR

1. **METRO SERVES A STALE COPY OF ONE FILE ACROSS A FULL RELAUNCH.** Cost about
   an hour before it was found, then caught three more times in one command.
   Now in CLAUDE.md with the one-line curl that proves it. **Do this BEFORE
   debugging any change that "did nothing".**
2. **`HomeColumns` reads a STRING width off each child.** A number takes the
   "self-positioning" branch, which pushes the child into the band list WITHOUT
   flushing the pending column pair, and everything below it comes out in the
   wrong order. That was the ragged iPad lower half.
3. **An `Image` sized by `absoluteFill` can resolve to its intrinsic pixel size**
   (CLAUDE.md render trap 1). It made a whole animation layer invisible.
4. **White on cream is not a low opacity problem, it is a colour problem.** The
   steam was rendering perfectly and could not be seen, three times.
5. **A screenshot measurement can lock onto the wrong object.** "The stack tip"
   was the ticket stamp's black lettering for three rounds of tuning. Tint the
   thing you are measuring a colour nothing else has, then measure.
6. **`expo prebuild` edits `package.json`.** Revert it; the generated `android/`
   builds fine without it and a manifest change re-resolves the lockfile.
7. **Only JDK 26 was installed and Gradle refuses it.** `openjdk@17` as a
   FORMULA, not a cask, so no password prompt.

---

## OPEN, EACH NEEDING THE OWNER

1. **Android runs but is not attached to a Metro.** The debug APK builds
   (8m12s) and the dev client launches on `bolo_pixel`; it lists the other
   sessions' servers rather than ours. Package is **`com.bolo`**, not
   `com.bolo.mobile`.
2. **India alone enforces zxcvbn.** Production reads `min_length 0`,
   `min_zxcvbn_strength 2`, `enforce_hibp_on_sign_in true`. SEA, Europe and East
   Asia have strength off. Nobody has ruled on either.
3. **No 13-inch iPad screenshots**, and App Store Connect demands them the first
   time an iPad-capable build goes for review.
4. **Mobile still has no shared api-client mock base.** It cost real work three
   times this session; web's equivalent cost zero twice.
5. **The plume is simulator evidence only.** This app has a history of animation
   that runs in a dev build and is dead flat in release.

---

## GATES

**`canClaimGift` MUST NOT BE REMOVED** until builds without the gift box are
gone from the field (iOS 538 / Android 540 are the first that have it). Removing
it silently stops every older build earning its daily Chai.

**The Play listing icon is a manual upload.** It never rides a build.

---

## HOUSE RULES THAT BIT

- Typecheck while developing; **full suites once, before a build**. Running them
  tonight caught seven broken files that every targeted run had missed.
- **Never rewrite `main`.** Fix forward.
- **No attribution trailers.** The repo is public.
- **`git commit -F <file> -- <paths>`**: options BEFORE the `--`, and an
  untracked path must be `git add`ed first.
- **A regex across 76 test files is not a fix.** Patch the ones that fail.
