# Lessons from Bolo build 29

Written 2026-09-02 for the agent on the **Bolo Southeast Asia** build. Everything
here was paid for once in this session. None of it is theory.

---

## 1. A green test suite was testing a device nobody owns

`jest-expo`'s default window is **750x1334**. `useIsWideScreen()` is
`width > CONTENT_MAX_W`, which is 600. So from the day the iPad content column
landed, **every mobile test rendered the TABLET branch** and the phone path had
no coverage at all. Found by accident, four days later, when a card grew a
wide-screen element and two assertions started finding two of every name.

**Do this first on any fork:** pin the test window to a phone in `jest-setup.js`
and give tests an explicit opt-in for a tablet.

**Two traps inside that fix:**

- A `jest.spyOn` at module scope in setup is **restored after the first test in
  a file**, so later tests silently revert.
- Worse: several suites call `jest.restoreAllMocks()` in their own `beforeEach`,
  which removes a setup-level spy outright. Those files render as tablets while
  appearing configured as phones. **Use a plain assignment to `Dimensions.get`,
  not a mock.** Nothing restores a direct replacement.

**And the honest part: nothing failed when it was fixed.** 162 suites passed
immediately, because the suite barely asserts layout. A green mobile suite says
very little about how a screen looks. That is what the simulator is for.

---

## 2. Hand-maintained twins drift, and the comment lies with them

Web and mobile share no components here. Three separate bugs this session were
**the same bug in two files**, fixed a day apart:

- The mascot's sky clipping on the zone card. Fixed on web, shipped, and the
  owner reported it again the next day on mobile.
- `SCENERY_HALF_W.chaiStall` at 18 against a card 80 wide.
- `STALL_PLACEMENT.laneDxLeft` derived when the stall was a different object.

**When you fix one twin, open the other in the same commit.** And when a comment
says "nothing on her paths does today", treat that as a claim to verify, not a
fact. That exact sentence was false in both files for six builds.

---

## 3. Constants outlive the thing they describe

Build 23 replaced a 37px vector stall with an 80px painted card and left the
placement constants alone. The clearance tests kept passing because they were
proving the OLD footprint fits, and one of them was measuring a lane the product
had abandoned a week earlier.

**A test that is proving the wrong quantity is worse than no test**, because it
buys confidence. When art is replaced, grep for every constant that described it.

---

## 4. Measure the reference before trusting generated data

Script Trace had an order-aware scorer written, tested, and never called; the
shipped game scored area coverage of a font outline, so a scribble passed. The
obvious fix was to turn the strict scorer on everywhere. **Do not.**

Stroke data existed for 11 scripts, but 389 of 482 glyphs were derived from the
FONT. Devanagari happened to have both a font guess and a real hand for the same
48 letters, which made the comparison possible:

```
font agreed with a hand on            0 of 48
disagreed on the STROKE COUNT alone  35 of 48
```

Grading strictly against that reference fails every learner on every letter and
teaches them the font's mistake. **Lenient scoring flatters; a wrong reference
actively teaches wrong.** Gate strict grading to scripts a human actually
authored; `scriptsOnRealData()` already answers that.

---

## 5. Layout bugs are invisible to jsdom, and to reasoning

Four bugs this session were geometry, and **none of them could fail a test**:

- A `%` margin resolves against the container's WIDTH. That equals the intended
  offset only while the painted image is as wide as its box. Give it a definite
  height and `object-contain` letterboxes the content while the offset keeps
  being computed off the full width. Result: 68px of lift inside a 72px band.
- `background-size: cover` sizes against the **root element's own box**. With an
  empty `#root` that box is 8px tall, so a full-bleed boot image painted into a
  sliver and the flat fallback colour filled the screen. It read as a broken
  image for weeks and was pure geometry.
- `flexWrap` lays out in ROWS, and a row is as tall as its tallest child. A short
  card beside a tall one leaves a hole. Moving cards only moves the hole.
- `contentFit: cover` on a 9:16 video in a viewport-tall box zooms it ~1.7x, so a
  cross-fade to a still jumped between two zoom levels.

**Render it and measure it.** Every one of these was found with a browser probe
or a simulator screenshot, and every one had survived a reading of the code.

**And measure PAINTED PIXELS, not element boxes.** A box-based probe reported
PASS on a visibly broken card, because most of a sprite frame is transparent.
Reading the image's alpha bounds off a canvas found the hat cut by 11.1px.

---

## 6. Generated art drifts in both directions

Six zone paintings from one brief. The failures were symmetrical:

- **Reference too weak, or a "quieter" instruction:** the model empties the
  scene and washes out the palette. The word "quieter" cost two regenerations.
- **Reference too strong, or a "do not vary" instruction:** it copies the
  composition and ignores the scene entirely. One prompt about families came
  back with no families in it.

**What finally worked:** lock the palette, density, linework and camera
explicitly; make the differentiating content **mandatory and in the foreground**
as a numbered list; and, since the tool had no reference-weight control, **name
the other images' signature props and forbid them**. Positive instruction alone
does not stop a model reaching for what it just saw.

Naming a prop still does not reliably remove it. A washing line appeared in
three of six after being explicitly excluded from all of them.

---

## 7. Practical asset numbers

- **Video for a background: 45MB of source became 5.96MB.** 720 wide, 24fps,
  ~1.1Mbps, audio stripped. Anything larger is not a feature, it is bundle.
- **Three of six clips opened on a completely different scene** for two seconds
  before dissolving into the real one. `ffmpeg` scene detection found nothing,
  because a dissolve is not a cut. It needed a frame strip and eyes.
- **A tiling backdrop must wrap-blend.** Crop the bottom band off and cross-fade
  it into the top: the output's first row then comes from the row ADJACENT to
  its last, so a stacked copy joins continuously by construction.
- **Derive the still FROM the film, not the other way round.** Matching a video
  to an existing painting cannot work, they are separate generations. Extract
  frame 0 and the cross-fade is byte-identical by construction.
- **Aspect ratios are a code constant, not a requirement.** 25:11 was the shape
  of one old file and no generator offers it. Changing one constant to 16:9 was
  cheaper than fighting every tool.

---

## 8. Performance rules this screen already learned

- **One decoder, only while the map is at rest.** A false `active` hands
  `useVideoPlayer` a null source so no decoder exists at all.
- The zone-tracking machinery was deleted in build 26 because it did a
  `runOnJS` hop **per frame** for a state nobody read. The version that survives
  fires **twice per gesture**.
- `useNativeDriver: false` is the only thing that animates in release builds of
  this app. This is measured, not preference.
- A new native dependency invalidates every installed dev build. A 72pt gradient
  is not worth `@react-native-masked-view`; put the edges off-screen instead.

---

## 9. Operational traps that cost real time

- **The dev client attaches to whatever holds port 8081, and it may be another
  project.** A `MessageQueue doesn't exist` red box looked like a broken bundle
  and was a different app's Metro. Check with
  `lsof -ti :8081` before blaming your code, and start yours on another port.
- **`xcrun simctl ... booted` is ambiguous with two simulators up.** It silently
  picked the iPad while I was checking the phone. Target by UDID.
- **`git fetch origin <branch>` does not move `refs/remotes/origin/<branch>`.**
  It updates FETCH_HEAD only, so a following `git reset --hard origin/main`
  resets to the OLD value and reports success. Use `git fetch origin`.
- **`filter-branch --all` rewrites `refs/remotes/*` too**, destroying git's
  record of what the remote holds and turning a few KB of new commits into a
  171 MB push.
- Replit's publish reports `running` and `promoting` while still serving the old
  bundle. **Verify a deploy by content**, and remember the app is code-split, so
  grep the right chunk: the entry bundle showed zero for strings that were live.

---

## 10. The habit that found most of this

Almost every real bug here was found by **rendering it and measuring**, and
almost every wrong conclusion came from reading the code and reasoning.

Two claims I made from squinting at screenshots were simply wrong: that a stall
overlapped a rail (it cleared by 17px) and that a bird was being cut off (it was
her hat). Both took one arithmetic check to disprove.

**Build the probe.** They are cheap, they outlive the session, and they fail out
loud later. This session left `practice-band-fit.mjs`,
`zone-card-bolo-fit.mjs`, `boot-plate-fills.mjs`, `boot-plate-sequence.mjs` and
`provisional-vs-human-strokes.mjs` behind, and each one exists because a static
check said the code was fine.
