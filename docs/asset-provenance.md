# India's media: REGION or SHARED

**Written 2026-09-07 by the India session, for the five forks.** India is the
parent, so every fork's art started here. **The forks can hash against India;
they cannot tell a defect from a deliberate share.** That judgement is the only
thing in this file, and it is the thing only India can give.

- **REGION** means no fork should be carrying this. India's place, India's
  elder, India's script, India's rail, India's currency.
- **SHARED** means identical across forks is CORRECT and a sweep must not flag
  it.
- **DEAD** means nothing in either app references it. **Do not commission a
  replacement for a dead file.**

**Granularity is the directory, with named exceptions.** India has **535 media
paths** across web and mobile. Per-file lines would be a document nobody reads
and that goes stale on the next commission; the directory plus its exceptions is
the part that stays true.

---

## HOW TO USE THIS, AND HOW NOT TO

**Count PATHS, not files.** Web (`artifacts/gujarati-coach/public`) and mobile
(`artifacts/bolo-mobile/assets`) carry separately encoded copies of the same
picture, and the mobile one ships inside a binary. Fixing one is half a fix.

**Three different questions, three different answers, and they disagree.**

| the check | what it catches | what it misses |
|---|---|---|
| **filename** | nothing reliable | `bazaar/stationmaster` in Africa hashes as SEA's and depicts a harbour master |
| **hash** | a straight rename, instantly | **a re-encode defeats it completely** |
| **the picture** | everything | needs eyes, so it is slow |

**The hash pass is worth running FIRST and it is cheap.** SEA's
`promo/kopi-pack-1024.png` and India's `promo/chai-pack-1024.png` are byte
identical, sha256 `9d52f710...76ae`, found in one `shasum` with nobody looking
at either picture. **That works only for a straight rename.** Europe's mobile
zone backdrops hash as Europe's own and depict SEA's water world, because they
were re-encoded. **A clean hash sweep is evidence of nothing.**

**Control against the MERGE-BASE, never against India's HEAD.** India has
replaced its screenshot set since the forks were cut, so every fork's inherited
copy now matches nothing and reads as its own work.

---

## REGION. No fork should carry these.

| path | why, where a stranger would get it wrong |
|---|---|
| `bazaar/` (web) and `images/bazaar/` (mobile) | The railway bazaar: `keyart.png`, `welcome.mp4`, `stationmaster.png`, `lineman.png`, `signal-scene.png`, `ticket-scene.png`, `tailor*`. **The spine is a railway and only India's is.** |
| `bazaar/chacha-welcome.mp3` | The elder's voice. Region twice over: the person and the language. |
| `video/chachaji-call.mp4`, `video/chachaji-call-poster.webp` | The uncle's video call. |
| `stall/` (web) and `images/stall/` (mobile) | The chai stall, `kulhad.png` included. **A kulhad is a fired-clay Indian cup**, not a generic vessel. |
| `journey/pass-film.mp4`, `journey/parchment.png`, `journey/steam-wisp.png`, `journey/stall-card.png` | The boarding pass and its steam. Rail again. |
| `journey/maps/*.jpg` | One per language code. Region by definition. |
| `journey/zone-film/` (mobile) | Zone backdrops. **Already found in the wrong fork once.** |
| `splash/` | `welcome-bolo*` opens on the bazaar at dusk; `carriage.svg`, `steam-a.svg`, `steam-b.svg` are a train. |
| `assets/store/` (all of it) | Screenshots, captions, framed Android shots, the 6.5 and 6.9 sets, `promo/chai-pack-1024.png`. **Store art names the app and the language list.** |
| `hero/*.webp`, `screens/*.webp` | Landing and marketing screenshots of India's app. |
| `mascot/outfits/pagdi/` | A pagdi is an Indian turban. |
| `mascot/outfits/station-cap/` | **SEE THE EXCEPTIONS BELOW. This one has been misjudged already.** |
| `branding/` (mobile) | Carries the flag. |
| `scenery/cow.png` | 5 references, live, and unmistakably placed. |

## SHARED. Identical across forks is correct.

| path | why |
|---|---|
| `mascot/*.png` (the bird's poses, front and standard) | **The owner's ruling.** The bird is the product, not the region. |
| `sounds/bands/*.mp3` | `almost`, `good`, `great`, `nocatch`, `perfect`, `retry`. **English band names, and the band vocabulary is engine, not content.** |
| `sounds/squawk*.mp3`, `sounds/tear-sfx.mp3` | Language-neutral SFX. **East Asia kept these deliberately and was right.** |
| `assets/store/fonts/` | Store fonts. |
| `mascot/outfits/pink-beanie2/` | A plain winter beanie. Nothing regional in it. |
| wardrobe source art | The manifest-and-codegen source, not the drawn bird. |
| `favicon-*.png`, `apple-touch-icon.png` | Shape is shared; **the ARTWORK inside is per fork and has been regenerated per fork already.** Treat as shared plumbing with region content. |
| `appstore-badge.svg`, `googleplay-badge.svg` | Apple's and Google's own badges. |

---

## THE EXCEPTIONS. This is the part worth the file.

**`journey/emblem-station.png` is SHARED, and the name is a lie.** Looked at, it
is a **brass pocket compass with a compass rose**. No rail, no place, no script.
Africa reached the same conclusion independently. **Every fork may keep it and a
sweep must not flag it.**

**`mascot/outfits/station-cap/` is REGION, and this OVERTURNS the reading that a
peaked cap serves both a station and a harbour.** Looked at rather than named:
the cap carries **a gold roundel with a steam locomotive on it**. SEA relabelled
this set "Harbour master's cap" and the badge still shows a train. **A fork on
water needs new art, not a new label.** 9 references, so it is live everywhere.

**`mascot/chachaji-wallet-vignette.png` is DEAD.** Zero references in India's web
or mobile source, confirmed by grep across `src`, `app`, `components` and `lib`.
Africa found the same file with the same absence. **Nobody should commission a
replacement for it, in any fork.** Either wire it or delete it; it is India's
call and it is not urgent.

---

## WHAT THIS FILE DOES NOT ANSWER

**It classifies India's tree. It does not audit anybody's fork.** A fork still
has to look at its own copy, because a re-encode makes an inherited picture hash
as its own.

~~**The audio is classified by what it IS, not by what it sounds like.**~~
**CLOSED 2026-09-07. Every clip in `sounds/` was round-tripped through Whisper
and the answer is more interesting than the guess.**

| file | transcript | what it is |
|---|---|---|
| `bands/almost.mp3` | "Almost." | **SPEECH** |
| `bands/good.mp3` | "Good." | **SPEECH** |
| `bands/great.mp3` | "Great." | **SPEECH** |
| `bands/nocatch.mp3` | "Didn't catch that." | **SPEECH** |
| `bands/perfect.mp3` | "Perfect." | **SPEECH** |
| `bands/retry.mp3` | "Try again." | **SPEECH** |
| `squawk_a.mp3` | "Bye bye." | noise |
| `squawk_b.mp3` | "you" | noise |
| `squawk_c.mp3` | "You" | noise |
| `squawk.mp3` | "AHHHH!" | noise |
| `tear-sfx.mp3` | "You" | noise |

**THE BAND CLIPS ARE A VOICE SAYING ENGLISH WORDS, not sound effects.** They stay
SHARED, but the REASON changes and the reason is what a fork needs: they are
shared because **English is the fleet's interface language**, not because they
are language-neutral noise. **The day any fork localises its UI, its six band
clips become REGION for that fork.** Nothing about them is Indian; nothing about
them is neutral either.

**THE METHOD HAS A TRAP AND IT WOULD PRODUCE FALSE REGION FLAGS.** Whisper
HALLUCINATES on short non-speech audio: every squawk and the tear effect came
back with a confident word ("you", "Bye bye", "AHHHH!") and all of them are
0.4 to 0.8 seconds of bird noise. **A returned word is not evidence of speech.**
The tell is the match: a real speech clip returns EXACTLY what its filename
claims, while noise returns generic filler. Read the transcript against the
filename, never on its own.
