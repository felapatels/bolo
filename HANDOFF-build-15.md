# Handoff: 2026-08-28

## Name this session BOLO BUILD CHAT 15

**Read `CLAUDE.md` first, then this.** Chat 14 was the last one. 13 was skipped
for bad luck and 14 was a very long session; most of what follows is measurement
rather than code.

---

## 1. THE ONE THING TO DO FIRST

**Talk the owner through the four UX items below and agree an order.** He asked
for exactly that at the end of chat 14 and did not get it, because the session
ran out on the scoring work. **Do not start building any of them until he has
picked.**

Everything here is client UI. **Web publishes immediately; mobile needs a build,
and he has DELIBERATELY HELD mobile builds until all four are done.** So they
ship together or not at all.

1. **Make "what should I do next" impossible to miss.** Home has several
   competing destinations (language card, progress bar, journey, Chai stall,
   chat). Make the current lesson the hero: *"Continue Ganga Line, Stop 5, 10
   phrases, Start."* Everything else supports that one action.
2. **Make speaking dominant in Bolo Chat.** A large, unmistakable press-and-hold
   microphone. **And label the two lines in every reply**, e.g. "Hindi" and
   "English translation", so a beginner knows which one to repeat. The labelling
   half is nearly free and is the part beginners actually need.
3. **Explain the Chai economy before asking anyone to spend.** A compact line
   near the balance: *"Earn Chai by practicing. Spend it on Bolo outfits and
   streak savers."* Keep the balance visible consistently, and **make the first
   cosmetic reward attainable without paying.** He separately asked for **Chai
   and XP in the top bar on every practice and game screen**, which may make the
   explainer unnecessary; raise that before building both.
4. **Language picker: search, "Recently practiced", and a one-line instruction.**
   The state-consistency half of this item is FIXED, see section 4.

---

## 2. What shipped and is live

| commit | what |
|---|---|
| `c24baecf` | The memory screen on WEB. `/account/memories` in openapi, a section on the account page, the disclosure on chat linking to it. |
| `bc4c7054` | **Bodo and Manipuri could never leave the first stop.** Both are `speechCapability: 'unsupported'`, so no attempt row is ever created, so no group could complete and no test-out could be submitted. Both doors were shut. The gate now stands down where speech is unscored. |
| `0468cb29` | 29 Bodo verbs with Devanagari, romanization and native audio. |
| `39cd412f` | The memory screen on MOBILE. Verified on the simulator against the real endpoint. **Not built, waiting on the UX work.** |
| `4bacdc38` | Reference-comparison scoring plus the fusion layer. Wired to nothing. |
| `2ad51d2b` | Rhythm and pitch detectors. Wired to nothing. |
| `75972e13` | The mobile language-sync fix. **Not built.** |

**Published and verified 2026-08-28.** The api gate ran 1279 tests, 1277 pass,
0 fail, exactly as predicted. **One real learner had Bodo active in production**
and was behind that wall.

---

## 3. THE SCORING WORK, AND WHAT IS ACTUALLY TRUE ABOUT IT

**Four scorers exist. One ships. None of the new ones is wired to anything.**

**Read the module headers before touching any of this.** Each carries its own
measurements and its own failures, and they are more reliable than this summary.

- **Transcript rubric** (`routes/openai.ts`), the only one in production. Scores
  the STT transcript, never the audio. The prompt says so: *"the transcript is
  your ONLY evidence: you cannot hear the audio itself."*
- **Reference comparison** (`pronunciationCompare.ts`). MFCC + DTW + vocal tract
  normalisation against a native clip. **Separates cleanly on synthetic tests and
  OVERLAPS BY 12.6 on two genuine takes of the same phrase.** Not ready.
- **Rhythm** (`speechRhythm.ts`). **Failed its control.** Same speaker, connected
  English vs Gujarati: 49.0 against 46.3, where the prediction was a 20 point gap
  and the noise floor is 6.6.
- **Intonation** (`speechPitch.ts`). **PASSED.** Her Gujarati yes/no questions
  against her Gujarati statements: +14.3 vs -2.7 st/s, 83% correct against a 69%
  baseline. **The only new scorer that survived its test.**

**THE RHYTHM RESULT MAY MEAN THE FEATURE IS WRONG, NOT THE CODE.** The premise
was "diaspora learners import English stress-timing". If a learner's English is
Indian English, which is itself more syllable-timed, **there is nothing to
import and nothing to catch.** Settling that needs connected speech from a
native British or American English speaker. Do not spend more on rhythm first.

**`voiceChat` on `gpt-audio` exists in
`lib/integrations-openai-ai-server/src/audio/client.ts` and NOTHING CALLS IT.**
It is audio in, audio out, one hop instead of three. It is the answer to several
things at once and it keeps coming up.

---

## 4. Fixed in chat 14, and the part deliberately left

**A language choice that failed to save was silently reverted on the next
launch** (`75972e13`). `pushRemote` swallowed its error, react-query does not
retry mutations, and reconciliation then adopted the account's older value. An
unsynced flag in AsyncStorage now lets the local choice win and retry.

**The visible flicker at startup is NOT fixed and that was a decision.** Mobile
shows the stored language while waiting on the network and can then flip. It is
a second or two, it self-corrects, and fixing it means holding the UI back until
both settle. That trades a flicker for a blank screen. **It is almost certainly
what the owner's screenshot caught, so expect him to raise it again.**

**Web does not have the bug and is the better implementation.** Mobile should
probably borrow web's failure toast: *"Couldn't save that. Check your connection
and tap your language again."*

---

## 5. The audio, and the format that makes it usable

**All of it is in the session scratchpad and NONE of it is in the repo.** Where
authored audio should live is an open decision; everything else in the app is
TTS synthesised into the R2 cache.

**Held on disk:** 29 labelled Bodo clips, 42 Kashmiri reference clips (two takes
each), 42 Manipuri word clips, and connected speech in Hindi, Tamil x2, Gujarati
and English.

**THE RECORDING FORMAT IS THE REUSABLE PART, and the owner solved it.** A **BELL
between items** beats silence outright. Silence detection has to judge a
continuous variable and failed completely on two files; a bell is an event.
Detection is on **spectral concentration, not loudness** — a high-pass filter
alone catches sibilants, but a bell's energy sits in one narrow bin while a /s/
spreads. His Kashmiri file came back as 21 items with zero manual work, bell
length varying by 40 milliseconds across the whole recording.

**Provenance matters and one rule is absolute.** The Bodo contributor asked
**never to be named** in code, commits, docs or anything shipped. Permission for
the material is given; the name is not. Assume the same for any other
contributor until told otherwise.

---

## 6. Traps this session paid for

1. **PURE API TESTS DO RUN ON THIS MAC**, contradicting CLAUDE.md, which is only
   right about the FULL suite. `node --import tsx --test --test-concurrency=1
   --experimental-test-module-mocks src/lib/<file>.test.ts`. **Without that last
   flag `mock.module` throws** and suites fail for reasons unrelated to the code.
   346 tests, 331 pass, every failure a missing env var.
2. **`OPENAI_BASE_URL` in `.env` is `localhost:1106`**, a Replit connector that
   does not exist on the Mac. Scripts that honour it fail with `http 000`, which
   reads like a network outage and is not one. Override it.
3. **`.env.production` holds `DATABASE_URL_PROD`, not `DATABASE_URL`.**
   Production is a public Neon endpoint and psql is installed, so production
   queries work from the Mac. The Repl Shell and the Mac's `.env` are both DEV.
4. **JOURNEY 1 IS 58 PHRASES ACROSS SEVEN ZONES**, not twelve. `family`,
   `numbers`, `food`, `everyday` and `feelings` are empty for every language.
   Hindi has 128, Assamese 70, Gujarati 62, everything else 58.
5. **A CLEAN RATIO IS NOT ALIGNMENT.** 110 audio spans for 55 cues looked like
   perfect 2-per-item pairing; transcribing the even positions matched for 13
   items and then drifted. Some items split into three, others merged into one,
   and it averaged out. Verify alignment by content, never by count.
6. **WHISPER RENDERS UNSUPPORTED LANGUAGES IN ARBITRARY SCRIPTS.** The same Bodo
   clip came back in Gujarati, Thai, Devanagari, Japanese kana and Latin across
   runs, with the PHONETICS STABLE each time. That stability is the evidence.
   **Do not grep for Latin text** — a search for the English cues reported 0 of
   29 present when all 29 were there.
7. **A SILENT CLIP SCORED 100** in the first version of the comparison scorer. A
   relative energy floor cannot catch silence, because everything is silent
   relative to itself.

---

## 7. Parked

- **Chacha-ji rings you like FaceTime.** The owner's idea and the best product
  idea of the session. Answer or ignore; ignore and he calls back later. Blocked
  on latency, which is what `gpt-audio` would solve. Full reasoning is in the
  memory `bolo-chachaji-phone-call-idea`.
- **`%V` in the rhythm module reports 63 to 71% where real speech is nearer 45%.**
  Known, unfixed, secondary.
- **The api-server has never sent one error to Sentry.** Recorded in CLAUDE.md,
  still true, and still the largest invisible risk in the stack.
- **Web has no silent-hold guard.** Its recorder has no audio level detection at
  all, so the hallucination fix that shipped on mobile has no equivalent there.

---

## 8. Working style

Verdict first, short bullets, bold the keywords, **no em dashes anywhere**. Say
which terminal a command runs in and whether it writes. **ONE STEP AT A TIME:
end with "Your plate" naming exactly ONE action, then stop.**

**MEASURE, AND CHECK THE INSTRUMENT BEFORE BELIEVING IT.** Chat 14 built four
things and three of them failed a control that was cheap to run. Every one of
those failures was caught before it reached a learner, and two of them were
caught only because the owner supplied real recordings instead of synthetic
ones. **When a result looks good, ask what the easy version of the test was.**

**Say plainly when you were wrong.** Chat 14 was wrong about the api suite being
unrunnable, about the Kashmiri content being bad, about which file segmentation
would work on, about rhythm's material versus its detector, and about web's
language reconciliation. Correcting each one changed what happened next.
