# Handoff: 2026-08-25

## Name this session BOLO BUILD CHAT 8

Chat 1 was the Android sign-out. 2 built the contribution page. 3 extracted
`lib/script-trace`. 4 was Script Trace and the story engine. 5 was the six
books. 6 shipped the storybook, the Emergency and the Nest. **7 was this: ten
device bugs, How to Play, Wrong Platform split in two, and the global feed
with a username.** You are 8. Increment once, at the start, never mid-session.

**Read `CLAUDE.md` first, then this.** Everything below was measured or read
out of source. Where something is unproven it says so.

---

## 1. Where things stand

- **Repo `/Users/aakeshpatel/bolo`, `main`, HEAD `f4b58fe9`, tree clean, pushed.**
- **iOS 1.0.2 (509) is on TestFlight. Android 1.0.2 (508) is on the Play
  internal track.** Both built from `fae2f6d5`, so they carry the home
  username prompt but **not** the eight commits after it.
- **THE DEPLOYMENT IS BEHIND.** The last republish was around `f469c920`.
  Everything since is in the repo and not running: the feed projection, the
  pseudonyms, the Nest's live tiles, the Nest link fix, and the paywall
  closure. **A republish is the first thing on the list.**
- **Production is migrated to 0055** (username, share_stats, username_reports),
  applied by hand. Verified by content.
- The api suite last ran at `3e2a1336`'s parent: **1204 tests, 1201 pass**. The
  one failure was a poisoned fixture, fixed in `0d058a1d`. **Nothing since has
  been run against the dev database.**

---

## 2. What shipped in chat 7

**Ten device bugs**, all three platforms: the zone-gate leak, the FREE TASTE
chip on Hindi's included zones, "undefined phrases", the stop count, Chacha-ji's
stall clearance, the ticket stub, test-out difficulty, the third leaderboard,
the empty feed's dead end, and the bazaar's text error.

**How to Play** on every quick game, at launch and behind a `?`, pausing the
clock.

**Wrong Platform split into two tiles**, free and All-Access, played by
dragging Chacha-ji.

**The global feed**: schema, API, spec, both clients, a username with a
profanity screen, a report path, and pseudonyms for un-named learners.

**The Nest** gained live tiles and lost its dead buttons.

---

## 3. THE TRAPS, each one cost real time

**PRODUCTION HAS NO DRIZZLE MIGRATIONS LEDGER.** `drizzle.__drizzle_migrations`
does not exist there. **Never run `drizzle-kit migrate` against production**: it
would replay all 56 migrations against a database that already has almost
everything and fail partway. Apply the one new migration's SQL by hand,
idempotent and inside a transaction. This is the answer to the open question
`CLAUDE.md` has been carrying since 2026-08-23.

**THERE ARE TWO CLERK INSTANCES, exactly like the two databases.** An hour went
into "why does Clerk show 2 users when production has 22". The dashboard was on
the wrong application. Check the instance switcher before drawing any
conclusion about real users.

**A MANIFEST CHANGE WITHOUT A LOCKFILE UPDATE BREAKS EVERYTHING FROZEN.**
`expo-dev-client` was added to `bolo-mobile/package.json` and never locked, so
`pnpm install --frozen-lockfile` failed in the Repl's post-merge hook AND would
have failed on EAS. Fix with `pnpm install --lockfile-only` and review the diff.

**iOS BUILDS NEED THE App ID CAPABILITY, AND EAS WILL NOT ADD IT SILENTLY.**
`associatedDomains` landed in `76f14819` and the next two builds died at
fastlane: the provisioning profile predated it. `eas build --non-interactive`
never authenticates to Apple, so it skips the capability sync and builds with
the stale profile. The fix is `eas credentials` → production → Provisioning
Profile, signed in to Apple. **Take the Provisioning Profile branch, never
"All": that also re-does the distribution certificate.**

**SERIALIZE THE TWO BUILDS.** Both rewrite `app.json` to auto-increment. Two at
once can clobber one another, which is how rule 7's duplicate `1.0.0 (61)`
happened. Start iOS, wait for `Bumping expo.ios.buildNumber`, then start
Android.

**HEALTH-CHECK EVERY .ipa BEFORE SUBMITTING.**
`node --experimental-strip-types scripts/checkBundleHealth.ts <url>` from
`artifacts/bolo-mobile`. Healthy is ~44,900 functions; poisoned is ~52,900. Both
builds this session came back healthy. A download can fail with an HTTP/2
framing error; retry rather than concluding anything.

**A FIXTURE THAT SEEDS OUTSIDE ITS try/finally POISONS THE NEXT RUN.** The
over-cap zone test left `__test_cat_zone_big` behind after a crash, and the next
run's failure named the wrong test entirely. It purges by slug first now. Watch
for the same shape elsewhere.

**THE api SUITE'S OUTPUT WILL BE LOST unless you write it into the workspace.**
`/tmp` does not survive a container restart, and the Repl file tool cannot read
gitignored paths. Write to `tmp/api.log` inside the workspace (already
gitignored at `.gitignore:5`) and a small `tmp/api-summary.log` beside it.

**THERE IS NO VISITOR METRIC AND THERE CANNOT BE ONE YET.** PostHog reports
`$pageview` and `$screen` **both unseen in the last 30 days**. The app captures
named product events and no pageviews at all. Counting visitors is a capture
change in the clients first, not a query, and reading it back also needs a
PostHog personal API key that is not in the environment.

---

## 4. Open, highest value first

1. **REPUBLISH.** Nine commits are sitting in the repo and not running,
   including the paywall closure (925 rows across 22 languages flip to paid at
   boot) and the feed projection. Nothing below matters until this is done.
2. **Re-run the api suite.** Nothing since `0d058a1d` has touched the dev
   database. The feed projection is a new raw SQL union and the policy has a
   fourth invariant; both are typecheck-clean and nothing more.
3. **A BLOCK CONTROL, before the next STORE submission.** App Store guideline
   1.2 wants filtering, reporting **and blocking** on user-generated content.
   The profanity screen and the report path shipped; block did not. Bolo is
   **not** in the Kids Category (confirmed by the owner), so a public feed is
   allowed, but this control is the gap a reviewer looks for. TestFlight is not
   review, so it does not block testing.
4. **The home widget should flash with the latest moment.** Asked for and not
   built.
5. **The Nest wants free/paid account counts and a date-range activity view.**
   Free and paid are in the summary query already; the range view is new. Note
   that **logins are not recorded anywhere** — Clerk owns sessions and nothing
   server-side writes a login row. Daily active from `attempts` is the honest
   substitute, or add a `last_seen_at` stamp and start collecting.
6. **iOS and Android need a build to carry anything from item 1 onwards**, and
   Android link verification has never been tested on a Play-distributed build.
7. **`apple-app-site-association` is served as `text/plain`**, not
   `application/json`. Apple documents the latter. `vite preview` types by
   extension and the file deliberately has none.
8. **`tts_cache` is 98% of a 10 GiB database**, growing about 1 GB a month, and
   `purge-stale-tts-cache` appears never to have run.
9. **The production user purge**, still fully scoped and untouched. Export the
   42 phrase reports first.

---

## 5. Commands, by terminal

**Deploy web, in the BOLO Replit Shell**, then hit Republish:

```bash
cd /home/runner/workspace && ls artifacts/gujarati-coach/package.json && GIT_EDITOR=true git pull --no-rebase origin main && pnpm install --frozen-lockfile && git merge-base --is-ancestor f4b58fe9 HEAD && echo "OK f4b58fe9 IS IN"
```

The `ls` is the Repl check. **Never substitute the remote for it**, and never
ask for `git remote -v`: that leaked a live PAT once.

**The api suite, same Shell**, ~6 minutes, output that survives:

```bash
cd /home/runner/workspace && mkdir -p tmp && pnpm --filter @workspace/db run sync-schema && cd artifacts/api-server && node --import tsx --test --test-reporter=tap --test-concurrency=1 --experimental-test-module-mocks "src/**/*.test.ts" > /home/runner/workspace/tmp/api.log 2>&1; cd /home/runner/workspace && { echo "exit=$?"; grep -E "^not ok" tmp/api.log | head -60; grep -E "^# (tests|pass|fail|skipped)" tmp/api.log; } > tmp/api-summary.log 2>&1; cat tmp/api-summary.log
```

**Client suites, Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

Baselines at `f4b58fe9`: **web 114 suites / 1318 tests**, **mobile 117 / 1194**.

**Read production, read-only, Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && set -a; . ./.env.production; set +a
PGOPTIONS='-c default_transaction_read_only=on' /opt/homebrew/opt/postgresql@17/bin/psql "$DATABASE_URL_PROD"
```

**Mobile builds, Mac terminal**, from `artifacts/bolo-mobile`, one at a time:

```bash
./node_modules/.bin/eas build --platform ios --profile production --non-interactive
./node_modules/.bin/eas build --platform android --profile production --non-interactive
```

Then, after the health check:

```bash
./node_modules/.bin/eas submit --platform ios --latest --non-interactive
./node_modules/.bin/eas submit --platform android --latest --non-interactive
```

**`expo.version` is 1.0.2 and the train is open**: 1.0.1 is in review and 1.0.2
was never submitted. Only `buildNumber` needs to move, and EAS moves it. Note
that **submitting 1.0.2 for review must wait for 1.0.1 to clear**, because App
Store Connect holds one version in review at a time. TestFlight uploads are
unaffected.

---

## 6. Working style

Verdict first, short bullets, **bold the keywords**, no long paragraphs. **No em
dashes, ever**, in chat, commits, comments or app copy. Always paste shell
commands as complete blocks and say which terminal.

**ONE STEP AT A TIME, and it beats every other rule.** End with "Your plate"
naming exactly ONE action, then stop.

**And the step you name must be the REAL next one.** A step that turns out to
need another step first is worse than a list, because it fails silently.

**Check your own command blocks before sending them.** Two this session shipped
with a stray closing tag on the end and failed with a bash syntax error, which
wasted a round trip each time.

**Say when they are wrong, and check before saying it.** Twice this session the
owner reported something that turned out to be correct behaviour, and twice a
production query settled it in under a minute. Read the data before arguing
either way.
