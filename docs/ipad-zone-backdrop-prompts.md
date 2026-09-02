# iPad zone backdrops: six prompts

Written 2026-09-02 for the iPad pass. Six wide zone paintings to replace the
single repeating `zone-wide.jpg` tile.

## Before you generate

- **Output 3840 x 2160 px (16:9), JPEG. Use the LARGEST size your tool offers.**
  If it caps lower, **2752 x 1536** is the floor. About 16% of the height is
  spent on the seam blend before anything is cropped to 16:9, so a 1376x768
  generation ends up around 1150px wide and has to be upscaled 2.4x to fill a
  13-inch. Zone 2's first attempt came back at exactly that size and was too
  soft to sit beside zone 1.
- **16:9 EXACTLY.** The app draws these with `resizeMode="stretch"` at
  `windowW x windowW * 9/16`, so any other aspect is distorted rather than
  cropped. This brief said 25:11 until 2026-09-02; that was simply the shape of
  the old tile, it turned out to be a shape no generator offers, and the code
  constant was changed to 16:9 rather than the art being forced to match it.
- **THE HOUSE STYLE IS `zone-wide-2.jpg`.** The owner chose it on 2026-09-02:
  "I'm fine with this style if we use it for all zones on ipad." It is paler and
  cooler than the August tile, so attach THAT as the reference for every
  remaining zone, and note that zone 1 was generated against the older, warmer
  look and needs redoing to match.
- **Reference weight: LOW to MODERATE, and this needs care in both directions.**
  Too little and the palette washes out and the street empties (zone 2, attempt
  one). Too much and it copies the reference's whole composition and ignores the
  scene you asked for (zone 2, attempt two: same street, same stalls, no
  families anywhere). Attempt three worked with the weight turned down and the
  scene beats made mandatory.
- **The reference is for linework, palette, density and camera height, NOT for
  framing.** Set the output to 16:9 explicitly rather than letting the tool
  inherit the reference's shape.
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
> TAKE FROM THE REFERENCE, AND ONLY THESE: the crowd density (dozens of figures,
> no empty walls, no empty street), the dusk lighting with lit lanterns, the ink
> line weight and contrast, the high aerial camera, the saturation.
> DO NOT COPY THE REFERENCE'S SCENE. The buildings and the street may be the
> same city, but WHAT THE PEOPLE ARE DOING must be visibly, obviously different,
> and the difference must be readable at a glance from across a room.
> THE SCENE: arrival and welcome, and the street is crowded with greetings.
> THESE FIVE MUST APPEAR IN THE FOREGROUND THIRD OF THE IMAGE, drawn large
> enough to read clearly. They are the whole point of this picture and it fails
> without them:
>   1. two people facing each other with hands folded in namaste
>   2. a shopkeeper leaning out of a stall waving someone over
>   3. an older man greeting a younger one, a hand on his shoulder
>   4. two women meeting and clasping hands
>   5. children running through the crowd with a rolling hoop
> Behind them the bazaar continues as busy as ever, with a few fireworks low in
> the dusk sky. If this image could be mistaken for a general market scene, it
> is wrong.
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
> TAKE FROM THE REFERENCE, AND ONLY THESE: the crowd density (dozens of figures,
> no empty walls, no empty street), the dusk lighting with lit lanterns, the ink
> line weight and contrast, the high aerial camera, the saturation.
> DO NOT COPY THE REFERENCE'S SCENE. The buildings and the street may be the
> same city, but WHAT THE PEOPLE ARE DOING must be visibly, obviously different,
> and the difference must be readable at a glance from across a room.
> THE SCENE: families, and the street is crowded with them.
> THESE FIVE MUST APPEAR IN THE FOREGROUND THIRD OF THE IMAGE, drawn large
> enough to read clearly. They are the whole point of this picture and it fails
> without them:
>   1. a grandmother sitting on a charpai with a small child beside her
>   2. a father carrying a child on his shoulders
>   3. a mother braiding her daughter's hair on a balcony
>   4. a family sitting on a rooftop sharing a meal from a low round tray
>   5. lines of washing strung between two balconies
> Behind them the bazaar continues as busy as ever. If this image could be
> mistaken for a general market scene, it is wrong.
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
> TAKE FROM THE REFERENCE, AND ONLY THESE: the crowd density (dozens of figures,
> no empty walls, no empty street), the dusk lighting with lit lanterns, the ink
> line weight and contrast, the high aerial camera, the saturation.
> DO NOT COPY THE REFERENCE'S SCENE. The buildings and the street may be the
> same city, but WHAT THE PEOPLE ARE DOING must be visibly, obviously different,
> and the difference must be readable at a glance from across a room.
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
> TAKE FROM THE REFERENCE, AND ONLY THESE: the crowd density (dozens of figures,
> no empty walls, no empty street), the dusk lighting with lit lanterns, the ink
> line weight and contrast, the high aerial camera, the saturation.
> DO NOT COPY THE REFERENCE'S SCENE. The buildings and the street may be the
> same city, but WHAT THE PEOPLE ARE DOING must be visibly, obviously different,
> and the difference must be readable at a glance from across a room.
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
> with teal-green, indigo and saffron as the only saturated accents.
> Elevated three-quarter aerial view, camera high and looking down, on a pale
> sand-coloured street that winds in an S-curve from the bottom edge of the frame
> back toward a domed archway gateway in the middle distance. Tall carved wooden
> haveli balconies crowd both sides in receding tiers, latticework screens,
> potted plants and clay pots on the rooftops. Striped market awnings in coral,
> teal and mustard.
> TAKE FROM THE REFERENCE, AND ONLY THESE: the crowd density (dozens of figures,
> no empty walls, no empty street), the dusk lighting with lit lanterns, the ink
> line weight and contrast, the high aerial camera, the saturation.
> DO NOT COPY THE REFERENCE'S SCENE. The buildings and the street may be the
> same city, but WHAT THE PEOPLE ARE DOING must be visibly, obviously different,
> and the difference must be readable at a glance from across a room.
> THE SCENE: the same crowded bazaar street, doing ORDINARY WORK. Cycle
> rickshaws waiting, a barber shaving a customer in a chair on the pavement, a
> tailor bent over a treadle sewing machine, laundry being beaten and hung, a
> queue at a bus stop, a man reading a folded newspaper on a step, a street dog
> asleep, someone sweeping. Nobody is celebrating, but the street is just as
> FULL and just as richly lit as the reference. Do NOT empty it out, do NOT
> lighten the palette, do NOT make it daytime.
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
> TAKE FROM THE REFERENCE, AND ONLY THESE: the crowd density (dozens of figures,
> no empty walls, no empty street), the dusk lighting with lit lanterns, the ink
> line weight and contrast, the high aerial camera, the saturation.
> DO NOT COPY THE REFERENCE'S SCENE. The buildings and the street may be the
> same city, but WHAT THE PEOPLE ARE DOING must be visibly, obviously different,
> and the difference must be readable at a glance from across a room.
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
