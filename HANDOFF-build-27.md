# Handoff: BOLO Build 27

Written 2026-08-31 by BOLO Build 26. **Read `CLAUDE.md` first, then this.**

**You are BOLO Build 27. Use that exact name as your H1 on every message.**

---

## 0. THE STATE, HONESTLY

- **Everything is committed and pushed.** `origin/main` is in sync. The working
  tree holds only the owner's untracked pagdi source JPEGs and review PNGs.
- **Android 1.0.7 (532) is ON THE PLAY INTERNAL TRACK**, submitted and
  COMPLETED. It carries everything below. The production release that was in
  review was **halted by the owner** at my recommendation, because it contained
  the journey memory bug.
- **iOS 1.0.7 (530) is LIVE on the App Store**, iPhone and iPad. It **predates
  every fix in this session.** iOS and Android are deliberately out of step.
  Anyone reasoning about what an iPhone user sees starts from 530.
- **The Repl has NOT been published this session.** The api-server changes
  (Chacha-ji's call variety) and every web change are sitting in `main`
  unpublished. **That is the biggest single thing outstanding.**
- The web Mascot component change has **never been looked at in a browser**.
  See §3.

## 1. WHAT BUILD 26 SHIPPED

**The storybook fix verified live.** Production returns the alias rows; the
owner's tester confirmed page one. 1.0.6 clients were already fixed by the
server publish, because the route returns the canonical concept key.

**The Android journey no longer kills itself.** Measured on the owner's Galaxy
A17 before and after. `lmkd` was reclaiming Bolo while it was the FOREGROUND app,
twice out of two, about forty seconds in. After: **zero kills, alive past fifty
seconds**, GPU memory 1.65 GB down to 1.17 GB, worst frame 6961ms down to
3500ms. Mechanism: react-native-svg rasterises every `<Svg>` root into a
full-size bitmap and a `<G>` at any opacity but exactly 1 allocates another the
size of the PARENT CANVAS. The comet's dots were animated `<G opacity>` nodes
inside a zone-tall Svg.

**Still not fixed, and it is a plateau not a leak:** Skia's cache is
byte-identical for 35 seconds. The remaining ~1.2 GB is the steady cost of
mounting six zones at once. **The only lever left is windowing.**

**Progress sharing**, both platforms. **Games say why a topic is locked**, with
a fourth state for a plan lock that the device caught me getting wrong.
**Chacha-ji's calls differ** (18-question pool, drawn per call, live goodbye).
**Ticket Check punches by swipe.** **The splash still matches where the film
starts.** **The Nest is two pages** with a rule and a test to keep it current.

**The mascot canvas is 1024x1200**, up from 1024 square, so accessories have
sky. Every sprite moved together. `Mascot` draws taller and pulls up, so **no
layout moved and 128 call sites were untouched.**

**A placement tool**, `pnpm wardrobe place`. See §2.

## 2. THE PLACEMENT TOOL IS THE MAIN NEW THING

`pnpm wardrobe place` from `~/bolo`, then http://localhost:8787. Linked from the
Nest under Consoles with the constraint on the card: it writes into the repo, so
the link is dead unless the tool is running.

- Drag to move, scroll or the slider to resize, slider to turn.
- **A placed pose wins outright.** Both generators skip their automatic seating
  for that pose rather than fighting a deliberate placement.
- Garments get the same drag PLUS their four whole-item knobs.
- **The eraser** rubs Bolo's body out of art that arrived with her painted into
  it (the blue vest has teal in both armholes). Saves a `-cut.png` beside the
  original; the original is never written.

**Three buttons, and the owner asked what they mean, so say it plainly if it
comes up again:** Save writes the manifest. Save & render also runs the
generator so you can see the truth. Save & install also writes the sprites into
both apps, which is the one that changes what ships.

**The pagdi is placed by hand in all five poses** and looks better than anything
the automatic seating managed. Two poses report a 12px plume clip; the owner has
not said whether that matters.

## 3. THE QUEUE

1. **PUBLISH THE REPL.** Chacha-ji's variety and every web change are
   unpublished. Full suites first: api in the Repl Shell, web on the Mac.
   **The web Mascot change has never been seen in a browser** and web publishes
   are how it reaches anyone, so look at it before publishing, especially the
   practice screen's `fill` chain.
2. **Windowing the journey.** The last Android lever. Needs its own measurement.
3. **The vests.** More clothing is coming. Use the tool's eraser.
4. **The XP question**, still the owner's ruling: milestones Chai cannot buy, or
   a capped XP-to-Chai counter.
5. **Chacha-ji's ringtone is a ringback**, the sound after you dial OUT. He
   RINGS the learner, so the audio contradicts the premise. Audio kit is in git.
6. **Nest: every stat drills.** Eleven metrics have a people-drill. Reporters
   now uses it; three Flagged tiles jump to rows on the page instead.
7. **Nest load alerts**, so the owner can tune autoscale. The blocker is that
   the server measures nothing: a green healthz says alive, not keeping up.
8. **Social stats on the Nest.** Blocked on the owner registering a Meta app
   and a TikTok app. Meta is easier: no App Review for your own data.
9. **Diwali free gift.** The binding constraint is the BUILD CALENDAR, not the
   Nest: asset maps are compile time, so the art must ship hidden weeks early.

## 4. TRAPS BUILD 26 PAID FOR

1. **A case-sensitive grep for `activeZone` does not match `setActiveZone`.** I
   used one to "correct" a correct finding and was wrong in front of the owner.
2. **Two meters are not one meter over time.** I read Skia's cache (505 MB)
   against GL mtrack (1.17 GB) and called the difference growth. They were the
   same instant, and one contains the other.
3. **Uninstalling to sideload signs the owner out.** Play-signed and
   upload-key-signed builds can never replace each other, so every Android
   device iteration costs a sign-out or a Play round trip.
4. **The seating REFERENCE art is a second canvas to migrate.** Padding the
   mascot and forgetting the references seats everything by exactly the pad.
5. **Uprighting her to measure the crown finds her WING.** The rotation is
   correct; the largest-component test then picks the wing. Isolating her head
   by COLOUR is the untried idea.
6. **ffmpeg on this Mac is broken** (missing x265 dylib). AVFoundation via a
   15-line Swift file needs nothing installed, and both time tolerances must be
   zero or you get a frame from a second earlier.
7. **Do not reason about the paywall from Hindi.** It is the only language with
   free zone-2 rows. The owner ruled the pricing stays as it is.
8. **A tool nobody has used is not finished.** The owner found flaky dragging,
   no save confirmation and no garment support within minutes of opening it.
