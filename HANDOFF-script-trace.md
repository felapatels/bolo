# Handoff: Script Trace end to end, 2026-08-23 (evening)

## Name this session BOLO BUILD CHAT 4

The user runs several Claude Code tabs at once and needs to tell them apart at a
glance. Their global `CLAUDE.md` requires an H1 app name as the first line of
**every** response. For Bolo that heading is numbered:

```
# BOLO BUILD CHAT 4
```

Chat 1 was the Android sign-out. Chat 2 built the contribution page. Chat 3 was
this one. **You are chat 4.** The next handoff tells its successor it is chat 5.
Increment once per session, never mid-session.

---

Written for the agent picking this up. Everything below was measured against a
live system or read out of source. Where something is unproven it says so, and
where I could not verify something I say that too rather than implying I did.

---

## 1. Orientation

- **Repo:** `/Users/aakeshpatel/bolo`, remote `github.com/felapatels/bolo`, `main`.
- **HEAD and `origin/main` are both `de4c3153`.** Working tree clean.
- **Read `CLAUDE.md` first.** It gained five entries today and they are all
  expensive lessons.
- **iOS 1.0.1 is LIVE.** Android is internal-testing only, last build 426.
- **Web** is `artifacts/gujarati-coach`, served at **bolo-india.app** from Replit.
  Deploy is `git pull --no-rebase origin main` in the Repl Shell, then Republish.
- **The user works locally.** Replit is a deploy target, not a workspace.

---

## 2. THE TWO DATABASES, and what is finally established

Chat 2 established there are two. Chat 3 traced the mechanism.

- The code has **no dev/prod branching at all**. Every consumer reads bare
  `process.env.DATABASE_URL`; `lib/db/src/index.ts` builds the only pool.
- `.replit` is tracked and declares `[userenv.shared]`, `[userenv.development]`
  and `[userenv.production]`. `DATABASE_URL` is in **none** of them: it comes
  from `postgresql-16` in `modules`, injected per environment.
- **THE DEV DATABASE IS UNREACHABLE FROM THE MAC.** Its host is `helium`,
  database `heliumdb`, a Replit-internal name. `psql` fails with "could not
  translate host name". **Production is a public Neon endpoint and connects
  fine.** Two consequences:
  1. **The api-server suite cannot run on the Mac. Repl Shell or nowhere.**
  2. **A UI change needing real data must be checked in the Repl, or by a test
     with mocked data.** The six journey test files do the latter; copy them.
- **`~/bolo/.env.production` holds a READ-ONLY production connection**, created
  today, gitignored by `.gitignore:78`. Use it with
  `PGOPTIONS='-c default_transaction_read_only=on'`. **Never write to it.**
- **Nothing in this repo migrates production.** Boot is bare `node dist/index.mjs`,
  postBuild is a store prune, and the `[postMerge]` hook migrates **dev**.
  What put the 0054 tables into production is **still unknown**.
- **Replit's `Published your App` commits are noise, not divergence.** `git pull`
  in the Shell always makes a merge, so **the Repl's HEAD will never equal the
  sha you pushed**. Check `git merge-base --is-ancestor <sha> HEAD` instead.

---

## 3. What Script Trace is now

**It is on.** `AUTHORED_GLYPHS` used to hold three prototype glyphs and
`traceReadyFor()` was false in all 22 languages. Today:

| Layer | What it is |
|---|---|
| `devanagari-strokes.ts` | 3 prototypes, unchanged |
| `provisional-strokes.ts` | **482 font-derived glyphs, 11 scripts, all `provisional: true`** |
| `contributed-strokes.ts` | **45 real Gujarati letters from Bharti** |

`scripts.ts` spreads them in that order, and **the order IS the policy: a hand
beats a font, and a font beats nothing.**

- `scriptsOnRealData()` returns `["gujarati"]`. Everything else is a guess.
- `unlockOrder()` ranks by **provenance**, not playability. **Devanagari is next
  and buys 8 languages.**
- **Regenerate real data:** `DATABASE_URL="$DATABASE_URL_PROD" pnpm --filter
  @workspace/scripts exec tsx src/buildAuthoredGlyphs.ts --write`
- **Regenerate guesses:** `pnpm --filter @workspace/scripts exec tsx
  src/buildProvisionalGlyphs.ts --write`

**A font gives the shape, not the hand.** Stroke ORDER is the font's cluster
order and reads sensibly; the start point and direction inside a stroke come
from contour winding and are a guess. Devanagari's shirorekha is the plain case:
written last, and the font has no opinion.

---

## 4. The journey map's tracing stop

One tracing stop per fare zone, all 22 languages, both journeys. **Journey 1 is
wired; journey 2's ladder exists and lights up when the page learns to render it.**

**THE RULE FOR `journey.tsx`, and it is the whole design:**

> **`pts` is what the map DRAWS. `stationPts` is what it COUNTS.**

The tracing stop draws a row and advances `layoutY`, and **does NOT advance
`k`**, the global graded-stop ordinal that the serpentine flank, Chacha-ji's
stall and the trackside signals key off. That is the same trick Chacha's halt
already used. Everything that budgets furniture filters `!p.station!.trace`:
`stationPts`, the scenery plan, the zone signpost. Everything that renders reads
`rowStations`.

- A tracing stop is **never locked and never gates**. It is excluded from
  `zoneAllDone`.
- It is **never first**: `traceStopIndexIn(1)` returned 0 and put tracing ahead
  of a new learner's first phrase stop.
- Rows are keyed by **row index**, not group id. Group ids are **not unique**
  across that list and duplicate-key warnings pre-dated this work.

**I NEVER SAW THIS ON SCREEN.** No dev database means no local run. It is proven
by 107 journey tests and nothing else. **Looking at it is the first job.**

---

## 5. Traps, each learned by falling in

- **Do not answer a data question from the dev database.** It is dev.
- **`drizzle-kit migrate` cannot succeed against this database.** Use `sync-schema`.
- **Never stage with exclusion-only pathspecs.** List the files.
- **Bharti's passage "yes" is STALE.** `passage_feedback` row 5 says
  `reads_well = t`, but its stored `passage_text` is the **old little-girl**
  version she then complained about. **Do not mark Gujarati verified on it.**
  Storing `passage_text` beside the answer is what made this catchable.
- **IGNORE "Test Aakesh", anything starting "test", `PROBE_*`, `smoke`.**
  Enforced by `isTestContributor()`; `compareContributions()` drops them by default.
- **`git add` then `git push`.** I committed four times without pushing and the
  user's deploy came up empty. Verify the push, not the commit.
- **`check-trace-sync` is dead.** `scripts/src/checkScriptTraceSync.ts` was
  deleted in `11636c5a`; `scripts/package.json:8` and `.replit:81,86` still
  reference it, so it fails on every Replit validation run. Two lines to delete.

---

## 6. Six pre-existing breaks fixed today, so nobody re-finds them

1. **`dbMock` never learned about migration 0054's three tables**, so
   `api-server` typecheck was red on main all day.
2. **`author-strokes.tsx` used `AppFonts.displayBold` and `bodyMedium`**, names
   this app has never had, so **mobile** typecheck was red too.
3. **`serializeAuthoredGlyph` silently dropped `provisional`**, writing every
   guess out looking exactly like handwriting.
4. **`unlockOrder()` filtered on "not yet playable"** and would have returned an
   empty list, reporting the work finished, the moment guesses shipped.
5. **`VALID_CHAPTERS` held 4 ids of 48.** Twenty of twenty-two languages got a
   400 and could record no tracing progress at all.
6. **`CHAPTER_SIZE = 10`, commented "All current chapters contain exactly 10
   characters".** Exactly 2 of 48 do; they run 5 to 39. A 39-letter chapter paid
   its 30 XP after ten letters and a 5-letter one could never pay.

Also: **`languageCodeFromChapter` cannot work.** A chapter has no single
language, because the Devanagari chapters serve eight. `languageCode` is a required
field on the endpoint now, checked with `languageStudiesChapter()`.

---

## 7. What is outstanding

**Highest value first.**

1. **NOBODY HAS LOOKED AT THE TRACING STOP ON THE MAP.** Deploy, open the
   journey, and check it reads right. 107 tests are not a pair of eyes.
2. **The mobile journey map has no tracing stop.** The ladder, the status
   derivation and the hook are all shared and platform-free; only
   `useTraceStopProgress` is web-flavoured and it is 60 lines.
3. **Mobile records NO tracing progress.** Nothing in `bolo-mobile` calls
   `/games/script-trace/progress`, so a phone traces into the void.
4. **All twelve reading passages are UNVERIFIED**, `verified: false`, and the
   build warns on every run. Only a speaker's say-so flips one. **See the stale
   yes in section 5.**
5. **Formal/informal and gendered variants were never built.** The `register`
   column exists from migration `0021_spec_d2_register.sql` and is **NULL for
   all 10,339 phrases in production**; nothing reads it. **There is no gender
   modelling at all** (the only `gender` in the repo is an ElevenLabs voice
   field). The user asked about this and the recommendation was: **ask speakers
   through the contribution page**, not generate 22 languages of guesses.
6. **Nastaliq and Meetei Mayek alphabets are still incomplete**, deliberately.
7. **Bharti has traced 45 of 47.** ક્ષ and જ્ઞ are outstanding, and thanks to the
   merge fix she can now add them without losing the 45.
8. **Android:** a real chai purchase has never been tested. Needs License
   testing in Play Console first or the tester is charged.
9. **The chai wallet history is 3297px in an 80% modal.** Parked.

---

## 8. Reference

**Verification commands that work:**

```bash
# whole monorepo
npx tsc -b

# web: 104 suites, 1146 tests
cd artifacts/gujarati-coach && npx vitest run

# mobile: 116 suites, 1175 tests
cd artifacts/bolo-mobile && npx jest --forceExit

# api: 1174 tests, 91 suites, 1172 pass, 2 skipped, ~368s
# REPL SHELL ONLY. It cannot run on the Mac.
pnpm --filter @workspace/api-server run test

# read production, read-only
set -a; . ./.env.production; set +a
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL_PROD"

# rebuild the contribution page after editing the template
pnpm --filter @workspace/scripts build-aksharmala

# is the live page current?
curl -s https://bolo-india.app/aksharmala.html | grep -c "ક્ષ"
```

**Deploy, in the Replit Shell, then Republish from the Repl:**

```bash
git pull --no-rebase origin main
git merge-base --is-ancestor de4c3153 HEAD && echo IN || echo MISSING
```

**Expect `IN`. The HEAD hash will NOT match; that is normal, see section 2.**

**Working style, all in `~/.claude/CLAUDE.md`:** verdict first, short bullets,
bold keywords, **no em dashes anywhere**, complete code blocks, a numbered "Your
Plate" of two or three actions with an explicit stop point, one thing at a time.
Say which terminal a command runs in and whether it is destructive. Show
`git status --porcelain` before committing. Paste deploy commands rather than
describing them.
