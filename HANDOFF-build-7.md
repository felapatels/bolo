# Handoff: 2026-08-24, the long one

## Name this session BOLO BUILD CHAT 7

Chat 1 was the Android sign-out. 2 built the contribution page. 3 extracted
`lib/script-trace`. 4 was Script Trace end to end plus the story engine. 5 was
the six books and the story stop. **6 was this: the storybook shipped, the
Emergency built, mobile brought to parity, and the Nest moved into the
product.** You are 7. Increment once, at the start, never mid-session.

**Read `CLAUDE.md` first, then this.** Everything below was measured or read out
of source. Where something is unproven it says so.

---

## 1. Where things stand

- **Repo `/Users/aakeshpatel/bolo`, `main`, HEAD `76f14819`, tree clean, pushed.**
- **Twenty-one commits today**, `dd153863` through `76f14819`.
- **Web is DEPLOYED** through the storybook, the Emergency and the Nest gate.
  The last republish predates `4abefc95`, so **the nest summary fix and
  everything after it is NOT live yet**.
- **iOS and Android have NOTHING from today on a device.** iOS build 502 and
  Android 503 both predate all of it. `app.json` is at version 1.0.2,
  buildNumber 502, versionCode **504** (a dev build incremented it).
- There is a **dev build on the owner's iPhone** with Metro attached, which is
  how tonight's device bugs were found.

---

## 2. What shipped today

**The storybook**, on web, iOS and Android. Six books, one per fare zone, 120
stills at 720x1280. The book is a real spread: scribbled words on the left leaf,
the illustration on the right, a 1.5s hold then a slow 2s push until only the
picture is left. Narration on by default, English, one set for all 22 languages.

**The Emergency**, on all three. A flashing EMERGENCY, then a zone-specific
film, then **Beat the Train**: five phrases on a ten-second clock that right
answers push back and wrong answers cost. Fires between stops 8 and 9, draws
nothing on the map, and is also a paid entry in the Games hub at 5, 10 or 20
questions.

**The Nest** at `bolo-india.app/nest`, gated to three Clerk ids, 404 for
everybody else.

**Mobile parity**, including referral redemption, which did not exist at all.

**Entitlements**: Hindi free through fare zone 2, everyone else gets stop 1 plus
the tracing and story tastes at stops 2 and 3.

---

## 3. THE TRAPS, each one cost real time today

**A dev build cannot clear an animation bug, and `CLAUDE.md` says so.** The
storybook zoom looks right on the dev build. That proves nothing about a store
build. Do not let anybody declare it fixed from Metro.

**React Native has no `transform-origin`, and `translateX` takes POINTS, not
percentages.** The book shipped off-centre because both were assumed to work
like CSS. **An invalid transform value is a no-op, not an error**, so the
animation still ran and simply went to the wrong place.

**Every screen in the games stack must supply its own back button AND its own
safe-area inset.** `headerShown: false` is set for the whole stack so the tab
bar stays visible. Both new screens shipped without either, and a back button
under the status bar is painted, present and untappable.

**A new row on the journey map must join TWO things, not one.** The no-`k`
branch, and the `rowPts` filter. Miss the first and Chacha-ji's stalls slide
down the line. Miss the second and the row is **counted but never drawn**, so
"Stop 2 of 4" appears with only three stops on screen, which reads as a
numbering bug rather than a missing feature.

**Every Replit Shell is `~/workspace`.** A whole diagnosis went into a missing
lockfile and a divergent HEAD before the remote revealed the tab was **Cliki**,
not Bolo. Confirm with a marker file: `ls artifacts/gujarati-coach/package.json`.

**NEVER ask for `git remote -v` or `get-url`.** Bolo's remote carried a live
`ghp_` token and asking for it leaked one into a chat. Both classic tokens were
revoked and the remote rewritten clean; there is now a fine-grained token
scoped to Contents on this repo alone.

**ElevenLabs shows the API key ONCE.** The value in `ELEVENLABS_API_KEY` was the
key's **ID** for months, and nothing noticed because `TTS_PROVIDER` is
`gpt-4o-mini-tts` and nothing had called ElevenLabs since that switch. The
storybook narrator was the first thing to try it.

**drizzle's `sql` template treats a raw JS array as CHUNKS, not a parameter.**
`all(${owners})` produced invalid SQL and 500'd in production. Use `sql.join`.

---

## 4. Open, highest value first

1. **Narration is unverified in the real voice.** The key was fixed and the
   deployment needs a republish to pick it up. The response carries a `source`
   field: `narrator` or `fallback`. **A run of `fallback` is the only signal
   the key is wrong**, and a silent downgrade would hide it forever.
2. **`assetlinks.json` needs the Play App Signing SHA-256.** Until then Android
   link verification fails and a referral link opens the browser. iOS is
   complete but **`apple-app-site-association` has no file extension and nobody
   has confirmed the content type the SPA host gives it.** Curl it after deploy.
3. **The API suite has not run in days.** Shell-only, ~368s, and it now covers
   four untested things: `story.book`, `/openai/narrate`, the Nest gate, and the
   widened free-tier policy.
4. **A store build.** The owner's "no iOS builds until the story is done" gate
   is clear. `1.0.0` and `1.0.1` are closed trains: bump `expo.version`, not
   just the build number.
5. **Script Trace lags when drawing, and finishing one has no moment.** Both
   reported on device. See the parked queue.
6. **The production user purge**, fully scoped and nothing deleted. **Export the
   42 phrase reports first**: they are the only learner-side content QA and they
   name specific bad phrases in nine languages.
7. **`tts_cache` is 98% of a database with a 10 GiB ceiling**, growing about
   1 GB a month. Roughly nine months. `purge-stale-tts-cache` exists and appears
   never to have run.
8. **The Nest's group 2**, the operational half. The Cockpit session has the
   page ready and the endpoint contract is built and mounted.

---

## 5. Commands, by terminal

**Deploy web, in the BOLO Replit Shell**, then hit Republish:

```bash
cd /home/runner/workspace && ls artifacts/gujarati-coach/package.json && GIT_EDITOR=true git pull --no-rebase origin main && pnpm install --frozen-lockfile
```

The `ls` is the Repl check. **Never substitute the remote for it.**

**Typecheck and tests, Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

Baselines at `76f14819`: **web 114 suites / 1307 tests**, **mobile 117 / 1183**.

**A new Emergency film**, Mac terminal, then commit:

```bash
ffmpeg -i INPUT.mp4 -vf "scale=720:1280:flags=lanczos" -c:v libx264 -profile:v main -crf 27 -preset slow -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 64k artifacts/gujarati-coach/public/emergency/j1z2.mp4
cd /Users/aakeshpatel/bolo/scripts && npx tsx src/scanEmergencyFilms.ts
```

**Read production, read-only, Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && set -a; . ./.env.production; set +a
PGOPTIONS='-c default_transaction_read_only=on' /opt/homebrew/opt/postgresql@17/bin/psql "$DATABASE_URL_PROD"
```

**Mobile builds, Mac terminal**, from `artifacts/bolo-mobile`, and **`npx eas`
from the repo root fails**:

```bash
./node_modules/.bin/eas build --platform android --profile preview
./node_modules/.bin/eas build --platform ios --profile production
```

**An iOS `preview` build crashes 10 out of 10 no matter what is in it.** Use
`development` for iteration or `production` for truth. Android's APK is fine.

---

## 6. Working style

Verdict first, short bullets, **bold the keywords**, no long paragraphs. **No em
dashes, ever**, in chat, commits, comments or app copy. Always paste shell
commands as complete blocks and say which terminal.

**ONE STEP AT A TIME, and it beats every other rule.** End with "Your plate"
naming exactly ONE action, then stop. Not two, not "and then".

**And the step you name must be the REAL next one.** Today I said "hit
Republish" when the actual next action was a `git pull`, and later a `pull` when
a new workspace package needed `pnpm install` first. A step that turns out to
need another step first is worse than a list, because it fails silently.

**Say when they are wrong.** Twice today a documented prior decision contradicted
a request, and saying so plainly was the right move both times: the owner heard
it and chose anyway, which is how it should go.
