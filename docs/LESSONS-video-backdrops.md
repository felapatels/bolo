# Living video backdrops: what it actually takes

Written 2026-09-02, build 29, for the **Bolo Southeast Asia** build. This is only
about putting looping video behind a scrolling map. Everything here was found by
building it and looking at the result; none of it came out right first time.

The shape that works: **one short clip per zone, still art everywhere, and ONE
film sized to the viewport, playing only while the map is at rest.**

It took three attempts to get to that, and the two rejected ones are in section
3, because the reasons they fail are the useful part.

---

## 1. Derive the still FROM the film, never the other way round

The cross-fade from still to film has to be invisible, and the only reliable way
is for the still to BE the film's first frame, extracted from the encoded clip.

Matching a film to an existing painting was the first attempt and it cannot
work. They are separate generations of the same prompt and never line up: the
composition, the crowd and the light all differ. Frame 0 and the painting were
obviously different pictures.

```bash
ffmpeg -v error -i zone-1.mp4 -frames:v 1 -q:v 3 zone-1-first.jpg
```

That also answers "update the backdrops to the new art" for free, because frame
0 IS the new art.

**Then use that still for EVERY tile**, not just the one that animates. Leaving
the other tiles on the old painting put two completely different pictures in one
zone, stacked, and the owner spotted it instantly.

---

## 2. The film's transform must match the still's exactly

The single most visible bug. The tiles were drawn with `resizeMode="stretch"`
and the film with `contentFit="cover"`.

A 9:16 clip in a 0.633 tile box is **squashed 11% by stretch and cropped 11% by
cover**. So film and still were framed differently, and the boundary between
them showed a change of scale rather than just a change in motion.

**While a film sits BESIDE a still, whatever the stills use the film must use**,
which meant `contentFit="fill"` here. Once the film became full screen no still
was visible next to it, and `cover` became right again because it keeps the art
undistorted. The rule is not "always fill", it is "match whatever it abuts".

Related, and I got it wrong first: **do not size the film to the viewport.**
`cover` on a 9:16 clip in a viewport-tall box zooms it about **1.7x**, so the
film is framed far closer than the still and the cross-fade jumps between two
zoom levels. Size it to the same box the stills are drawn in.

---

## 3. The tile is the wrong unit. Use the viewport

This went through three shapes before it was right, and the ending is the
simplest one.

**One film per tile** is the obvious build and it is wrong: a phone shows about
**1.4 tiles**, so there is always a boundary somewhere on screen, and it reads as
the video "not staying put" every time it re-parks after a scroll.

**A film on every visible tile** fixes the dead strip but not the boundary: two
players on the same clip sit at different frames, so a person is mid-stride on
one side of the line and not the other.

**One film sized to the viewport** is the answer. Nothing else is on screen while
it plays, so there is no boundary to hide and only ONE decoder exists.

**Size it to the viewport exactly, not larger.** A 9:16 clip in a 0.46 screen box
crops **1.22x**, which just reads as slightly closer framing. The same clip in a
box padded with overscan crops **1.7x**, and the film ends up visibly closer than
the still it fades from.

**You cannot blend a film-to-film boundary away, which is why you avoid having
one.** A gradient softens a COLOUR step; two players at different frames put a
person mid-stride on one side of the line, and no fade fixes that.

**And you cannot mask a video cheaply.** `LinearGradient` paints colour; it
cannot make a VideoView transparent. Masking needs `@react-native-masked-view`,
and a native dependency invalidates every installed dev build. Match transforms
or put edges off-screen instead.

---

## 4. Play on IDLE, never on scroll

Mount on `onScrollEndDrag` and `onMomentumScrollEnd`; unmount on
`onScrollBeginDrag`. Both end handlers are needed: a flick ends in momentum, a
slow drag ends without any.

**Why this matters more than it looks.** The equivalent machinery existed on this
screen before and was deleted in build 26 because it did a `runOnJS` hop **per
frame** to feed a state nobody read. The idle version fires **twice per gesture**.

`useVideoPlayer(active ? source : null)` is the whole lifecycle: a false `active`
hands it a null source and **no decoder exists at all**. Six decoders behind a
scrolling map is exactly the load that had `lmkd` killing this screen on Android
before build 26.

Gate the fade on `onFirstFrameRender` or you cross-fade to a black frame.

Animate the fade with `useNativeDriver: false`. In this app that is not a
preference, it is the only thing that ticks in release builds.

---

## 5. Watch the clips before you use them, frame by frame

**Three of six opened on a completely different street for two seconds** before
dissolving into their real scene.

`ffmpeg`'s scene detection found **nothing**, at any threshold, because a
dissolve is not a cut. The only thing that worked was a contact sheet:

```bash
for t in 0 1 2 3 4 5 6 7 8 9; do
  ffmpeg -v error -ss $t -i clip.mp4 -frames:v 1 -vf scale=120:-2 -y f_$t.png
done
```

Ten thumbnails in a row and the lead-in is obvious in a second. Trim past it with
`-ss`, then extract frame 0 from the TRIMMED clip for the still.

---

## 6. Compression: 45MB became 6MB

Untouched, the six clips were 6 to 11MB each. As a backdrop they do not need it.

```bash
ffmpeg -v error -y -ss 2.5 -i in.mp4 -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -vf "scale=720:-2,fps=24" \
  -b:v 1100k -maxrate 1400k -bufsize 2200k \
  -movflags +faststart out.mp4
```

About **1MB per clip, 5.96MB for six.** `-an` matters: a backdrop has no business
making noise, and audio is pure bundle. For scale, 34MB of marketing video was
removed from every build the day before this work started, so 45MB was never
going to be acceptable.

---

## 7. Aspect is a constant in your code, not a requirement

The wide backdrop was 25:11 purely because that was the shape of one file made in
August. **No image or video generator offers that aspect.** Changing one constant
to 16:9 was cheaper than fighting every tool, and the app stretches the art
anyway.

Check which way your generator is actually producing: all six clips came back
**portrait** (720x1280) despite the metadata reading 1920x1080 on one, because of
a rotation transform. Read the true display size with the preferred transform
applied, not the raw stream dimensions.

---

## 8. Prove the motion, do not assume it

A screenshot cannot tell you whether a video is playing. Take two, two seconds
apart, and diff them:

```python
d = ImageChops.difference(a, b)
ImageStat.Stat(d).mean          # ~15 per channel = real motion, ~0 = static
```

Then scan it in row bands to see **which part of the screen is moving**. That is
what proved a single tile was alive while most of the screen was not, and then
that the full-screen version really did cover it: **58 of 66 bands moving,
y=0 to 2360 of 2622**, with the still rows at the bottom being a warning bar
rather than backdrop.

---

## 9. Things that will waste your day

- **The dev client attaches to whatever holds port 8081, even another project's
  Metro.** A `MessageQueue doesn't exist` red box looks like a broken bundle and
  is not. Check `lsof -ti :8081`, then start yours on another port and open
  `yourapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082`.
- **`xcrun simctl ... booted` is ambiguous with two simulators running.** It
  silently picked the iPad while I was checking the phone. Target by UDID.
- **ffmpeg can be installed and still not run.** A missing `libx265` from a
  version-skewed brew formula makes both `ffmpeg` and `ffprobe` die at launch.
  `brew reinstall ffmpeg` rebuilds it against what is present. macOS `mdls` and
  a ten-line AVFoundation Swift tool are usable fallbacks.
- **Metro dies on a syntax error and does not come back.** If the dev client
  shows a greyed-out server entry, your bundler is dead, not your app.
