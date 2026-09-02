# iPad zone backdrops: six prompts

Written 2026-09-02 for the iPad pass. Six wide zone paintings to replace the
single repeating `zone-wide.jpg` tile.

## Before you generate

- **Output 3840 x 2160 px (16:9), JPEG.** If your tool caps lower, **2560 x 1440**
  also clears what a 13-inch iPad needs in landscape at @2x (2732px).
- **16:9 EXACTLY.** The app draws these with `resizeMode="stretch"` at
  `windowW x windowW * 9/16`, so any other aspect is distorted rather than
  cropped. This brief said 25:11 until 2026-09-02; that was simply the shape of
  the old tile, it turned out to be a shape no generator offers, and the code
  constant was changed to 16:9 rather than the art being forced to match it.
- **Attach `artifacts/bolo-mobile/assets/journey/zone-wide.jpg` as a style
  reference at MODERATE weight.** Prose drifts across six generations. Moderate,
  not maximum, or zones 4 and 6 come back as copies of zone 1.
  **That reference is 25:11, which is NOT the target aspect, and that is fine:**
  it is there for linework, palette and camera height, not for framing. Set the
  output to 16:9 explicitly and do not let the tool inherit the reference's
  shape.
- **It must tile seamlessly top to bottom.** Each zone stacks the image 4 to 5
  times down the page. The bottom edge has to continue into the top edge with no
  visible join. The current tile does this with a ghosted band of figures across
  the top; keep that device.
- **Under ~900KB each**, quality 72 to 78. Six of these replaces one 373KB file
  and adds roughly 5MB to the app bundle.
- Save as `zone-wide-1.jpg` ... `zone-wide-6.jpg` in
  `artifacts/bolo-mobile/assets/journey/`.

**The cities change per language, the art does not.** These six are shared by
every line, so keep them generic. Nothing Delhi-specific, nothing Varanasi-
specific, no recognisable single monument.

---

## 1. Greetings & Manners

> Hand-drawn ink-line storybook illustration. Fine, confident, even-weight black
> linework over flat muted colour with soft cel shading. No photorealism, no 3D
> render, no painterly brushwork. Warm dusk palette: dusty rose and mauve sky,
> ochre, terracotta, cream sand, warm grey-taupe stucco, mid-brown carved wood,
> with teal-green, indigo and saffron as the only saturated accents.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard. Marigold garlands looped along the balconies, paper lanterns
> glowing amber, triangular bunting strung across the street.
> THE SCENE: arrival and welcome. Neighbours meeting in the street, hands folded
> in namaste, a shopkeeper leaning out to wave someone over, an older man
> greeting a younger one, children running through the crowd with a hoop. Warm
> and busy but not chaotic. A few fireworks low in the dusk sky.
> Dozens of small figures in everyday Indian dress, faces simple and friendly.
> NO text, NO lettering, NO signage, NO logos, NO watermark, NO borders.
> SEAMLESSLY TILEABLE VERTICALLY: the bottom edge must continue into the top edge
> so the image can stack repeatedly with no visible seam. 3840x2160, aspect 16:9 EXACTLY.

## 2. Family

> Hand-drawn ink-line storybook illustration. Fine, confident, even-weight black
> linework over flat muted colour with soft cel shading. No photorealism, no 3D
> render, no painterly brushwork. Warm dusk palette: dusty rose and mauve sky,
> ochre, terracotta, cream sand, warm grey-taupe stucco, mid-brown carved wood,
> with teal-green, indigo and saffron as the only saturated accents.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard. Marigold garlands looped along the balconies, paper lanterns
> glowing amber, triangular bunting strung across the street.
> THE SCENE: courtyards and rooftops, three generations together. A grandmother
> on a charpai with a child beside her, a father carrying a small child on his
> shoulders, a mother braiding a daughter's hair on a balcony, washing strung
> between buildings, a family sharing a rooftop meal around a low tray. Quieter
> and more domestic than a market scene. Fewer stalls, more homes and terraces.
> Dozens of small figures in everyday Indian dress, faces simple and friendly.
> NO text, NO lettering, NO signage, NO logos, NO watermark, NO borders.
> SEAMLESSLY TILEABLE VERTICALLY: the bottom edge must continue into the top edge
> so the image can stack repeatedly with no visible seam. 3840x2160, aspect 16:9 EXACTLY.

## 3. Numbers 1-10

> Hand-drawn ink-line storybook illustration. Fine, confident, even-weight black
> linework over flat muted colour with soft cel shading. No photorealism, no 3D
> render, no painterly brushwork. Warm dusk palette: dusty rose and mauve sky,
> ochre, terracotta, cream sand, warm grey-taupe stucco, mid-brown carved wood,
> with teal-green, indigo and saffron as the only saturated accents.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard. Marigold garlands looped along the balconies, paper lanterns
> glowing amber, triangular bunting strung across the street.
> THE SCENE: the counting market. Vendors weighing goods on brass balance scales,
> neatly stacked crates and jute sacks, rows of identical clay pots and brass
> vessels, bundles of bananas hanging in a line, coins and folded notes changing
> hands, a fruit seller holding up fingers to quote a price, a porter counting
> boxes onto a handcart. Repetition and quantity everywhere, things in rows and
> stacks.
> Dozens of small figures in everyday Indian dress, faces simple and friendly.
> NO text, NO lettering, NO signage, NO logos, NO watermark, NO borders, NO
> numerals or digits anywhere in the image.
> SEAMLESSLY TILEABLE VERTICALLY: the bottom edge must continue into the top edge
> so the image can stack repeatedly with no visible seam. 3840x2160, aspect 16:9 EXACTLY.

## 4. Food & Eating

> Hand-drawn ink-line storybook illustration. Fine, confident, even-weight black
> linework over flat muted colour with soft cel shading. No photorealism, no 3D
> render, no painterly brushwork. Warm dusk palette: dusty rose and mauve sky,
> ochre, terracotta, cream sand, warm grey-taupe stucco, mid-brown carved wood,
> with teal-green, indigo and saffron as the only saturated accents.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard. Marigold garlands looped along the balconies, paper lanterns
> glowing amber, triangular bunting strung across the street.
> THE SCENE: the food lane at its busiest. Deep kadhai pans steaming over flame,
> a flat tawa with breads puffing, jalebi coiling into hot oil, a chai wallah
> pouring from height between two steel cups, stacked steel thali plates, cones
> and mounds of bright spice powders in red, turmeric yellow and green, people
> eating standing up at counters, a boy carrying a tray of glasses. Steam and
> warm glow throughout. This is the most appetising and most saturated of the
> six after the festival one.
> Dozens of small figures in everyday Indian dress, faces simple and friendly.
> NO text, NO lettering, NO signage, NO logos, NO watermark, NO borders.
> SEAMLESSLY TILEABLE VERTICALLY: the bottom edge must continue into the top edge
> so the image can stack repeatedly with no visible seam. 3840x2160, aspect 16:9 EXACTLY.

## 5. Everyday Words

> Hand-drawn ink-line storybook illustration. Fine, confident, even-weight black
> linework over flat muted colour with soft cel shading. No photorealism, no 3D
> render, no painterly brushwork. Warm dusk palette: dusty rose and mauve sky,
> ochre, terracotta, cream sand, warm grey-taupe stucco, mid-brown carved wood,
> with teal-green, indigo and saffron as the only saturated accents. This one is
> the CALMEST and least festive of the six: fewer garlands, fewer lanterns lit,
> more daylight than dusk, but the same palette and the same linework.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard.
> THE SCENE: ordinary working life. Cycle rickshaws waiting, a barber shaving a
> customer in a chair on the pavement, a tailor bent over a treadle sewing
> machine, laundry being beaten and hung, a small queue at a bus stop, a man
> reading a folded newspaper on a step, a street dog asleep in a patch of sun,
> someone sweeping. Unhurried, everyday, nobody celebrating anything.
> Dozens of small figures in everyday Indian dress, faces simple and friendly.
> NO text, NO lettering, NO signage, NO logos, NO watermark, NO borders.
> SEAMLESSLY TILEABLE VERTICALLY: the bottom edge must continue into the top edge
> so the image can stack repeatedly with no visible seam. 3840x2160, aspect 16:9 EXACTLY.

## 6. Feelings, the festival finale

> Hand-drawn ink-line storybook illustration. Fine, confident, even-weight black
> linework over flat muted colour with soft cel shading. No photorealism, no 3D
> render, no painterly brushwork. Warm dusk palette pushed to its BRIGHTEST and
> WARMEST of the six: deep indigo-violet night sky, ochre, terracotta, cream
> sand, warm grey-taupe stucco, mid-brown carved wood, with teal-green, indigo
> and saffron accents, plus far more amber lantern glow than the other five.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard. Marigold garlands looped along every balcony, paper lanterns
> glowing amber on every line, triangular bunting strung densely across.
> THE SCENE: the festival finale, the loudest of the six. Full Diwali night.
> Every lamp and lantern lit, rows of small clay diya lamps along every ledge and
> step, intricate rangoli patterns chalked on the ground, people dancing in a
> ring, drummers with dhol, colour powder thrown in the air, the sky full of
> fireworks bursting in gold and white. Joy and noise everywhere.
> Dozens of small figures in everyday Indian dress, faces simple and happy.
> NO text, NO lettering, NO signage, NO logos, NO watermark, NO borders.
> SEAMLESSLY TILEABLE VERTICALLY: the bottom edge must continue into the top edge
> so the image can stack repeatedly with no visible seam. 3840x2160, aspect 16:9 EXACTLY.

---

## Checking them before they ship

Tiling is the one thing that is invisible in a single image and obvious in the
app. Stack any candidate on top of itself in a preview and look at the join
before committing it. A seam repeats four or five times down every zone, so a
bad one is not subtle.
