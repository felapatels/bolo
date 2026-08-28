# Handoff: build 16, and what is in it

Written 2026-08-28 by BOLO BUILD CHAT 15. **Read `CLAUDE.md` first, then this.**

---

## 0. THE STATE OF THE BUILD, IN ONE LINE

**UPDATED 2026-08-28, LATE: THE CALL GATE IS CLOSED.** Server endpoint, both
screens, record/send/play/caption, both agendas, the journey interruption and the
games entry are all done and on `origin/main` at `9443f99f`.

**THE BUILD NOW WAITS ON EXACTLY ONE THING AND IT IS NOT CODE: PUBLISH THE
SERVER.** The call routes are not deployed, so everything verified so far is
against a stub or against a 404 failing gracefully. **The real path has never
completed a single turn.** See section 3b.

Two late owner rulings, both landed: **the games hub call is FREE** (`plusOnly:
false`), and **`GAME_MAX_TURNS` is 10, not 20**. `JOURNEY_QUESTIONS` stays at 5
and the two are independent constants that no code path reads interchangeably.
Ten leaves a beginner wanting another call rather than relieved one ended, which
is the right shape for a feature whose retention story is that he rings again
later.



**Everything below is DONE and verified. The build is held on ONE open item:
Chacha-ji's phone call.** The owner ruled a single build rather than shipping
the finished work first, so nothing goes out until the call goes out.

**THE FIRST TESTFLIGHT BUILD IS NOT A CONFIRMATION, IT IS THE EXPERIMENT, AND IT
SHOULD BE EXPECTED TO NEED A SECOND.** That sentence is the most useful thing
either session wrote today and it belongs at the top. Every part of the call
that can fail is invisible before a store build: **motion is a dev build lying
to us, haptics do not exist in a simulator, the camera renders black there, and
recording and playback have never run in this feature at all.** Nobody should be
surprised when build 16 needs a build 17.

---

## 0b. THE ONE OPEN DEFECT: HE SPEAKS HINDI IN EVERY LANGUAGE

Found by the owner 2026-08-28: *"chachaji is talking in hindi on gujurati game as
well. he should talk in the language selected."* He is right, and it is the last
known defect in the call.

**MOST OF THE CALL IS ALREADY LANGUAGE-AWARE, which is why this is narrow.** The
session carries `languageCode`, `runLiveTurn` takes `languageName` and builds the
live prompt with it, and `ttsPrewarm` caches per language (Hindi is merely warmed
first, everything else synthesises on demand and caches).

**WHAT IS NOT AWARE IS THE TEXT OF THE TWO CANNED BEATS.** `HELLO` and `BYE` in
`chachaCallScript.ts` are single hardcoded Hindi strings, so all 22 languages open
with *"Arre beta! Chacha-ji bol raha hoon"* and close with *"Chalo beta, phir baat
karenge"*. Synthesising that in Gujarati gives Hindi words in a Gujarati voice.

**DO NOT FIX IT BY WRITING 44 TRANSLATED STRINGS.** That is the exact mistake this
repo already carries: all twelve reading passages are `verified: false` because an
agent wrote them with no translation tool and no speaker, and the build prints a
warning naming all twelve on every run. Repeating it for the FIRST AND LAST thing
a learner hears on a call is worse, because those two lines have no surrounding
context to recover from.

**THE SHAPE THAT FITS WHAT IS ALREADY THERE:** generate each language's hello and
bye once, at first use, and cache them beside the audio the way `tts_cache`
already works. Latency is paid on the first call in a language and never again,
which is precisely the trade `CALL_PREWARM_LANGUAGE` documents for the audio. The
canned beats stay canned, so the latency decision they exist for is untouched.

---

## 1. THE OPEN GATE: the call

Owned by the session BOLO CHACHA-JI CALL. The screens are real and verified on
the simulator.

**Items 1 to 3 are DONE PENDING A DEPLOYED SERVER, which is not the same as
done.** The client, the driver hook and the screen are wired and typecheck: it
records, sends, plays, captions and repeats, using the generated client's own
base URL and token getter so nothing can drift. The scripted turns survive behind
`?fake=1` so layout can be judged with no network, but a plain deep link now
takes the real path.

**That real path has never completed a single turn**, because the call routes are
not in production and the dev client points there. See section 3b: publish first.

1. ~~Client to server.~~ Done, hand-rolled fetch since the routes are not in
   `openapi.yaml`. Unproven against a live server.
2. ~~Record the learner.~~ Done, reusing `lib/audio.ts` and its
   `RECORDING_PRESET` rather than writing a fourth recorder.
3. ~~Play his reply.~~ Done, reusing the chat audio registry that mobile already
   consumes progressively through `GET /openai/chat/audio/:streamId`.
4. **Reach it, and IT IS TWO DIFFERENT THINGS.** Owner, 2026-08-28: *"chacha
   ji's phone call game is only accessible from the games page. during the
   journey, the call is an interruption."*

   - **THE GAME.** On the Games page, alongside the other thirteen. The learner
     picks it, deliberately, as often as they like. **No budget and no
     randomness**: you do not ration a game somebody chose to open. What this
     side needs is an ENTRY, a tile in the hub, not a trigger.
   - **THE INTERRUPTION.** During the journey, unsolicited, random, once per
     zone. The committed zone gate (`b6aef67b`) is exactly right for this and
     nothing about it changes: zone 1 at station 3 in all 22 languages, one
     random station per zone after, hashed on learner + language + zone so it
     cannot reroll on a revisit and needs no table. **Nothing calls it yet**, so
     he never rings.

   **The budget belongs to the interruption alone, and that is the whole logic
   of it:** an unrequested call needs rationing and a chosen one does not. This
   handoff previously described the games as a second trigger surface for one
   feature and asked whether the budget governed both. That was my error and the
   questions it raised were malformed.
5. **Five questions.** The agenda is four beats and three learner turns; the
   spec is five. Presumably the game's shape rather than the interruption's.

**DELIBERATELY OUT OF THIS BUILD, and this is a decision rather than an
omission:** Chai, XP, the three-strike version of the GAME, and zone-bounded
difficulty.
All of it is scoring and economy stacked on an interaction nobody has yet heard
work on a device. **The question build 16 answers is whether a call with a one
second gap feels like a call**, and it answers that without a single Chai
changing hands. Shipping the reward layer on an unproven interaction risks having
to unpick both.

**Latency is measured and the feature is viable.** 958 to 1173 ms warm on
`gpt-audio`'s one hop against 1761 to 3207 ms for STT to LLM to TTS, timed to
FIRST AUDIO BYTE, which is the silence the learner sits in. Unmeasured: all of
it was Mac to `api.openai.com`, never from the Repl where it runs. Every turn now
logs `firstAudioMs` for that reason.

---

## 2. What is finished, and what to look at first on the device

### The icon

Cream `#FFFDF0` to pure white `#FFFFFF`, in the three places it lived:
`assets/images/icon.png`, `android.adaptiveIcon.backgroundColor` in `app.json`,
and web's `apple-touch-icon.png`. Her art is untouched; only the background and
the anti-aliased ring around her outline moved, on the original pixels.

**GOOGLE PLAY NEEDS A SEPARATE 512x512 UPLOAD.** iOS reads the icon from the
binary, so it ships automatically. **The Play Console's store listing carries its
own icon and shipping the app does not change it**, so Play keeps showing cream
until someone uploads it by hand. This is the half that gets forgotten.

### Bolo Chat

- **The nav parrot grows on the chat tab**, 58 to 68pt, and its ring reads
  **PRESS & HOLD TO SPEAK**. Deliberately a swap and not an animation: the
  native driver is dead in release builds here, so an eased grow would play in
  the simulator and freeze in the store build.
- **The ring was off-centre by exactly its own border width.** React Native lays
  absolute children against the parent's PADDING box, so an offset derived from
  the bubble's outer size lands one border width out. Measured at +2.50pt
  against a 2.5pt border, before and after.
- **The ring label is centred by a MEASURED correction**, not by arithmetic
  alone. `textAnchor="middle"` does NOT work in react-native-svg here, tested
  and 48 degrees out, so `HOLD_START_CORRECTION` exists and **must be
  re-measured if the wording changes**.
- **Bolo floats and shrinks.** Full size on the empty state; a 76pt perch top
  right once a conversation starts, out of the layout, with the transcript
  running beneath her.
- **The speaking cluster stays centred** when she perches. Status line, sound
  bars and skip button belong to the conversation, not to her.
- **The text input is collapsed until asked for**, expanding to a full bar with
  a send button and a **mute toggle** for typed conversations. Tapping outside
  collapses it, via a backdrop: `onBlur` alone never fires, because RN does not
  blur an input when you tap elsewhere.
- **The chip row crawls after five seconds idle** so the openers off the right
  edge are discoverable. Any interaction stops it.
- **Two notes flank the raised nav button**, the bilingual hint and the way in
  to the memory screen, in the band beside the ring that was empty.
- **The greeting no longer says "hold my belly"**, which stopped being true when
  the instruction moved to the nav button.

### The Chai economy

- **The Resume button says where Chai comes from:** *"Only 6 more stops to go.
  Chai and surprises along the way."* It went on the Chai stall first and the
  owner moved it, correctly: every link on the stall spends or buys, so
  explaining how to EARN on a shop sign answers the question in the wrong room.
  **"Surprises" is deliberate** and covers Chacha-ji's trackside gift, cleared
  signals and capstones, which a learner told only about the zone bonus never
  notices.
- **XP and Chai now appear on all 13 mobile games**, from ONE mount in the games
  Stack, plus a compact Chai pill on practice and review. **Measured before
  building:** mobile had XP on three screens and none of the games, and Chai on
  none of them, so a learner could finish a quiz paying 2 Chai and never watch
  the number move.

### The language picker

Search across English name, native script and code with diacritics folded; a
**RECENT** row; and an unconditional instruction line. **The row is headed
RECENT, not "recently practiced", on purpose:** `/languages` is a flat catalogue
with no per-learner state and nothing reports a last-practised-at, so the honest
fact the device holds is which languages were SWITCHED TO. The true version needs
a server change.

Also fixed: **"Locked languages need All-Access" was false**, and web had already
found and corrected that while mobile never got it. Mobile now says web's exact
words. These two pickers are hand-maintained twins and this is what drift costs.

### The nav bird wears the equipped outfit

It was the only mascot in the app still on a bare undressed pose map, so a
learner who spent Chai on a kurta saw it everywhere except the button they press
most.

### Server side, ships independently of this build

- **Bolo no longer tells anyone where anything is in the app.** The owner found
  him saying "the Bolo Bazaar is on the Home screen too" and called it
  confusing. The licensing block is gone and a prohibition replaces it, **in
  both prompt variants**, plus a rule that this is not a safety topic so it must
  never draw a guardrail deflection.
- **No em dashes in anything he says.** Replies are spoken aloud and a dash is
  not a sound.
- **Verified 0 of 6 on `gpt-5.4-mini`, the model the route actually calls.**

---

## 3. Traps this session paid for

1. **CHECK WHICH MODEL YOU ARE TESTING.** Three rounds of prompt tuning went
   against `gpt-4o-mini` while the route calls `gpt-5.4-mini`. Every "it is
   still wrong" result came from a model the app never speaks to.
2. **A DETECTOR THAT BANS NOUNS INSTEAD OF BEHAVIOUR LIES TO YOU.** Four false
   alarms: it flagged "I can't see your screen" because *screen* was on the
   list, flagged the field echoing the learner's own question, and flagged Bolo
   repeating the learner's word in a clarifying question. Match the shape of a
   direction, not a place name.
3. **MAESTRO'S ID MATCHER WORKS**, contrary to what CLAUDE.md used to say. Only
   the TEXT matcher cannot see RN's tree. It needs a JRE and refuses a
   screenshot path outside its own run folder.
4. **A CLEARANCE CONSTANT BELONGS TO WHATEVER IS FLUSH AGAINST THE THING BEING
   CLEARED, and it does not move when you move an element.** Cost two visible
   gaps in one screen: the chips and the text input were both still dodging the
   raised parrot after the notes took that job.
5. **THE BIRD COVERING THE COPY WAS NEVER THE BIRD'S SIZE.** Two theories and a
   measured clamp all failed; translucent boxes on the screen found it in one
   pass. A 132pt `paddingBottom` meant for scroll views was counted twice and
   `justifyContent: 'center'` spilled the surplus upward.
6. **A SHARED SIMULATOR IS AN UNCONTROLLED VARIABLE**, now CLAUDE.md measurement
   rule 13. Two agents on one device produced a phantom bug report and a phantom
   regression within minutes of each other.
7. **EXPO-ROUTER SCREENS OUTLIVE THE USER'S MENTAL MODEL**, now in CLAUDE.md.
   Reset on FOCUS, not on mount.

---

## 3b. PUBLISH THE SERVER BEFORE THE BUILD, NOT WITH IT

**The call's client half cannot be proven until the server is live.** The dev
client points at the production domain and none of the call routes are deployed,
so answering a real call today returns 404 and ends with "Chacha-ji could not get
through". That is a correct graceful failure, and it is also a wall: **items 1 to
3 of the gate are "done pending a deployed server", which is not the same as
done.**

So the order is **publish, then verify the call against the live server, then cut
the build.** A build cut first would ship a client nobody has ever seen complete
a single real turn.

Two things ride along with that publish and both are wanted:
- **Bolo's prompt changes**: no in-app directions, no em dashes, guardrail lines
  scoped to real safety topics.
- **The parked "Monthly Chai Drop" rename**, if someone wants it in the same
  push. It is one string.

**READ THE GENERATED SQL ON THE PUBLISH SCREEN.** Replit's publish flow diffs dev
against production and generates migrations to make production match dev. It once
generated `DROP TABLE "user_blocks" CASCADE`, it was approved unread, and the
whole social surface 500'd for every learner. The call's zone gate deliberately
needs **no table**, so the migrations step should not appear at all. **Its absence
is the signal that this was done right.**

---

## 4. Before you cut the build

- **`expo.version` is `1.0.5`. Do not touch it.** 1.0.4 is a closed train and
  90186 blocks TestFlight for it, not just release.
- **EAS `autoIncrement` writes the build number back into `app.json`**, so the
  tree goes dirty after a build and the committed number is one behind.
- **Run `eas-cli` from `artifacts/bolo-mobile`, never the repo root**, and
  remember `.easignore` REPLACES `.gitignore` on EAS.
- **Pre-flight every artefact:**
  `node --experimental-strip-types scripts/checkBundleHealth.ts <ipa>`. A
  poisoned build should be rebuilt, not installed.
- **AD-HOC AND PREVIEW BUILDS CRASH 10 OUT OF 10 IN THIS APP** on code a store
  build of the same commit runs perfectly. Do not read anything into one.
- **Run the full suites before cutting.** The owner asked for targeted-only
  during iteration, and that ends here. Web and mobile on the Mac; the api suite
  in the Repl Shell, alone, baseline **1279 tests / 1277 pass / 0 fail**.
- **THREE SESSIONS SHARE THIS TREE.** Stage file by file, `git commit --
  <paths>`, never `git add -A`, and check what you committed in a separate
  command.

---

## 5. Parked

- **"Monthly allowance" should read "Monthly Chai Drop"**, one server-side
  string in `tokenEconomy.ts`, not blocked by this build.
- **The web half of the Chai top bar**, handed to the session working in
  `artifacts/gujarati-coach`. Their CTA span carries `truncate` and will clip the
  new tail exactly as mobile did.
- **A true "recently practiced"** needs a per-language last-practised-at from
  the server.
- **The api-server has still never sent one error to Sentry**, and remains the
  largest invisible risk in the stack.
