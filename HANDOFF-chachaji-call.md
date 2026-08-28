# Handoff: Chacha-ji's phone call, SERVER HALF

## Name this session BOLO CHACHA-JI CALL

**Not a numbered build chat.** Build chats are `BOLO BUILD CHAT N` and a second
session taking a number would collide with the one already running. Use the plain
name as your H1 on every message.

**Read `CLAUDE.md` first, then this.**

---

## 1. THREE AGENTS ARE IN THIS TREE AT ONCE

`~/bolo` is shared right now by the Nest agent, BOLO BUILD CHAT 15, and you.
Everything below follows from that.

- **Stage file by file. Never `git add -A`, never `git add .`, never an
  exclusion-only pathspec.**
- **Commit with `git commit -- <paths>`.** The index is shared, so a bare
  `git commit` takes whatever the other two have staged.
- **Check what you committed in a SEPARATE command afterwards**, not chained onto
  the commit.
- **Never rewrite history on `main`.** No amend, no reset --hard, no rebase, no
  force push.
- **`git status --porcelain` before every commit**, and expect to see files that
  are not yours. Leave them alone.

**FILES THAT ARE NOT YOURS. Do not open them for writing:**

```
artifacts/bolo-mobile/app/(app)/(tabs)/_layout.tsx    BUILD CHAT 15 is in here
artifacts/bolo-mobile/app/(app)/(tabs)/chat.tsx       BUILD CHAT 15
artifacts/gujarati-coach/src/pages/chat.tsx           BUILD CHAT 15
artifacts/gujarati-coach/src/components/layout/       BUILD CHAT 15
artifacts/api-server/assets/nest-growth.html          the Nest agent
tools/growth-board/                                   the Nest agent
```

---

## 2. WHAT YOU ARE BUILDING, AND WHAT YOU ARE NOT

**Build the SERVER half of the call, and stop there.**

The client half is queued behind four UX items and a **deliberately held mobile
build**. The server half is not blocked by any of that, which is the entire
reason this is a separate session. **Do not build call UI. Do not touch the chat
screens.** Finish with an endpoint that can be exercised by curl and by tests.

**The deliverable:** a route that takes the learner's audio and returns
Chacha-ji's spoken reply, plus whatever session state one call needs, plus tests.

---

## 3. THE ONE CONSTRAINT THAT DECIDES THE FEATURE

**LATENCY. Everything else is detail.**

Chat today is `audio -> STT -> LLM -> TTS`, three hops, and the app's own copy
admits *"My first answer takes a few seconds."* **A call with four second gaps is
a walkie-talkie and the illusion dies.** A conversation the learner is trying to
keep up with cannot wait between turns.

**The way out is already written and nothing calls it:**

```
lib/integrations-openai-ai-server/src/audio/client.ts
  voiceChat(audioBuffer, voice, inputFormat, outputFormat)   audio in, audio out, ONE hop
  voiceChatStream(audioBuffer, voice, inputFormat)           the same, streamed
```

Both target `gpt-audio` with `modalities: ["text", "audio"]`. **Both are dead
code today.** This feature is the reason to wire them up.

**MEASURE THE LATENCY BEFORE BUILDING ANYTHING ON TOP OF IT.** A first turn
against `voiceChatStream`, timed, tells you whether this feature is possible at
all. If it is not, say so and stop, rather than building a walkie-talkie and
calling it a call. The last session in this repo built four things and three of
them failed a control that was cheap to run.

---

## 4. DESIGN CALLS ALREADY MADE. Do not relitigate these.

- **THE CALLER IS CHACHA-JI, NOT BOLO.** The owner considered Bolo, supplied art
  of her holding a phone, and reversed it on 2026-08-28. **Do not propose Bolo.**
- **Semi-scripted, not open.** Chacha-ji has an agenda so the pace can be
  controlled and the turn count is bounded.
- **NO SCORE. He is delighted by anything the learner says.** These learners are
  often shy and a ringing phone you cannot keep up with is already pressure.
- **Answer or ignore, and ignoring means he calls back later.** That is the
  retention shape, and it is deliberately gentler than a streak: a streak
  punishes, a missed call just returns.
- **A call is an EVENT, not a lesson.** Every other speaking surface in Bolo is
  framed as practice. Keeping up is the skill being trained, because real
  conversation does not wait. Do not add correction, scoring or a rubric to it.

---

## 5. WHAT ALREADY EXISTS. Reuse before you write.

- **Chacha-ji is built.** `artifacts/api-server/src/lib/chachaStrings.ts` and
  `chachaEncounters.ts` server-side; `lib/chachaVoice.ts` on BOTH clients
  (`artifacts/bolo-mobile/` and `artifacts/gujarati-coach/src/`, hand-maintained
  twins). He has a voice and a personality and no home.
- **The journey-map interrupter already exists**, and it is the natural place for
  the call to be offered. `chachaEncounters.ts` puts him trackside every fourth
  station (`ENCOUNTER_FIRST_STATION = 3`, `ENCOUNTER_STRIDE = 4`) with one
  `chacha_encounters` row per arrival so a revisit shows the same encounter
  rather than a fresh one. **Adding a kind of encounter is cheaper than inventing
  a new interrupter.**
- **Audio streaming plumbing exists**: `artifacts/api-server/src/lib/
  chatAudioStreams.ts`, and `routes/openai.ts` is the SSE chat route. Read
  `openai.chat-audio-stream.test.ts` for the established shape.
- **Push has live device tokens and nothing sends to them.** `routes/push.ts`
  exposes only `/push/register`. A ringing phone is the first thing that would
  justify that channel, but **it is not part of this handoff** and needs its own
  decision.

---

## 6. TESTS

**PURE API TESTS DO RUN ON THIS MAC**, contradicting CLAUDE.md, which is only
right about the FULL suite:

```
node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks \
  src/lib/<file>.test.ts
```

**Without `--experimental-test-module-mocks`, `mock.module` throws** and suites
fail for reasons that have nothing to do with your code.

- **The FULL api suite needs the dev database and runs in the Repl Shell or
  nowhere.** Baseline **1279 tests, 1277 pass, 0 fail**. A different total is new
  coverage; **a different PASS count is a regression.** Run it alone.
- **Never run the api suite concurrently with the web suite.**
- Typecheck always: `pnpm run typecheck`. A fresh clone runs
  `pnpm run typecheck:libs` first or nothing compiles.

---

## 7. TRAPS THIS REPO HAS ALREADY PAID FOR

1. **`OPENAI_BASE_URL` in `.env` is `localhost:1106`**, a Replit connector that
   does not exist on this Mac. Anything honouring it fails with `http 000`, which
   reads like a network outage and is not one. **Override it** before you time a
   single request.
2. **THERE ARE TWO DATABASES and the Shell is the DEV one.** Never answer a
   question about real data from it. `.env.production` holds `DATABASE_URL_PROD`,
   not `DATABASE_URL`.
3. **IF YOU ADD A TABLE, READ THE MIGRATION RULE IN `CLAUDE.md` IN FULL FIRST.**
   Replit's publish flow diffs dev against production and generates migrations to
   make production match dev. It once generated `DROP TABLE "user_blocks"
   CASCADE`, it was approved unread, and the whole social surface 500'd for every
   learner. Generate the migration, apply it to DEV with `sync-schema`, then
   publish. **A `DROP` is never routine.**
4. **The api-server has never sent one error to Sentry.** Every server-side 500
   this app has ever had has been invisible. Do not trust a quiet dashboard.
5. **Verify by content, never by commit message.** Replit auto-commits and the
   message rarely survives.

---

## 8. WORKING STYLE

Verdict first, short bullets, bold the keywords, **no em dashes anywhere**. Say
which terminal a command runs in and whether it writes. **ONE STEP AT A TIME: end
every message with "Your plate" naming exactly ONE action, then stop.**

**MEASURE, AND CHECK THE INSTRUMENT BEFORE BELIEVING IT.** When a result looks
good, ask what the easy version of the test was.

**Say plainly when you were wrong.** Corrections in this repo have repeatedly
changed what happened next.

---

## 9. YOUR FIRST STEP

**Time one round trip through `voiceChatStream` and report the number**, with
`OPENAI_BASE_URL` overridden. Nothing else gets built until that number exists,
because it decides whether the feature is a call or a walkie-talkie.
